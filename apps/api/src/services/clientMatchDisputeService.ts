import { Prisma } from '@prisma/client';
import type { Appointment, Client, ClientMatchStrength } from '@prisma/client';

import type { ExtendedPrismaClient } from '../db/client.js';
import type {
  DisputeMatchBody,
  ListDisputedMatchesQuery,
  ResolveDisputedMatchBody,
} from '../schemas/clientMatch.js';
import { getNextClientNumber, isClientNumberRace } from './clientService.js';

// Domain layer for the "Not You?" dispute flow + staff queue resolution
// (docs/04-booking-flow.md §B + "Client Recognition — The 'Not You?'
// Escape Hatch"). PR 2 of 3 — schema landed in PR 1; the public booking
// match resolver lives in Agent A's PR.
//
// Tenant scoping: every read/write passes tenantId. The Appointment row's
// own tenantId is used as the source of truth — callers supply tenantId
// and we 404 (not 403) on cross-tenant probes.
//
// Audit log actions (this service writes these — keep in sync with the
// admin queue's staffReviewedAt derivation in listDisputedMatches):
//   client.created
//   appointment.match_disputed
//   appointment.match_disputed_resolved
//   appointment.match_dispute_dismissed
//   appointment.match_dispute_resolved

const DISPUTE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes from createdAt.

// Action strings that "count" as a staff review of an appointment. Used
// both for `staffReviewedAt` derivation in the admin queue and for the
// includeResolved filter.
const STAFF_REVIEW_ACTIONS = [
  'appointment.match_dispute_dismissed',
  'appointment.match_dispute_resolved',
] as const;

// Domain error envelope. Routes map .code → HTTP status.
export class ClientMatchDisputeError extends Error {
  readonly code:
    | 'NOT_FOUND'
    | 'ALREADY_DISPUTED'
    | 'WINDOW_EXPIRED'
    | 'EMAIL_MISMATCH'
    | 'INVALID_TARGET_CLIENT'
    | 'NOT_DISPUTED_OR_AMBIGUOUS';
  readonly field?: string;

  constructor(
    code: ClientMatchDisputeError['code'],
    message: string,
    field?: string,
  ) {
    super(message);
    this.name = 'ClientMatchDisputeError';
    this.code = code;
    this.field = field;
  }
}

// ----------------------------------------------------------------------
// Public dispute flow
// ----------------------------------------------------------------------

export type DisputeMatchResult =
  | { branch: 'i_am_new'; appointmentId: string; newClientId: string }
  | { branch: 'wrong_person'; appointmentId: string; status: 'flagged_for_staff' };

/**
 * Handles the "This isn't me" button on the booking confirmation card.
 *
 * The route layer is responsible for tenant resolution (we accept tenantId
 * directly). This service enforces the dispute-window + idempotency
 * preconditions — see ClientMatchDisputeError codes.
 */
export async function disputeAppointmentMatch(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    appointmentId: string;
    body: DisputeMatchBody;
    now?: Date;
  },
): Promise<DisputeMatchResult> {
  const { tenantId, appointmentId, body } = args;
  const now = args.now ?? new Date();

  // Pre-flight: validate appointment + window outside the write tx so the
  // common "already disputed" / "window expired" cases never open a txn.
  const appointment = await prisma.appointment.findFirst({
    where: { tenantId, id: appointmentId },
    select: {
      id: true,
      tenantId: true,
      clientId: true,
      createdAt: true,
      clientMatchDisputed: true,
      // Booking-time email lives on the attached Client (the public
      // booking flow uses the guest email to resolve-or-create that
      // Client). We compare against client.email rather than carrying a
      // separate snapshot field on Appointment.
      client: { select: { email: true } },
    },
  });
  if (!appointment) {
    // 404 covers both "doesn't exist" and "wrong tenant" — same response
    // body either way to avoid leaking existence.
    throw new ClientMatchDisputeError(
      'NOT_FOUND',
      'Appointment not found.',
    );
  }
  if (appointment.clientMatchDisputed) {
    throw new ClientMatchDisputeError(
      'ALREADY_DISPUTED',
      'This appointment has already been flagged. A staff member will follow up.',
    );
  }
  if (now.getTime() - appointment.createdAt.getTime() >= DISPUTE_WINDOW_MS) {
    throw new ClientMatchDisputeError(
      'WINDOW_EXPIRED',
      'This appointment can no longer be disputed online. Please contact the business directly.',
    );
  }

  if (body.branch === 'wrong_person') {
    return prisma.$transaction(async (tx) => {
      const before = { clientMatchDisputed: false };
      const after = { clientMatchDisputed: true, branch: 'wrong_person' as const };

      await tx.appointment.update({
        where: { id: appointment.id },
        data: { clientMatchDisputed: true },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: null,
          actorType: 'system',
          action: 'appointment.match_disputed',
          entityType: 'appointment',
          entityId: appointment.id,
          before: before as unknown as Prisma.InputJsonValue,
          after: after as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        branch: 'wrong_person',
        appointmentId: appointment.id,
        status: 'flagged_for_staff',
      };
    });
  }

  // branch === 'i_am_new' — Zod superRefine already guarantees newClient.
  const newClient = body.newClient!;
  const submittedEmail = newClient.email.trim();
  const bookingEmail = appointment.client.email?.trim() ?? '';
  if (!bookingEmail || bookingEmail.toLowerCase() !== submittedEmail.toLowerCase()) {
    // Don't let a public caller pivot the appointment onto an arbitrary
    // new email. Staff can do that from the admin queue ("Reassign to
    // client"). Public surface is constrained to the same email.
    throw new ClientMatchDisputeError(
      'EMAIL_MISMATCH',
      'The email you provided must match the email used to book this appointment.',
      'newClient.email',
    );
  }

  // Capture stable values before entering the closure — TS doesn't carry
  // null-narrowing of `appointment` through the nested function scope.
  const appointmentId_ = appointment.id;
  const oldClientId = appointment.clientId;

  // Retry once on the (tenantId, clientNumber) unique-constraint race —
  // mirrors clientService.ts.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await runIamNewTransaction();
    } catch (err) {
      if (attempt === 0 && isClientNumberRace(err)) continue;
      throw err;
    }
  }
  throw new Error('disputeAppointmentMatch: exhausted retries unexpectedly');

  async function runIamNewTransaction(): Promise<DisputeMatchResult> {
    return prisma.$transaction(async (tx) => {
      const clientNumber = await getNextClientNumber(tx, tenantId);
      const created = await tx.client.create({
        data: {
          tenantId,
          clientNumber,
          firstName: newClient.firstName.trim(),
          lastName: newClient.lastName?.trim() || null,
          email: submittedEmail,
          phone: newClient.phone?.trim() || null,
        },
        select: { id: true } satisfies Prisma.ClientSelect,
      });

      // Audit: client.created (system actor — no staff signed in).
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: null,
          actorType: 'system',
          action: 'client.created',
          entityType: 'client',
          entityId: created.id,
          before: Prisma.JsonNull,
          after: {
            id: created.id,
            tenantId,
            clientNumber,
            firstName: newClient.firstName.trim(),
            lastName: newClient.lastName?.trim() || null,
            email: submittedEmail,
            phone: newClient.phone?.trim() || null,
            source: 'dispute.i_am_new',
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.appointment.update({
        where: { id: appointmentId_ },
        data: {
          clientId: created.id,
          clientMatchDisputed: true,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: null,
          actorType: 'system',
          action: 'appointment.match_disputed_resolved',
          entityType: 'appointment',
          entityId: appointmentId_,
          before: { clientId: oldClientId } as unknown as Prisma.InputJsonValue,
          after: {
            clientId: created.id,
            branch: 'i_am_new',
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        branch: 'i_am_new',
        appointmentId: appointmentId_,
        newClientId: created.id,
      };
    });
  }
}

// ----------------------------------------------------------------------
// Admin queue
// ----------------------------------------------------------------------

export type DisputedMatchRow = {
  appointmentId: string;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  state: Appointment['state'];
  matchStrength: ClientMatchStrength | null;
  clientMatchDisputed: boolean;
  client: {
    id: string;
    firstName: Client['firstName'];
    lastName: Client['lastName'];
    email: Client['email'];
    phone: Client['phone'];
  };
  // Latest staff-review timestamp (dismiss or resolve). Null if the row
  // has never been touched by staff — that's the queue's working set.
  staffReviewedAt: Date | null;
  createdAt: Date;
};

export type ListDisputedMatchesResult = {
  rows: DisputedMatchRow[];
  nextCursor: string | null;
};

export async function listDisputedMatches(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    query: ListDisputedMatchesQuery;
  },
): Promise<ListDisputedMatchesResult> {
  const { tenantId, query } = args;
  const { cursor, limit, includeResolved } = query;

  // Where: every appointment in the tenant that is currently disputed
  // OR was flagged ambiguous by the matcher. The "resolved" filter below
  // is derived from AuditLog, not from a column — see staffReviewedAt.
  const where: Prisma.AppointmentWhereInput = {
    tenantId,
    OR: [
      { clientMatchDisputed: true },
      { matchStrength: 'ambiguous' },
    ],
  };

  // Cursor pagination — ordered by createdAt DESC, id DESC. cuids are
  // monotonically increasing-ish but not strictly ordered, so we sort by
  // both. Take +1 to detect a next page without a follow-up COUNT.
  const rows = await prisma.appointment.findMany({
    where,
    select: {
      id: true,
      scheduledStartAt: true,
      scheduledEndAt: true,
      state: true,
      matchStrength: true,
      clientMatchDisputed: true,
      createdAt: true,
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  // Derive staffReviewedAt for each row from AuditLog. One query for the
  // whole page; map back by entityId. We treat the latest dismiss-or-
  // resolve row as the review timestamp; if the appointment was disputed
  // and then re-disputed (admin re-flag), the LATEST staff action still
  // wins for queue purposes — staff can re-open by un-resolving via the
  // resolve endpoint with action='reassign_to_client' or by ignoring the
  // queue entry.
  const pageIds = rows.map((r) => r.id);
  const reviewByEntity = await loadStaffReviewMap(prisma, {
    tenantId,
    appointmentIds: pageIds,
  });

  const decorated = rows.map<DisputedMatchRow>((r) => ({
    appointmentId: r.id,
    scheduledStartAt: r.scheduledStartAt,
    scheduledEndAt: r.scheduledEndAt,
    state: r.state,
    matchStrength: r.matchStrength,
    clientMatchDisputed: r.clientMatchDisputed,
    client: r.client,
    staffReviewedAt: reviewByEntity.get(r.id) ?? null,
    createdAt: r.createdAt,
  }));

  // includeResolved=false hides rows that BOTH have clientMatchDisputed=
  // false (no longer flagged) AND have a staff-review audit row (already
  // dismissed or already reassigned). Rows still flagged but already
  // touched stay in the queue so staff can finish the work.
  const visible = includeResolved
    ? decorated
    : decorated.filter(
        (r) => r.clientMatchDisputed || r.staffReviewedAt === null,
      );

  let nextCursor: string | null = null;
  // Use the raw page (not the filtered view) for cursor math — pagination
  // proceeds through the underlying ordering even if some rows are hidden
  // by includeResolved.
  if (decorated.length > limit) {
    const lastIncluded = decorated[limit - 1];
    nextCursor = lastIncluded?.appointmentId ?? null;
  }
  const trimmed = visible.slice(0, limit);

  return { rows: trimmed, nextCursor };
}

async function loadStaffReviewMap(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; appointmentIds: string[] },
): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (args.appointmentIds.length === 0) return out;

  const audit = await prisma.auditLog.findMany({
    where: {
      tenantId: args.tenantId,
      entityType: 'appointment',
      entityId: { in: args.appointmentIds },
      action: { in: [...STAFF_REVIEW_ACTIONS] },
    },
    select: { entityId: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }],
  });
  for (const row of audit) {
    if (!out.has(row.entityId)) out.set(row.entityId, row.createdAt);
  }
  return out;
}

// ----------------------------------------------------------------------
// Admin resolve
// ----------------------------------------------------------------------

export type ResolveDisputedMatchResult = {
  appointmentId: string;
  action: 'dismiss' | 'reassign_to_client';
  // For reassign: the new clientId now attached. For dismiss: unchanged.
  clientId: string;
};

export async function resolveDisputedMatch(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    appointmentId: string;
    body: ResolveDisputedMatchBody;
  },
): Promise<ResolveDisputedMatchResult> {
  const { tenantId, actorUserId, appointmentId, body } = args;

  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findFirst({
      where: { tenantId, id: appointmentId },
      select: {
        id: true,
        clientId: true,
        clientMatchDisputed: true,
        matchStrength: true,
      },
    });
    if (!appointment) {
      throw new ClientMatchDisputeError(
        'NOT_FOUND',
        'Appointment not found.',
      );
    }
    // Queue contract: only rows currently disputed OR currently ambiguous
    // are resolvable. Anything else means the queue UI is showing stale
    // data — return a stable error so the client can refresh.
    if (
      !appointment.clientMatchDisputed &&
      appointment.matchStrength !== 'ambiguous'
    ) {
      throw new ClientMatchDisputeError(
        'NOT_DISPUTED_OR_AMBIGUOUS',
        'This appointment is not currently in the disputed/ambiguous queue.',
      );
    }

    if (body.action === 'dismiss') {
      const before = {
        clientMatchDisputed: appointment.clientMatchDisputed,
        matchStrength: appointment.matchStrength,
      };
      await tx.appointment.update({
        where: { id: appointment.id },
        data: { clientMatchDisputed: false },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          actorType: 'user',
          action: 'appointment.match_dispute_dismissed',
          entityType: 'appointment',
          entityId: appointment.id,
          before: before as unknown as Prisma.InputJsonValue,
          after: {
            clientMatchDisputed: false,
            // matchStrength left as-is for audit per spec.
            matchStrength: appointment.matchStrength,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return {
        appointmentId: appointment.id,
        action: 'dismiss',
        clientId: appointment.clientId,
      };
    }

    // action === 'reassign_to_client' — Zod superRefine already enforces
    // targetClientId presence.
    const targetClientId = body.targetClientId!;
    const target = await tx.client.findFirst({
      where: { tenantId, id: targetClientId },
      select: { id: true, deletedAt: true },
    });
    if (!target || target.deletedAt) {
      throw new ClientMatchDisputeError(
        'INVALID_TARGET_CLIENT',
        'Target client not found in this tenant.',
        'targetClientId',
      );
    }

    const oldClientId = appointment.clientId;
    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        clientId: target.id,
        clientMatchDisputed: false,
      },
    });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        actorType: 'user',
        action: 'appointment.match_dispute_resolved',
        entityType: 'appointment',
        entityId: appointment.id,
        before: {
          clientId: oldClientId,
          clientMatchDisputed: appointment.clientMatchDisputed,
        } as unknown as Prisma.InputJsonValue,
        after: {
          clientId: target.id,
          clientMatchDisputed: false,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      appointmentId: appointment.id,
      action: 'reassign_to_client',
      clientId: target.id,
    };
  });
}
