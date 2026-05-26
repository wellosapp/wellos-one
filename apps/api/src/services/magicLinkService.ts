// Magic Link Token service — PR 8a of the Geofence Auto Check-in epic.
//
// Bearer-token foundation for unauthenticated client surfaces. The geofence
// check-in flow (PR 8b) mints tokens with purpose='geofence_check_in' at
// booking time, sends the raw token to the client (via email/SMS in Epic 8),
// and the PWA presents it as `Authorization: Bearer <raw>` on each call.
// The 'manage_booking' purpose is reserved for a future manage-flow revival.
//
// Conventions:
//   - Raw token never persisted. mintToken returns the raw token alongside
//     the persisted row; only the SHA-256 digest lives in `tokenHash`.
//   - At least one of (clientId, classBookingId, appointmentId) must be set.
//     Enforced both here (MagicLinkScopeMissingError) and via the DB CHECK
//     constraint as a safety net.
//   - Lifecycle tracked via `revokedAt` + `expiresAt`. Successful verification
//     bumps `useCount` and `lastUsedAt` — these fields ARE the audit trail
//     (no separate AuditLog rows for magic-link operations at MVP).
//   - All queries scoped by tenant where the caller knows the tenant (revoke).
//     verifyToken looks up by global-unique tokenHash because the token IS
//     the credential — knowing it proves tenant scope.

import type {
  MagicLinkToken,
  Client,
  ClassBooking,
  Appointment,
  IntakeFormSubmission,
  IntakeFormDefinition,
} from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import { generateToken, hashToken } from '../lib/tokenCrypto.js';

// Keep in sync with the magic_link_token_purpose_check CHECK constraint in
// prisma/migrations/20260526023000_magic_link_token/migration.sql and the
// PR 6 expansion in
// prisma/migrations/20260526200000_forms_lifecycle_and_magic_link_form_purpose/migration.sql.
// Adding a new value requires both a new migration that broadens the
// constraint AND adding to this union.
export type MagicLinkPurpose =
  | 'geofence_check_in'
  | 'manage_booking'
  | 'form_submission';

// ---------- Typed errors ----------

export class InvalidTokenError extends Error {
  code = 'INVALID_TOKEN' as const;
  constructor() {
    super('Invalid token');
    this.name = 'InvalidTokenError';
  }
}

export class TokenExpiredError extends Error {
  code = 'TOKEN_EXPIRED' as const;
  constructor() {
    super('Token expired');
    this.name = 'TokenExpiredError';
  }
}

export class TokenRevokedError extends Error {
  code = 'TOKEN_REVOKED' as const;
  constructor() {
    super('Token revoked');
    this.name = 'TokenRevokedError';
  }
}

export class TokenPurposeMismatchError extends Error {
  code = 'TOKEN_PURPOSE_MISMATCH' as const;
  expected: MagicLinkPurpose;
  actual: string;
  constructor(expected: MagicLinkPurpose, actual: string) {
    super(`Token purpose '${actual}' does not match expected '${expected}'`);
    this.name = 'TokenPurposeMismatchError';
    this.expected = expected;
    this.actual = actual;
  }
}

export class MagicLinkScopeMissingError extends Error {
  code = 'MAGIC_LINK_SCOPE_MISSING' as const;
  constructor() {
    super(
      'At least one of clientId, classBookingId, appointmentId, or intakeFormSubmissionId must be set',
    );
    this.name = 'MagicLinkScopeMissingError';
  }
}

// ---------- mintToken ----------

export interface MintTokenArgs {
  tenantId: string;
  purpose: MagicLinkPurpose;
  expiresAt: Date;
  scope: {
    clientId?: string;
    classBookingId?: string;
    appointmentId?: string;
    intakeFormSubmissionId?: string;
  };
}

export interface MintTokenResult {
  /**
   * Raw token to send to the client. NEVER persist this — only the hash
   * lives in the DB. Caller must transmit via secure channel (HTTPS body
   * or email/SMS link).
   */
  rawToken: string;
  token: MagicLinkToken;
}

// Accepts either the top-level extended client or a transaction client so
// callers can mint atomically alongside other writes (e.g. the public class
// booking flow mints inside the Serializable booking transaction).
export async function mintToken(
  prisma: ExtendedPrismaClient | ExtendedTransactionClient,
  args: MintTokenArgs,
): Promise<MintTokenResult> {
  const { tenantId, purpose, expiresAt, scope } = args;

  if (
    !scope.clientId &&
    !scope.classBookingId &&
    !scope.appointmentId &&
    !scope.intakeFormSubmissionId
  ) {
    throw new MagicLinkScopeMissingError();
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);

  const token = await prisma.magicLinkToken.create({
    data: {
      tenantId,
      clientId: scope.clientId ?? null,
      classBookingId: scope.classBookingId ?? null,
      appointmentId: scope.appointmentId ?? null,
      intakeFormSubmissionId: scope.intakeFormSubmissionId ?? null,
      tokenHash,
      purpose,
      expiresAt,
    },
  });

  return { rawToken, token };
}

// ---------- verifyToken ----------

export interface VerifyTokenArgs {
  rawToken: string;
  /** Pass to enforce purpose match. Throws TokenPurposeMismatchError on mismatch. */
  expectedPurpose?: MagicLinkPurpose;
}

export interface VerifyTokenResult {
  token: MagicLinkToken;
  // Eagerly-loaded scope entities (whichever are set).
  client: Client | null;
  classBooking: ClassBooking | null;
  appointment: Appointment | null;
  /**
   * Eager-loaded with `definition` so the PR 7 form renderer can read
   * `intakeFormSubmission.definition.schema` without a second round-trip.
   */
  intakeFormSubmission:
    | (IntakeFormSubmission & { definition: IntakeFormDefinition })
    | null;
}

export async function verifyToken(
  prisma: ExtendedPrismaClient,
  args: VerifyTokenArgs,
): Promise<VerifyTokenResult> {
  const { rawToken, expectedPurpose } = args;

  // Shape guard — middleware should already have validated this via
  // parseBearerToken, but defend in case a non-middleware caller forgets.
  if (!rawToken || rawToken.length !== 64) {
    throw new InvalidTokenError();
  }

  const tokenHash = hashToken(rawToken);

  const token = await prisma.magicLinkToken.findUnique({
    where: { tokenHash },
  });

  if (!token) {
    throw new InvalidTokenError();
  }

  if (token.revokedAt !== null) {
    throw new TokenRevokedError();
  }

  if (token.expiresAt.getTime() < Date.now()) {
    throw new TokenExpiredError();
  }

  if (expectedPurpose && token.purpose !== expectedPurpose) {
    throw new TokenPurposeMismatchError(expectedPurpose, token.purpose);
  }

  // Atomic use-count bump. We await the update so the caller sees the
  // refreshed counters; downstream observability (Sentry, metrics) reads
  // `useCount` directly from the returned row when needed.
  const updated = await prisma.magicLinkToken.update({
    where: { id: token.id },
    data: {
      useCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });

  // Load scoped entities. Soft-delete extension filters automatically for
  // Client / ClassBooking / Appointment if the underlying row is in the
  // soft-deleted set. (ClassBooking is NOT in SOFT_DELETE_MODELS so it
  // returns regardless; Client and Appointment ARE — caller should treat
  // a null scope entity as "scope row is gone, token is stale".)
  //
  // For purpose='form_submission' (PR 6+) we also eager-load the submission
  // joined to its IntakeFormDefinition so the PR 7 renderer can read
  // `intakeFormSubmission.definition.schema` directly.
  const [client, classBooking, appointment, intakeFormSubmission] =
    await Promise.all([
      updated.clientId
        ? prisma.client.findFirst({ where: { id: updated.clientId } })
        : Promise.resolve(null),
      updated.classBookingId
        ? prisma.classBooking.findFirst({ where: { id: updated.classBookingId } })
        : Promise.resolve(null),
      updated.appointmentId
        ? prisma.appointment.findFirst({ where: { id: updated.appointmentId } })
        : Promise.resolve(null),
      updated.intakeFormSubmissionId
        ? prisma.intakeFormSubmission.findFirst({
            where: { id: updated.intakeFormSubmissionId },
            include: { definition: true },
          })
        : Promise.resolve(null),
    ]);

  return {
    token: updated,
    client,
    classBooking,
    appointment,
    intakeFormSubmission,
  };
}

// ---------- revokeToken ----------

export async function revokeToken(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; tokenId: string },
): Promise<void> {
  const existing = await prisma.magicLinkToken.findFirst({
    where: { id: args.tokenId, tenantId: args.tenantId },
  });

  if (!existing || existing.revokedAt !== null) {
    // Idempotent — not-found and already-revoked both no-op.
    return;
  }

  await prisma.magicLinkToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
}

// ---------- purgeExpiredTokens ----------

const DEFAULT_GRACE_DAYS = 30;

/**
 * Cron-callable in Epic 8. Deletes tokens that have been expired for
 * more than the grace period (default 30 days — long enough for forensic
 * audit, short enough to keep the table small).
 */
export async function purgeExpiredTokens(
  prisma: ExtendedPrismaClient,
  args?: { graceDays?: number },
): Promise<{ purged: number }> {
  const graceDays = args?.graceDays ?? DEFAULT_GRACE_DAYS;
  const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);
  const result = await prisma.magicLinkToken.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  return { purged: result.count };
}
