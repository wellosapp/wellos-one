import { Prisma } from '@prisma/client';
import type {
  ClassBooking,
  ClassWaitlistEntry,
} from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import { rosterBroadcast } from '../lib/rosterBroadcast.js';
import { mintToken } from './magicLinkService.js';

// Domain layer for class bookings + waitlist (Phase 3a of the Classes epic).
//
// The critical correctness piece is `createBookingOrWaitlist`. Two admins
// clicking "book the last seat" simultaneously must serialize so exactly one
// wins; the loser gets either a waitlist offer (if the class template allows
// it) or a CLASS_FULL error. We achieve this with a Prisma $transaction at
// Serializable isolation that begins with `SELECT ... FOR UPDATE` on the
// class_instances row — this row lock pairs with the count-then-insert below
// to make capacity check + booking insert an atomic step.
//
// Idempotency: every create call carries an `idempotencyKey`. We probe for
// an existing row by (tenant_id, idempotency_key) BEFORE entering the
// transaction so re-submits don't hold the row lock. The unique index in
// the migration is the server-side safety net.
//
// Audit log: every state-changing call writes a `class_booking.*` or
// `class_waitlist.*` row inside the same transaction so reporting / event
// streams see consistent history.
//
// Phase 3c — cancelBooking now auto-promotes the next 'waiting' waitlist
// entry into a confirmed booking with a 24h expiresAt window, all inside the
// same Serializable transaction. It also records a `_isLateCancel` flag on
// the cancel audit row based on the tenant's bookingCancellationWindowHours
// (informational only — no fee logic until Epic 6 / Stripe).
//
// Deferred work:
//   - payment_id stays null until Epic 6 (Stripe) lands
//   - SMS/email notifications on booking + cancel + waitlist + auto-promote
//     (Epic 8)

// ---------- Typed errors → route layer maps to 409s with `code` ----------

export class ClassFullError extends Error {
  code = 'CLASS_FULL' as const;
  constructor() {
    super('Class is at capacity and waitlist is not enabled.');
    this.name = 'ClassFullError';
  }
}

export class WaitlistFullError extends Error {
  code = 'WAITLIST_FULL' as const;
  constructor() {
    super('Waitlist is at capacity.');
    this.name = 'WaitlistFullError';
  }
}

export class ClassInstanceNotBookableError extends Error {
  code = 'INSTANCE_NOT_BOOKABLE' as const;
  state: string;
  constructor(state: string) {
    super(`Instance is ${state} and not bookable.`);
    this.name = 'ClassInstanceNotBookableError';
    this.state = state;
  }
}

export class DuplicateBookingError extends Error {
  code = 'DUPLICATE_BOOKING' as const;
  constructor() {
    super('Client already has an active booking for this instance.');
    this.name = 'DuplicateBookingError';
  }
}

export class ClassInstanceNotFoundError extends Error {
  code = 'INSTANCE_NOT_FOUND' as const;
  constructor() {
    super('Class instance not found.');
    this.name = 'ClassInstanceNotFoundError';
  }
}

export class ClientNotFoundError extends Error {
  code = 'CLIENT_NOT_FOUND' as const;
  constructor() {
    super('Client not found for this tenant.');
    this.name = 'ClientNotFoundError';
  }
}

export class BookingNotFoundError extends Error {
  code = 'BOOKING_NOT_FOUND' as const;
  constructor() {
    super('Class booking not found.');
    this.name = 'BookingNotFoundError';
  }
}

export class WaitlistEntryNotFoundError extends Error {
  code = 'WAITLIST_ENTRY_NOT_FOUND' as const;
  constructor() {
    super('Waitlist entry not found.');
    this.name = 'WaitlistEntryNotFoundError';
  }
}

export class BookingAlreadyCancelledError extends Error {
  code = 'BOOKING_ALREADY_CANCELLED' as const;
  constructor() {
    super('Booking is already cancelled or completed.');
    this.name = 'BookingAlreadyCancelledError';
  }
}

export class WaitlistEntryNotPromotableError extends Error {
  code = 'WAITLIST_ENTRY_NOT_PROMOTABLE' as const;
  state: string;
  constructor(state: string) {
    super(`Waitlist entry is ${state} and cannot be promoted.`);
    this.name = 'WaitlistEntryNotPromotableError';
    this.state = state;
  }
}

// Phase 4 — check-in lifecycle errors. Mapped to 409 by the route layer.
export class BookingNotCheckInEligibleError extends Error {
  code = 'BOOKING_NOT_CHECK_IN_ELIGIBLE' as const;
  state: string;
  constructor(state: string) {
    super(`Booking in state '${state}' is not eligible for check-in.`);
    this.name = 'BookingNotCheckInEligibleError';
    this.state = state;
  }
}

export class BookingNotRevertibleError extends Error {
  code = 'BOOKING_NOT_REVERTIBLE' as const;
  state: string;
  constructor(state: string) {
    super(`Booking in state '${state}' cannot be reverted.`);
    this.name = 'BookingNotRevertibleError';
    this.state = state;
  }
}

export class BookingNotNoShowEligibleError extends Error {
  code = 'BOOKING_NOT_NO_SHOW_ELIGIBLE' as const;
  state: string;
  constructor(state: string) {
    super(`Booking in state '${state}' is not eligible for no-show.`);
    this.name = 'BookingNotNoShowEligibleError';
    this.state = state;
  }
}

// ---------- Shared select shapes ----------

const CLASS_BOOKING_SAFE_FIELDS = {
  id: true,
  tenantId: true,
  classInstanceId: true,
  clientId: true,
  bookedAt: true,
  paymentId: true,
  state: true,
  checkInMethod: true,
  checkedInAt: true,
  checkedInByStaffId: true,
  // Phase 4 — visual indicator only, separate from `state`.
  late: true,
  cancellationReason: true,
  cancellationInitiatedBy: true,
  cancelledAt: true,
  idempotencyKey: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClassBookingSelect;

const CLASS_WAITLIST_SAFE_FIELDS = {
  id: true,
  tenantId: true,
  classInstanceId: true,
  clientId: true,
  position: true,
  joinedAt: true,
  promotedAt: true,
  expiresAt: true,
  state: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClassWaitlistEntrySelect;

const CLIENT_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.ClientSelect;

const BOOKING_WITH_CLIENT_SELECT = {
  ...CLASS_BOOKING_SAFE_FIELDS,
  client: { select: CLIENT_SUMMARY_SELECT },
} satisfies Prisma.ClassBookingSelect;

const WAITLIST_WITH_CLIENT_SELECT = {
  ...CLASS_WAITLIST_SAFE_FIELDS,
  client: { select: CLIENT_SUMMARY_SELECT },
} satisfies Prisma.ClassWaitlistEntrySelect;

export type ClassBookingWithClient = Prisma.ClassBookingGetPayload<{
  select: typeof BOOKING_WITH_CLIENT_SELECT;
}>;
export type ClassWaitlistEntryWithClient =
  Prisma.ClassWaitlistEntryGetPayload<{ select: typeof WAITLIST_WITH_CLIENT_SELECT }>;

// Phase 3c will offer waitlist entries an expiresAt window (default 24h) so
// the promoted client has time to accept. We mirror that here for manual
// promote so the schema invariant holds even before auto-promote lands.
const MANUAL_PROMOTE_EXPIRY_HOURS = 24;

// ---------- Audit ----------

type ClassBookingAuditAction =
  | 'class_booking.created'
  | 'class_booking.cancelled'
  | 'class_booking.checked_in'
  | 'class_booking.late_toggled'
  | 'class_booking.no_show'
  | 'class_booking.revert_check_in'
  | 'class_waitlist.joined'
  | 'class_waitlist.promoted'
  | 'class_waitlist.auto_promoted';

// `before` / `after` accept either a raw ClassBooking / ClassWaitlistEntry row
// (the common case) or a plain object (used by cancelBooking to attach an
// `_isLateCancel` flag alongside the row snapshot).
type AuditJsonRow =
  | ClassBooking
  | ClassWaitlistEntry
  | Record<string, unknown>;

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    // Null when the action originates from the login-free public /book
    // surface (Phase 3b). The audit row then records actorType='system'
    // (mirrors apps/api/src/services/appointmentService.ts).
    actorUserId: string | null;
    action: ClassBookingAuditAction;
    entityType: 'class_booking' | 'class_waitlist_entry';
    entityId: string;
    before?: AuditJsonRow | null;
    after?: AuditJsonRow | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: args.actorUserId ? 'user' : 'system',
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      before: args.before
        ? (args.before as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      after: args.after
        ? (args.after as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

// ---------- Public result types ----------

export type BookingOrWaitlistResult =
  | {
      kind: 'booking';
      booking: ClassBooking;
      /**
       * Raw magic-link bearer token for the geofence check-in flow. Populated
       * ONLY when the caller passes `mintCheckInToken: true` (the public
       * /book flow) AND the result is a confirmed booking. Admin-side
       * createBooking callers leave the flag default-false and receive null
       * — admin-created bookings get checked in manually via Phase 4.
       *
       * Caller surfaces this to the PWA in the booking response; the raw
       * token is NEVER persisted server-side (only its SHA-256 hash lives
       * in magic_link_token.tokenHash).
       */
      geofenceCheckInToken: string | null;
    }
  | { kind: 'waitlist'; entry: ClassWaitlistEntry };

export type RosterResponse = {
  bookings: ClassBookingWithClient[];
  waitlist: ClassWaitlistEntryWithClient[];
};

// ---------- createBookingOrWaitlist ----------

/**
 * Book a client into a class instance OR put them on the waitlist.
 *
 * Race safety: we open a Serializable $transaction and immediately
 * `SELECT ... FOR UPDATE` the class_instances row. That lock blocks any
 * concurrent booking attempt against the same instance until this
 * transaction commits/rolls back, so the count-then-insert step is atomic
 * even under contention.
 *
 * Idempotency: re-submitting with the same idempotency key returns the
 * existing booking unchanged. The (tenant_id, idempotency_key) unique
 * index enforces it server-side as well.
 *
 * Returns a tagged union — callers use `result.kind` to decide which arm
 * to render ("booked" vs "added to waitlist position N").
 */
export async function createBookingOrWaitlist(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    /** Null for the login-free public /book Classes flow (Phase 3b). */
    actorUserId: string | null;
    instanceId: string;
    clientId: string;
    idempotencyKey: string;
    /**
     * When true and the result is a confirmed booking, mint a magic-link
     * bearer token (purpose='geofence_check_in') scoped to (clientId,
     * classBookingId) with TTL = scheduledEndAt + 30 minutes, and return
     * the raw token alongside the booking. The PWA stores the raw token
     * in localStorage and sends it on each geofence check-in request.
     *
     * Defaults to false so admin-side bookings don't get tokens (admins
     * check clients in manually). Set to true only from the public /book
     * route per docs/specs/geofence-check-in-epic.md PR 8b.
     */
    mintCheckInToken?: boolean;
  },
): Promise<BookingOrWaitlistResult> {
  const mintCheckInToken = args.mintCheckInToken ?? false;

  // Idempotency probe OUTSIDE the lock. If this key already booked, return
  // the existing row without engaging the row lock. We do NOT re-mint a
  // token on idempotent replay — the original booking's token (if any) is
  // still live; if the caller lost it, they can re-mint via a future
  // dedicated endpoint (deferred).
  const existing = await prisma.classBooking.findUnique({
    where: {
      tenantId_idempotencyKey: {
        tenantId: args.tenantId,
        idempotencyKey: args.idempotencyKey,
      },
    },
  });
  if (existing) {
    return { kind: 'booking', booking: existing, geofenceCheckInToken: null };
  }

  return await prisma.$transaction(
    async (tx) => {
      // 1. Lock the instance row. Includes tenant_id in the predicate so a
      //    cross-tenant guess can't gain a lock on someone else's row.
      //    scheduled_end_at comes along for the geofence token TTL when the
      //    public flow requests one (PR 8b).
      const lockedRows = await tx.$queryRaw<
        Array<{
          id: string;
          tenant_id: string;
          class_id: string;
          state: string;
          capacity_override: number | null;
          scheduled_end_at: Date;
        }>
      >`
        SELECT id, tenant_id, class_id, state, capacity_override, scheduled_end_at
        FROM class_instances
        WHERE id = ${args.instanceId} AND tenant_id = ${args.tenantId}
        FOR UPDATE
      `;
      const instance = lockedRows[0];
      if (!instance) {
        throw new ClassInstanceNotFoundError();
      }
      if (instance.state !== 'scheduled') {
        throw new ClassInstanceNotBookableError(instance.state);
      }

      // 2. Validate client belongs to caller's tenant (soft-delete extension
      //    auto-filters deletedAt).
      const client = await tx.client.findFirst({
        where: { id: args.clientId, tenantId: args.tenantId },
        select: { id: true },
      });
      if (!client) {
        throw new ClientNotFoundError();
      }

      // 3. Duplicate active-booking guard. Partial unique index in SQL is
      //    the safety net; this read produces a clean typed error.
      const dup = await tx.classBooking.findFirst({
        where: {
          classInstanceId: args.instanceId,
          clientId: args.clientId,
          state: { in: ['confirmed', 'checked_in'] },
        },
        select: { id: true },
      });
      if (dup) {
        throw new DuplicateBookingError();
      }

      // 4. Pull capacity rules from the Class template.
      const klass = await tx.class.findUniqueOrThrow({
        where: { id: instance.class_id },
        select: {
          maxCapacity: true,
          allowWaitlist: true,
          waitlistLimit: true,
        },
      });
      const capacity = instance.capacity_override ?? klass.maxCapacity;

      // 5. Count active bookings under the lock.
      const confirmedCount = await tx.classBooking.count({
        where: {
          classInstanceId: args.instanceId,
          state: { in: ['confirmed', 'checked_in'] },
        },
      });

      if (confirmedCount < capacity) {
        const booking = await tx.classBooking.create({
          data: {
            tenantId: args.tenantId,
            classInstanceId: args.instanceId,
            clientId: args.clientId,
            state: 'confirmed',
            idempotencyKey: args.idempotencyKey,
          },
          select: CLASS_BOOKING_SAFE_FIELDS,
        });
        await writeAudit(tx, {
          tenantId: args.tenantId,
          actorUserId: args.actorUserId,
          action: 'class_booking.created',
          entityType: 'class_booking',
          entityId: booking.id,
          after: booking as ClassBooking,
        });

        // Optional: mint a geofence check-in magic-link token. Only the
        // public /book route requests this — admin-side bookings get
        // checked in manually by staff and don't need a client-bearer.
        // TTL = scheduledEndAt + 30 minutes (grace for the late window
        // configured per-location).
        let geofenceCheckInToken: string | null = null;
        if (mintCheckInToken) {
          const expiresAt = new Date(
            instance.scheduled_end_at.getTime() + 30 * 60_000,
          );
          const minted = await mintToken(tx, {
            tenantId: args.tenantId,
            purpose: 'geofence_check_in',
            expiresAt,
            scope: {
              clientId: args.clientId,
              classBookingId: booking.id,
            },
          });
          geofenceCheckInToken = minted.rawToken;
        }

        // TODO(epic-8): notify client of booking confirmation.
        return {
          kind: 'booking',
          booking: booking as ClassBooking,
          geofenceCheckInToken,
        };
      }

      // 6. At capacity. Either offer the waitlist or hard-stop.
      if (!klass.allowWaitlist) {
        throw new ClassFullError();
      }

      const waitlistCount = await tx.classWaitlistEntry.count({
        where: {
          classInstanceId: args.instanceId,
          state: { in: ['waiting', 'promoted'] },
        },
      });
      if (waitlistCount >= klass.waitlistLimit) {
        throw new WaitlistFullError();
      }

      const dupWaitlist = await tx.classWaitlistEntry.findFirst({
        where: {
          classInstanceId: args.instanceId,
          clientId: args.clientId,
          state: { in: ['waiting', 'promoted'] },
        },
        select: { id: true },
      });
      if (dupWaitlist) {
        throw new DuplicateBookingError();
      }

      const entry = await tx.classWaitlistEntry.create({
        data: {
          tenantId: args.tenantId,
          classInstanceId: args.instanceId,
          clientId: args.clientId,
          position: waitlistCount + 1,
          state: 'waiting',
        },
        select: CLASS_WAITLIST_SAFE_FIELDS,
      });
      await writeAudit(tx, {
        tenantId: args.tenantId,
        actorUserId: args.actorUserId,
        action: 'class_waitlist.joined',
        entityType: 'class_waitlist_entry',
        entityId: entry.id,
        after: entry as ClassWaitlistEntry,
      });
      // TODO(epic-8): notify client they're on the waitlist.
      return { kind: 'waitlist', entry: entry as ClassWaitlistEntry };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 8000,
    },
  );
}

// ---------- listRoster ----------

/**
 * Fetch the roster (confirmed + checked-in bookings) and the waitlist for a
 * given instance. Both lists carry an inlined client summary so the admin
 * drawer doesn't need a follow-up lookup per row.
 *
 * `includeCancelled` adds cancelled/no_show bookings to the result for an
 * "audit view" — default false because the live roster surface only wants
 * active rows.
 */
export async function listRoster(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    instanceId: string;
    includeCancelled?: boolean;
  },
): Promise<RosterResponse> {
  const instance = await prisma.classInstance.findFirst({
    where: { id: args.instanceId, tenantId: args.tenantId },
    select: { id: true },
  });
  if (!instance) {
    throw new ClassInstanceNotFoundError();
  }

  const bookingStateFilter = args.includeCancelled
    ? undefined
    : { in: ['confirmed', 'checked_in', 'completed'] };

  const [bookings, waitlist] = await Promise.all([
    prisma.classBooking.findMany({
      where: {
        tenantId: args.tenantId,
        classInstanceId: args.instanceId,
        ...(bookingStateFilter ? { state: bookingStateFilter } : {}),
      },
      select: BOOKING_WITH_CLIENT_SELECT,
      orderBy: [{ bookedAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.classWaitlistEntry.findMany({
      where: {
        tenantId: args.tenantId,
        classInstanceId: args.instanceId,
        state: { in: ['waiting', 'promoted'] },
      },
      select: WAITLIST_WITH_CLIENT_SELECT,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    }),
  ]);

  return { bookings, waitlist };
}

// ---------- cancelBooking ----------

// Default expiry window for an auto-promoted waitlist entry. The promoted
// client has 24h to confirm before the entry expires (cleanup job lands in
// Epic 8 alongside the notification stack). Mirrors MANUAL_PROMOTE_EXPIRY_HOURS
// so both promote paths set the same window.
const AUTO_PROMOTE_EXPIRY_HOURS = 24;

export type CancelBookingResult = {
  cancelled: ClassBooking;
  /** Set when a waiting entry was auto-promoted into the freed seat. */
  promotedBooking?: ClassBooking;
  /** The waitlist entry that was promoted (state='promoted'). */
  promotedFromEntry?: ClassWaitlistEntry;
  /**
   * Inlined client summary on the promoted entry so the admin UI can render
   * "Promoted {Name} from waitlist" without a follow-up fetch.
   */
  promotedClient?: { id: string; firstName: string; lastName: string | null };
  /**
   * True when the cancel happened inside the tenant's cancellation window
   * (NOW > scheduledStartAt - bookingCancellationWindowHours). Informational
   * only — no refund/fee logic until Epic 6 (Stripe).
   */
  lateCancel: boolean;
};

/**
 * Cancel a confirmed (or checked-in) class booking and, when the instance is
 * still scheduled and there's a waiting waitlist entry, auto-promote the
 * lowest-position entry into a confirmed booking with a 24h confirmation
 * window. Cancel + promote run in the same Serializable transaction so a
 * promote failure rolls the cancel back too.
 *
 * `lateCancel` is computed from the tenant's `bookingCancellationWindowHours`
 * and recorded on the cancel audit row as `_isLateCancel`. It does NOT block
 * the cancel and does NOT trigger a fee — fees land in Epic 6 with Stripe.
 */
export async function cancelBooking(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    instanceId: string;
    bookingId: string;
    reason: string | undefined;
    initiatedBy: 'studio' | 'client';
  },
): Promise<CancelBookingResult> {
  const result = await prisma.$transaction(
    async (tx) => {
      const before = await tx.classBooking.findFirst({
        where: {
          id: args.bookingId,
          tenantId: args.tenantId,
          classInstanceId: args.instanceId,
        },
        select: CLASS_BOOKING_SAFE_FIELDS,
      });
      if (!before) {
        throw new BookingNotFoundError();
      }
      // Reject if already in a terminal state — cancelled / no_show /
      // completed bookings can't be cancelled again.
      if (
        before.state === 'cancelled_by_client' ||
        before.state === 'cancelled_by_studio' ||
        before.state === 'no_show' ||
        before.state === 'completed'
      ) {
        throw new BookingAlreadyCancelledError();
      }

      // Load the instance + tenant cancellation window. Used to (a) decide
      // whether to attempt auto-promote and (b) compute the lateCancel flag.
      const instance = await tx.classInstance.findFirstOrThrow({
        where: { id: args.instanceId, tenantId: args.tenantId },
        select: {
          id: true,
          state: true,
          scheduledStartAt: true,
          tenant: {
            select: { bookingCancellationWindowHours: true },
          },
        },
      });

      const now = new Date();
      const windowHours = instance.tenant.bookingCancellationWindowHours;
      const cancelCutoff = new Date(
        instance.scheduledStartAt.getTime() - windowHours * 60 * 60_000,
      );
      const lateCancel = now > cancelCutoff;

      const newState =
        args.initiatedBy === 'client'
          ? 'cancelled_by_client'
          : 'cancelled_by_studio';

      const after = await tx.classBooking.update({
        where: { id: args.bookingId },
        data: {
          state: newState,
          cancellationReason: args.reason ?? null,
          cancellationInitiatedBy: args.initiatedBy,
          cancelledAt: now,
        },
        select: CLASS_BOOKING_SAFE_FIELDS,
      });

      // Audit the cancel. `_isLateCancel` rides alongside the row snapshot so
      // the audit trail captures the policy state at the moment of cancel.
      await writeAudit(tx, {
        tenantId: args.tenantId,
        actorUserId: args.actorUserId,
        action: 'class_booking.cancelled',
        entityType: 'class_booking',
        entityId: after.id,
        before: before as ClassBooking,
        after: {
          ...(after as ClassBooking),
          _isLateCancel: lateCancel,
        } as Record<string, unknown>,
      });

      // Auto-promote next waiting entry. Only when the instance is still
      // scheduled — cancelled/in_progress/completed instances don't get new
      // bookings. The promote happens inside this same transaction so a
      // failure rolls back the cancel.
      let promotedBooking: ClassBooking | undefined;
      let promotedFromEntry: ClassWaitlistEntry | undefined;
      let promotedClient:
        | { id: string; firstName: string; lastName: string | null }
        | undefined;

      if (instance.state === 'scheduled') {
        const nextEntry = await tx.classWaitlistEntry.findFirst({
          where: {
            tenantId: args.tenantId,
            classInstanceId: args.instanceId,
            state: 'waiting',
          },
          orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
          select: {
            ...CLASS_WAITLIST_SAFE_FIELDS,
            client: { select: CLIENT_SUMMARY_SELECT },
          },
        });

        if (nextEntry) {
          // Defensive pre-check: if the promoted client already has an active
          // booking for this instance (e.g. they re-booked after joining the
          // waitlist), the partial unique index on
          // (class_instance_id, client_id) WHERE state IN
          // ('confirmed','checked_in') would reject our insert and abort the
          // transaction. Skip the promote in that case so the cancel itself
          // still commits — admin can manually clean up the waitlist entry.
          const existingActive = await tx.classBooking.findFirst({
            where: {
              classInstanceId: args.instanceId,
              clientId: nextEntry.clientId,
              state: { in: ['confirmed', 'checked_in'] },
            },
            select: { id: true },
          });

          let createdBooking: ClassBooking | null = null;
          if (!existingActive) {
            const idempotencyKey = `waitlist-auto-promote:${nextEntry.id}`;
            createdBooking = (await tx.classBooking.create({
              data: {
                tenantId: args.tenantId,
                classInstanceId: args.instanceId,
                clientId: nextEntry.clientId,
                state: 'confirmed',
                idempotencyKey,
              },
              select: CLASS_BOOKING_SAFE_FIELDS,
            })) as ClassBooking;
          }

          if (createdBooking) {
            const promotedAt = now;
            const expiresAt = new Date(
              promotedAt.getTime() + AUTO_PROMOTE_EXPIRY_HOURS * 60 * 60_000,
            );
            const updatedEntry = await tx.classWaitlistEntry.update({
              where: { id: nextEntry.id },
              data: {
                state: 'promoted',
                promotedAt,
                expiresAt,
              },
              select: CLASS_WAITLIST_SAFE_FIELDS,
            });

            await writeAudit(tx, {
              tenantId: args.tenantId,
              actorUserId: args.actorUserId,
              action: 'class_booking.created',
              entityType: 'class_booking',
              entityId: createdBooking.id,
              after: createdBooking,
            });
            await writeAudit(tx, {
              tenantId: args.tenantId,
              actorUserId: args.actorUserId,
              action: 'class_waitlist.auto_promoted',
              entityType: 'class_waitlist_entry',
              entityId: updatedEntry.id,
              before: nextEntry as ClassWaitlistEntry,
              after: updatedEntry as ClassWaitlistEntry,
            });

            // TODO(epic-8): notify promoted client they have 24h to confirm.

            promotedBooking = createdBooking;
            promotedFromEntry = updatedEntry as ClassWaitlistEntry;
            promotedClient = nextEntry.client;
          }
        }
      }

      // TODO(epic-8): notify the cancelling client and (if not promoted) the
      // next waitlist client that a spot may open up.

      return {
        cancelled: after as ClassBooking,
        promotedBooking,
        promotedFromEntry,
        promotedClient,
        lateCancel,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 8000,
    },
  );

  // Roster SSE broadcasts — AFTER tx commits so a rolled-back cancel
  // doesn't emit a stale broadcast. The auto-promoted booking (when
  // present) is a separate event so subscribers can render "Joined from
  // waitlist" pills distinctly from a vanilla booking-cancelled flip.
  rosterBroadcast.publish(args.instanceId, {
    kind: 'booking_cancelled',
    bookingId: result.cancelled.id,
  });
  if (result.promotedBooking) {
    rosterBroadcast.publish(args.instanceId, {
      kind: 'waitlist_promoted',
      bookingId: result.promotedBooking.id,
    });
  }

  return result;
}

// ---------- joinWaitlistManually ----------

/**
 * Admin manually adds a client to the waitlist without first attempting to
 * book — useful when staff knows the class is full but the client wants to
 * be queued. Same uniqueness invariants as the waitlist arm of
 * createBookingOrWaitlist; no SELECT FOR UPDATE needed because we don't
 * race against capacity here.
 */
export async function joinWaitlistManually(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    instanceId: string;
    clientId: string;
  },
): Promise<{ entry: ClassWaitlistEntry }> {
  return prisma.$transaction(async (tx) => {
    const instance = await tx.classInstance.findFirst({
      where: { id: args.instanceId, tenantId: args.tenantId },
      select: { id: true, classId: true, state: true },
    });
    if (!instance) {
      throw new ClassInstanceNotFoundError();
    }
    if (instance.state !== 'scheduled') {
      throw new ClassInstanceNotBookableError(instance.state);
    }

    const client = await tx.client.findFirst({
      where: { id: args.clientId, tenantId: args.tenantId },
      select: { id: true },
    });
    if (!client) {
      throw new ClientNotFoundError();
    }

    const klass = await tx.class.findUniqueOrThrow({
      where: { id: instance.classId },
      select: { allowWaitlist: true, waitlistLimit: true },
    });
    if (!klass.allowWaitlist) {
      throw new ClassFullError();
    }

    const waitlistCount = await tx.classWaitlistEntry.count({
      where: {
        classInstanceId: args.instanceId,
        state: { in: ['waiting', 'promoted'] },
      },
    });
    if (waitlistCount >= klass.waitlistLimit) {
      throw new WaitlistFullError();
    }

    const dup = await tx.classWaitlistEntry.findFirst({
      where: {
        classInstanceId: args.instanceId,
        clientId: args.clientId,
        state: { in: ['waiting', 'promoted'] },
      },
      select: { id: true },
    });
    if (dup) {
      throw new DuplicateBookingError();
    }

    const entry = await tx.classWaitlistEntry.create({
      data: {
        tenantId: args.tenantId,
        classInstanceId: args.instanceId,
        clientId: args.clientId,
        position: waitlistCount + 1,
        state: 'waiting',
      },
      select: CLASS_WAITLIST_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      action: 'class_waitlist.joined',
      entityType: 'class_waitlist_entry',
      entityId: entry.id,
      after: entry as ClassWaitlistEntry,
    });

    // TODO(epic-8): notify client they were added to the waitlist.

    return { entry: entry as ClassWaitlistEntry };
  });
}

// ---------- promoteWaitlistEntryManually ----------

/**
 * Admin manually promotes a waiting entry to a confirmed booking. Phase 3c
 * will run this automatically on booking cancellation; Phase 3a only ships
 * the manual trigger.
 *
 * Race safety: same Serializable + SELECT FOR UPDATE pattern as
 * createBookingOrWaitlist — manual promote competes with concurrent book
 * attempts for the freed seat, so we hold the instance row lock.
 *
 * If the entry's client already has an active booking (e.g. a booking was
 * created via createBookingOrWaitlist between the admin clicking "promote"
 * and this transaction running), we flip the entry to 'promoted' but do
 * not create a duplicate booking — the route layer surfaces this as a
 * DUPLICATE_BOOKING 409 (parallel to the createBookingOrWaitlist behavior).
 */
export async function promoteWaitlistEntryManually(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    instanceId: string;
    entryId: string;
  },
): Promise<{ booking: ClassBooking; entry: ClassWaitlistEntry }> {
  return await prisma.$transaction(
    async (tx) => {
      // Lock the instance row so capacity check + booking insert is atomic.
      const lockedRows = await tx.$queryRaw<
        Array<{
          id: string;
          tenant_id: string;
          class_id: string;
          state: string;
          capacity_override: number | null;
        }>
      >`
        SELECT id, tenant_id, class_id, state, capacity_override
        FROM class_instances
        WHERE id = ${args.instanceId} AND tenant_id = ${args.tenantId}
        FOR UPDATE
      `;
      const instance = lockedRows[0];
      if (!instance) {
        throw new ClassInstanceNotFoundError();
      }
      if (instance.state !== 'scheduled') {
        throw new ClassInstanceNotBookableError(instance.state);
      }

      const beforeEntry = await tx.classWaitlistEntry.findFirst({
        where: {
          id: args.entryId,
          tenantId: args.tenantId,
          classInstanceId: args.instanceId,
        },
        select: CLASS_WAITLIST_SAFE_FIELDS,
      });
      if (!beforeEntry) {
        throw new WaitlistEntryNotFoundError();
      }
      if (beforeEntry.state !== 'waiting') {
        throw new WaitlistEntryNotPromotableError(beforeEntry.state);
      }

      const dup = await tx.classBooking.findFirst({
        where: {
          classInstanceId: args.instanceId,
          clientId: beforeEntry.clientId,
          state: { in: ['confirmed', 'checked_in'] },
        },
        select: { id: true },
      });
      if (dup) {
        throw new DuplicateBookingError();
      }

      const klass = await tx.class.findUniqueOrThrow({
        where: { id: instance.class_id },
        select: { maxCapacity: true },
      });
      const capacity = instance.capacity_override ?? klass.maxCapacity;

      const confirmedCount = await tx.classBooking.count({
        where: {
          classInstanceId: args.instanceId,
          state: { in: ['confirmed', 'checked_in'] },
        },
      });
      if (confirmedCount >= capacity) {
        // No room. Don't change the entry — admin can try again after a cancel.
        throw new ClassFullError();
      }

      // Idempotency key: deterministic from the entry id so re-attempting a
      // promote on the same entry returns the same booking via the unique
      // index instead of creating a second one.
      const idempotencyKey = `waitlist-promote:${args.entryId}`;

      const booking = await tx.classBooking.create({
        data: {
          tenantId: args.tenantId,
          classInstanceId: args.instanceId,
          clientId: beforeEntry.clientId,
          state: 'confirmed',
          idempotencyKey,
        },
        select: CLASS_BOOKING_SAFE_FIELDS,
      });

      const promotedAt = new Date();
      const expiresAt = new Date(
        promotedAt.getTime() + MANUAL_PROMOTE_EXPIRY_HOURS * 60 * 60_000,
      );
      const afterEntry = await tx.classWaitlistEntry.update({
        where: { id: beforeEntry.id },
        data: {
          state: 'promoted',
          promotedAt,
          expiresAt,
        },
        select: CLASS_WAITLIST_SAFE_FIELDS,
      });

      await writeAudit(tx, {
        tenantId: args.tenantId,
        actorUserId: args.actorUserId,
        action: 'class_booking.created',
        entityType: 'class_booking',
        entityId: booking.id,
        after: booking as ClassBooking,
      });
      await writeAudit(tx, {
        tenantId: args.tenantId,
        actorUserId: args.actorUserId,
        action: 'class_waitlist.promoted',
        entityType: 'class_waitlist_entry',
        entityId: afterEntry.id,
        before: beforeEntry as ClassWaitlistEntry,
        after: afterEntry as ClassWaitlistEntry,
      });

      // TODO(epic-8): notify client they were promoted into the class.

      return {
        booking: booking as ClassBooking,
        entry: afterEntry as ClassWaitlistEntry,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 8000,
    },
  );
}

// ---------- Phase 4: check-in lifecycle ----------

/**
 * Staff manually checks a client into a class. Phase 4 of the Classes epic.
 *
 * State machine: confirmed → checked_in (sets checkedInAt + checkInMethod +
 * checkedInByStaffId + late flag). Re-running on an already checked_in
 * booking is idempotent — we only write an update if the `late` toggle
 * differs, in which case we audit as `class_booking.late_toggled` so the
 * history captures the flip. Any terminal / cancelled state is rejected
 * with BookingNotCheckInEligibleError so the route layer can return 409.
 *
 * `actorStaffId` may be null when the signed-in user has no linked Staff row
 * (e.g. an admin without a Work email match). The audit row still records
 * `actorUserId`, so accountability is preserved.
 */
export async function checkInBooking(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    actorStaffId: string | null;
    instanceId: string;
    bookingId: string;
    late?: boolean;
  },
): Promise<{ booking: ClassBooking }> {
  const lateFlag = args.late ?? false;

  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.classBooking.findFirst({
      where: {
        id: args.bookingId,
        tenantId: args.tenantId,
        classInstanceId: args.instanceId,
      },
      select: CLASS_BOOKING_SAFE_FIELDS,
    });
    if (!before) {
      throw new BookingNotFoundError();
    }

    // Idempotent path: already checked in. Only update if the late toggle
    // differs; otherwise return the booking unchanged.
    if (before.state === 'checked_in') {
      if (before.late === lateFlag) {
        return { booking: before as ClassBooking, changed: false };
      }
      const toggled = await tx.classBooking.update({
        where: { id: args.bookingId },
        data: { late: lateFlag },
        select: CLASS_BOOKING_SAFE_FIELDS,
      });
      await writeAudit(tx, {
        tenantId: args.tenantId,
        actorUserId: args.actorUserId,
        action: 'class_booking.late_toggled',
        entityType: 'class_booking',
        entityId: toggled.id,
        before: before as ClassBooking,
        after: toggled as ClassBooking,
      });
      return { booking: toggled as ClassBooking, changed: true };
    }

    if (before.state !== 'confirmed') {
      throw new BookingNotCheckInEligibleError(before.state);
    }

    const after = await tx.classBooking.update({
      where: { id: args.bookingId },
      data: {
        state: 'checked_in',
        checkInMethod: 'manual',
        checkedInAt: new Date(),
        checkedInByStaffId: args.actorStaffId,
        late: lateFlag,
      },
      select: CLASS_BOOKING_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      action: 'class_booking.checked_in',
      entityType: 'class_booking',
      entityId: after.id,
      before: before as ClassBooking,
      after: after as ClassBooking,
    });

    // TODO(epic-8): notify client of check-in confirmation.

    return { booking: after as ClassBooking, changed: true };
  });

  // Roster SSE broadcast — AFTER tx commits. Skip the no-op idempotent
  // path (state and late both unchanged) so we don't spam subscribers.
  if (result.changed) {
    rosterBroadcast.publish(args.instanceId, {
      kind: 'booking_checked_in',
      bookingId: result.booking.id,
      method: 'manual',
      checkedInAt:
        result.booking.checkedInAt?.toISOString() ?? new Date().toISOString(),
      late: result.booking.late,
    });
  }

  return { booking: result.booking };
}

/**
 * Staff marks a booking as a no-show. State machine:
 * confirmed | checked_in → no_show (also records cancelledAt for "when it
 * was decided"). Already-terminal bookings (no_show, cancelled_*, completed)
 * are rejected.
 *
 * no_show frees capacity because the active-capacity count only includes
 * `confirmed` + `checked_in` — see createBookingOrWaitlist step 5 and the
 * partial unique index on (class_instance_id, client_id) in migration SQL.
 */
export async function markNoShow(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    instanceId: string;
    bookingId: string;
  },
): Promise<{ booking: ClassBooking }> {
  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.classBooking.findFirst({
      where: {
        id: args.bookingId,
        tenantId: args.tenantId,
        classInstanceId: args.instanceId,
      },
      select: CLASS_BOOKING_SAFE_FIELDS,
    });
    if (!before) {
      throw new BookingNotFoundError();
    }
    if (
      before.state === 'no_show' ||
      before.state === 'cancelled_by_client' ||
      before.state === 'cancelled_by_studio' ||
      before.state === 'completed'
    ) {
      throw new BookingNotNoShowEligibleError(before.state);
    }

    const after = await tx.classBooking.update({
      where: { id: args.bookingId },
      data: {
        state: 'no_show',
        cancelledAt: new Date(),
      },
      select: CLASS_BOOKING_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      action: 'class_booking.no_show',
      entityType: 'class_booking',
      entityId: after.id,
      before: before as ClassBooking,
      after: after as ClassBooking,
    });

    // TODO(epic-6): trigger no-show fee charge.
    // TODO(epic-8): notify client of the no-show record.

    return { booking: after as ClassBooking };
  });

  // Roster SSE broadcast — AFTER tx commits.
  rosterBroadcast.publish(args.instanceId, {
    kind: 'booking_no_show',
    bookingId: result.booking.id,
  });

  return result;
}

/**
 * Staff reverts a check-in or no-show back to `confirmed`. Used when an
 * action was mis-clicked. Resets all check-in fields and the late flag;
 * when reverting from no_show, also clears cancelledAt. Terminal cancel /
 * completed states cannot be reverted (use the existing un-cancel surface
 * in those cases). Already-confirmed bookings are rejected as a no-op
 * error so the UI doesn't silently swallow a misclick.
 */
export async function revertCheckIn(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    instanceId: string;
    bookingId: string;
  },
): Promise<{ booking: ClassBooking }> {
  const result = await prisma.$transaction(async (tx) => {
    const before = await tx.classBooking.findFirst({
      where: {
        id: args.bookingId,
        tenantId: args.tenantId,
        classInstanceId: args.instanceId,
      },
      select: CLASS_BOOKING_SAFE_FIELDS,
    });
    if (!before) {
      throw new BookingNotFoundError();
    }
    if (before.state !== 'checked_in' && before.state !== 'no_show') {
      throw new BookingNotRevertibleError(before.state);
    }

    const wasNoShow = before.state === 'no_show';

    const after = await tx.classBooking.update({
      where: { id: args.bookingId },
      data: {
        state: 'confirmed',
        checkedInAt: null,
        checkedInByStaffId: null,
        checkInMethod: null,
        late: false,
        // Only clear cancelledAt when reverting from no_show — a future
        // re-cancel path would set it again. Reverting from checked_in
        // leaves cancelledAt untouched (it should already be null).
        ...(wasNoShow ? { cancelledAt: null } : {}),
      },
      select: CLASS_BOOKING_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      action: 'class_booking.revert_check_in',
      entityType: 'class_booking',
      entityId: after.id,
      before: before as ClassBooking,
      after: after as ClassBooking,
    });

    return { booking: after as ClassBooking };
  });

  // Roster SSE broadcast — AFTER tx commits.
  rosterBroadcast.publish(args.instanceId, {
    kind: 'booking_revert_check_in',
    bookingId: result.booking.id,
  });

  return result;
}
