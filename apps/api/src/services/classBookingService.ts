import { Prisma } from '@prisma/client';
import type {
  ClassBooking,
  ClassWaitlistEntry,
} from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';

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
// Deferred work:
//   - cancelBooking → auto-promote next waitlist entry (Phase 3c)
//   - payment_id stays null until Epic 6 (Stripe) lands
//   - SMS/email notifications on booking + cancel + waitlist (Epic 8)

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
    super('Booking is already cancelled.');
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
  | 'class_waitlist.joined'
  | 'class_waitlist.promoted';

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
    before?: ClassBooking | ClassWaitlistEntry | null;
    after?: ClassBooking | ClassWaitlistEntry | null;
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
  | { kind: 'booking'; booking: ClassBooking }
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
  },
): Promise<BookingOrWaitlistResult> {
  // Idempotency probe OUTSIDE the lock. If this key already booked, return
  // the existing row without engaging the row lock.
  const existing = await prisma.classBooking.findUnique({
    where: {
      tenantId_idempotencyKey: {
        tenantId: args.tenantId,
        idempotencyKey: args.idempotencyKey,
      },
    },
  });
  if (existing) {
    return { kind: 'booking', booking: existing };
  }

  return await prisma.$transaction(
    async (tx) => {
      // 1. Lock the instance row. Includes tenant_id in the predicate so a
      //    cross-tenant guess can't gain a lock on someone else's row.
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
        // TODO(epic-8): notify client of booking confirmation.
        return { kind: 'booking', booking: booking as ClassBooking };
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

export async function cancelBooking(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    instanceId: string;
    bookingId: string;
    reason: string | undefined;
    initiatedBy: 'studio';
  },
): Promise<{ booking: ClassBooking }> {
  return prisma.$transaction(async (tx) => {
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
      before.state === 'cancelled_by_client' ||
      before.state === 'cancelled_by_studio'
    ) {
      throw new BookingAlreadyCancelledError();
    }

    const after = await tx.classBooking.update({
      where: { id: args.bookingId },
      data: {
        state:
          args.initiatedBy === 'studio'
            ? 'cancelled_by_studio'
            : 'cancelled_by_client',
        cancellationReason: args.reason ?? null,
        cancellationInitiatedBy: args.initiatedBy,
        cancelledAt: new Date(),
      },
      select: CLASS_BOOKING_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      action: 'class_booking.cancelled',
      entityType: 'class_booking',
      entityId: after.id,
      before: before as ClassBooking,
      after: after as ClassBooking,
    });

    // TODO(phase-3c): auto-promote next waitlist entry on cancel — pull the
    // lowest-position waiting entry, flip to 'promoted' with expiresAt, and
    // create a confirmed ClassBooking. Phase 3a leaves this for manual
    // promote via promoteWaitlistEntryManually.
    //
    // TODO(epic-8): notify client (and the promoted waitlist client) of the
    // cancellation + spot opening.

    return { booking: after as ClassBooking };
  });
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
