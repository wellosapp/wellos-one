import { randomBytes } from 'node:crypto';

import { Prisma } from '@prisma/client';
import type {
  Appointment,
  Client,
  MagicLinkPurpose,
  MagicLinkToken,
  Service,
  Staff,
} from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';

// Magic-link tokens — public unauthenticated client surface
// (docs/04-booking-flow.md Flow D/E + Client Recognition).
//
// Tokens are random 32-byte base64url strings minted server-side. They are
// NOT signed JWTs — the DB row is the source of truth. The schema docstring
// on MagicLinkToken spells this out.
//
// Sliding 24h expiry: verifyAndRefreshMagicLink bumps expiresAt forward on
// every successful open. lastUsedAt is informational only and never
// invalidates a still-fresh token.
//
// Email send is stubbed via console.info in this PR — real Postmark wiring
// ships in Epic 8. The waitlistService cancellation hook is the precedent.

export const MAGIC_LINK_TTL_HOURS = 24;

const MAGIC_LINK_TTL_MS = MAGIC_LINK_TTL_HOURS * 60 * 60 * 1000;

const FALLBACK_APP_URL = 'http://localhost:3002';

function publicAppBaseUrl(): string {
  const fromEnv = process.env.APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return FALLBACK_APP_URL;
}

if (!process.env.APP_URL && process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.warn(
    '[magic-link] APP_URL is not set; falling back to %s. Magic-link URLs will be wrong.',
    FALLBACK_APP_URL,
  );
}

/**
 * Standard error envelope thrown by verifyAndRefreshMagicLink. Routes map
 * .code → HTTP status:
 *   NOT_FOUND        → 404
 *   EXPIRED / REVOKED → 410 (gone)
 *   PURPOSE_MISMATCH → 400
 */
export class MagicLinkError extends Error {
  readonly code: 'NOT_FOUND' | 'EXPIRED' | 'REVOKED' | 'PURPOSE_MISMATCH';
  constructor(args: {
    code: 'NOT_FOUND' | 'EXPIRED' | 'REVOKED' | 'PURPOSE_MISMATCH';
    message?: string;
  }) {
    super(args.message ?? args.code);
    this.name = 'MagicLinkError';
    this.code = args.code;
  }
}

export type MintMagicLinkArgs = {
  tenantId: string;
  purpose: MagicLinkPurpose;
  /** Required when purpose === 'manage_booking'. */
  appointmentId?: string;
  /** Required when purpose === 'claim_account'. May also be set when
   *  purpose === 'manage_booking' to associate the link with a client. */
  clientId?: string;
  recipientEmail: string;
};

export type MintedMagicLink = {
  tokenId: string;
  token: string;
  expiresAt: Date;
  publicUrl: string;
};

/**
 * Mint a new magic-link token. Runs inside the caller-provided transaction
 * so the INSERT serializes with the audit row write — that mirrors the
 * existing audit-log convention in appointmentService.
 *
 * Side effects:
 *   - Writes a magic_link_tokens row.
 *   - Writes an AuditLog action='magic_link.minted' inside the same tx.
 *   - Stubs email send via console.info — Epic 8 wires the real Postmark
 *     dispatch behind packages/notifications.
 */
export async function mintMagicLink(
  tx: ExtendedTransactionClient,
  args: MintMagicLinkArgs,
): Promise<MintedMagicLink> {
  const { tenantId, purpose, appointmentId, clientId, recipientEmail } = args;

  if (purpose === 'manage_booking' && !appointmentId) {
    throw new Error(
      'mintMagicLink: appointmentId is required for purpose=manage_booking',
    );
  }
  if (purpose === 'claim_account' && !clientId) {
    throw new Error(
      'mintMagicLink: clientId is required for purpose=claim_account',
    );
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);

  const row = await tx.magicLinkToken.create({
    data: {
      tenantId,
      token,
      purpose,
      appointmentId: appointmentId ?? null,
      clientId: clientId ?? null,
      recipientEmail,
      expiresAt,
    },
    select: { id: true, token: true, expiresAt: true },
  });

  await tx.auditLog.create({
    data: {
      tenantId,
      actorUserId: null,
      actorType: 'system',
      action: 'magic_link.minted',
      entityType: 'magic_link_token',
      entityId: row.id,
      before: Prisma.JsonNull,
      after: {
        purpose,
        appointmentId: appointmentId ?? null,
        clientId: clientId ?? null,
        recipientEmail,
        expiresAt: row.expiresAt.toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  const publicUrl = `${publicAppBaseUrl()}/manage/${row.token}`;

  // Email send is stubbed pending Epic 8. Logged so staff can trace the
  // intended recipient in the API logs while developing the UI.
  // eslint-disable-next-line no-console
  console.info(
    '[magic-link] would send to %s for %s → %s',
    recipientEmail,
    purpose,
    publicUrl,
  );

  return {
    tokenId: row.id,
    token: row.token,
    expiresAt: row.expiresAt,
    publicUrl,
  };
}

// Wire shape selected from the appointment for the manage view. First-name-
// only on staff + client is a privacy choice (the magic link is bearer auth;
// don't leak last names to anyone who happens to receive the URL).
const APPOINTMENT_FOR_MANAGE_SELECT = {
  id: true,
  tenantId: true,
  state: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  staffId: true,
  serviceId: true,
  clientId: true,
  service: { select: { id: true, name: true, durationMinutes: true } },
  staff: { select: { firstName: true } },
  client: { select: { firstName: true } },
  tenant: {
    select: {
      bookingCancellationWindowHours: true,
      bookingCancellationFeeCents: true,
    },
  },
} satisfies Prisma.AppointmentSelect;

export type AppointmentDetailForManage = Prisma.AppointmentGetPayload<{
  select: typeof APPOINTMENT_FOR_MANAGE_SELECT;
}>;

export type ClientForClaim = Pick<Client, 'id' | 'tenantId' | 'firstName'>;

export type VerifiedMagicLink = {
  tokenRow: MagicLinkToken;
  appointment: AppointmentDetailForManage | null;
  client: ClientForClaim | null;
};

/**
 * Look up a token by its string value, throw on failure, slide expiresAt
 * forward on success.
 *
 * expectedPurpose lets callers fail-fast on a token being used against the
 * wrong route family (e.g. a claim_account token hitting /manage/:token).
 *
 * Side effects on success:
 *   - Updates last_used_at = now() (informational; never invalidates).
 *   - Updates expires_at = max(expires_at, now() + 24h) — sliding window.
 */
export async function verifyAndRefreshMagicLink(
  prisma: ExtendedPrismaClient,
  token: string,
  expectedPurpose: MagicLinkPurpose,
): Promise<VerifiedMagicLink> {
  const row = await prisma.magicLinkToken.findUnique({
    where: { token },
  });
  if (!row) {
    throw new MagicLinkError({
      code: 'NOT_FOUND',
      message: 'Magic link not found.',
    });
  }
  if (row.revokedAt) {
    throw new MagicLinkError({
      code: 'REVOKED',
      message: 'This link has been revoked.',
    });
  }
  const now = new Date();
  if (row.expiresAt <= now) {
    throw new MagicLinkError({
      code: 'EXPIRED',
      message: 'This link has expired.',
    });
  }
  if (row.purpose !== expectedPurpose) {
    throw new MagicLinkError({
      code: 'PURPOSE_MISMATCH',
      message: 'This link is for a different action.',
    });
  }

  const slidExpiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS);
  const nextExpiresAt =
    slidExpiresAt > row.expiresAt ? slidExpiresAt : row.expiresAt;

  const refreshed = await prisma.magicLinkToken.update({
    where: { id: row.id },
    data: {
      lastUsedAt: now,
      expiresAt: nextExpiresAt,
    },
  });

  // Load the associated entity (appointment or client) under the token's
  // tenantId. The token is globally unique, but every downstream query is
  // tenant-scoped from this point.
  let appointment: AppointmentDetailForManage | null = null;
  if (refreshed.appointmentId) {
    appointment = await prisma.appointment.findFirst({
      where: {
        tenantId: refreshed.tenantId,
        id: refreshed.appointmentId,
      },
      select: APPOINTMENT_FOR_MANAGE_SELECT,
    });
  }

  let client: ClientForClaim | null = null;
  if (refreshed.clientId) {
    client = await prisma.client.findFirst({
      where: { tenantId: refreshed.tenantId, id: refreshed.clientId },
      select: { id: true, tenantId: true, firstName: true },
    });
  }

  return { tokenRow: refreshed, appointment, client };
}

/**
 * Kill switch — set revokedAt + revokedReason. The route layer can call this
 * inside its own transaction so audit + token revocation commit together.
 *
 * No audit row is written here; the caller writes its own action-specific
 * audit row alongside the revocation.
 */
export async function revokeMagicLink(
  tx: ExtendedTransactionClient,
  tokenId: string,
  reason: string,
): Promise<void> {
  await tx.magicLinkToken.update({
    where: { id: tokenId },
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });
}

// Helper re-exports so the route layer doesn't have to import from prisma.
export type { Appointment, Service, Staff };
