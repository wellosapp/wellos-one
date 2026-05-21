import { SlotHoldStatus, type SlotHold } from '@prisma/client';

import type { ExtendedPrismaClient, ExtendedTransactionClient } from '../db/client.js';

// Slot holds per R2 §9. Short-lived (default 7 min) reservations that block
// a (staff, time) tuple while a public booker enters details/payment.
//
// Lifecycle: active → consumed (booking confirmed) | expired (TTL elapsed)
// | released (user backed out).
//
// Conflict checks happen INSIDE a Prisma $transaction so the read-overlap
// + write-insert pair is serialized. We don't add an EXCLUDE constraint on
// `slot_holds` itself — the table is short-lived, the conflict window is
// small, and overlap-with-an-existing-active-hold is already a guarded
// in-tx read. Appointments still rely on `appointments_no_overlap_per_staff`
// (the DB-level guard that survives any service-layer mistake).

/** Default hold TTL in minutes, per R2 §9.2. */
export const DEFAULT_HOLD_TTL_MINUTES = 7;

/** Soft cap on how many active holds a single fingerprint can stack. */
const MAX_ACTIVE_HOLDS_PER_FINGERPRINT = 5;

export class SlotConflictError extends Error {
  code = 'SLOT_CONFLICT' as const;
  staffId: string;
  startsAt: Date;
  endsAt: Date;
  reason: 'appointment' | 'hold';
  constructor(args: {
    staffId: string;
    startsAt: Date;
    endsAt: Date;
    reason: 'appointment' | 'hold';
  }) {
    super('This time was just taken. Pick a new opening.');
    this.name = 'SlotConflictError';
    this.staffId = args.staffId;
    this.startsAt = args.startsAt;
    this.endsAt = args.endsAt;
    this.reason = args.reason;
  }
}

export class InvalidSlotHoldReferenceError extends Error {
  code = 'INVALID_SLOT_HOLD_REFERENCE' as const;
  field: 'tenantSlug' | 'locationId' | 'serviceId' | 'staffId';
  constructor(
    field: 'tenantSlug' | 'locationId' | 'serviceId' | 'staffId',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidSlotHoldReferenceError';
    this.field = field;
  }
}

export class SlotHoldNotFoundError extends Error {
  code = 'SLOT_HOLD_NOT_FOUND' as const;
  constructor() {
    super('Slot hold not found or already finalized.');
    this.name = 'SlotHoldNotFoundError';
  }
}

interface ValidatedReferences {
  durationMinutes: number;
}

async function validateReferences(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    locationId: string;
    serviceId: string;
    staffId: string;
  },
): Promise<ValidatedReferences> {
  const [location, service, staff] = await Promise.all([
    tx.location.findFirst({
      where: { id: args.locationId, tenantId: args.tenantId, deletedAt: null },
      select: { id: true },
    }),
    tx.service.findFirst({
      where: {
        id: args.serviceId,
        tenantId: args.tenantId,
        deletedAt: null,
        active: true,
      },
      select: { id: true, durationMinutes: true },
    }),
    tx.staff.findFirst({
      where: {
        id: args.staffId,
        tenantId: args.tenantId,
        deletedAt: null,
        active: true,
      },
      select: { id: true },
    }),
  ]);

  if (!location) {
    throw new InvalidSlotHoldReferenceError(
      'locationId',
      'Unknown location for this tenant.',
    );
  }
  if (!service) {
    throw new InvalidSlotHoldReferenceError(
      'serviceId',
      'Unknown or inactive service for this tenant.',
    );
  }
  if (!staff) {
    throw new InvalidSlotHoldReferenceError(
      'staffId',
      'Unknown or inactive staff for this tenant.',
    );
  }

  return { durationMinutes: service.durationMinutes };
}

/**
 * Acquire a slot hold for a public booker.
 *
 * Inside a single $transaction:
 *   1. Resolve references (location, service, staff) for this tenant.
 *   2. Honor idempotency — if the same key was used before, return the prior
 *      hold (only when still `active` and still within TTL).
 *   3. Probe for any confirmed-ish appointment that would overlap → 409.
 *   4. Probe for any *other* active hold that would overlap → 409.
 *   5. Insert the hold with status='active' and expiresAt = now + TTL.
 */
export async function acquireSlotHold(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    locationId: string;
    serviceId: string;
    staffId: string;
    startsAt: Date;
    /** Optional override (minutes). Defaults to DEFAULT_HOLD_TTL_MINUTES. */
    ttlMinutes?: number;
    idempotencyKey?: string;
    fingerprint?: string;
  },
): Promise<SlotHold> {
  const ttlMinutes = args.ttlMinutes ?? DEFAULT_HOLD_TTL_MINUTES;

  return prisma.$transaction(async (tx) => {
    const { durationMinutes } = await validateReferences(tx, {
      tenantId: args.tenantId,
      locationId: args.locationId,
      serviceId: args.serviceId,
      staffId: args.staffId,
    });

    const startsAt = args.startsAt;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);

    // 2. Idempotency: same (tenant, key) gets the same answer until that
    //    hold finalizes. No DB unique constraint — keys are short-lived and
    //    uniqueness is a UX convenience, not a correctness property.
    if (args.idempotencyKey) {
      const prior = await tx.slotHold.findFirst({
        where: {
          tenantId: args.tenantId,
          idempotencyKey: args.idempotencyKey,
          status: SlotHoldStatus.active,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (prior && prior.expiresAt > now) {
        return prior;
      }
    }

    // 3. Appointment overlap (half-open).
    const conflictingAppointment = await tx.appointment.findFirst({
      where: {
        tenantId: args.tenantId,
        staffId: args.staffId,
        state: { notIn: ['cancelled', 'no_show'] },
        deletedAt: null,
        AND: [
          { scheduledStartAt: { lt: endsAt } },
          { scheduledEndAt: { gt: startsAt } },
        ],
      },
      select: { id: true },
    });
    if (conflictingAppointment) {
      throw new SlotConflictError({
        staffId: args.staffId,
        startsAt,
        endsAt,
        reason: 'appointment',
      });
    }

    // 4. Active-hold overlap. A hold owned by THIS fingerprint on THIS slot
    //    short-circuits as idempotent (same booker re-clicked the same slot).
    const overlappingHold = await tx.slotHold.findFirst({
      where: {
        staffId: args.staffId,
        status: SlotHoldStatus.active,
        expiresAt: { gt: now },
        AND: [
          { startsAt: { lt: endsAt } },
          { endsAt: { gt: startsAt } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (overlappingHold) {
      if (
        args.fingerprint &&
        overlappingHold.createdByFingerprint === args.fingerprint &&
        overlappingHold.startsAt.getTime() === startsAt.getTime() &&
        overlappingHold.endsAt.getTime() === endsAt.getTime()
      ) {
        return overlappingHold;
      }
      throw new SlotConflictError({
        staffId: args.staffId,
        startsAt,
        endsAt,
        reason: 'hold',
      });
    }

    // 5. Defensive: cap how many active holds one fingerprint can stack.
    //    Prevents a buggy/malicious client from holding many slots at once.
    if (args.fingerprint) {
      const activeCount = await tx.slotHold.count({
        where: {
          createdByFingerprint: args.fingerprint,
          status: SlotHoldStatus.active,
          expiresAt: { gt: now },
        },
      });
      if (activeCount >= MAX_ACTIVE_HOLDS_PER_FINGERPRINT) {
        throw new SlotConflictError({
          staffId: args.staffId,
          startsAt,
          endsAt,
          reason: 'hold',
        });
      }
    }

    return tx.slotHold.create({
      data: {
        tenantId: args.tenantId,
        locationId: args.locationId,
        serviceId: args.serviceId,
        staffId: args.staffId,
        startsAt,
        endsAt,
        expiresAt,
        status: SlotHoldStatus.active,
        idempotencyKey: args.idempotencyKey,
        createdByFingerprint: args.fingerprint,
      },
    });
  });
}

/**
 * Mark a hold as consumed. Called when the public booking confirm endpoint
 * lands the Appointment row successfully. Throws if the hold is gone or
 * already finalized so the caller can decide what to do.
 */
export async function consumeSlotHold(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; holdId: string },
): Promise<SlotHold> {
  const updated = await prisma.slotHold.updateMany({
    where: {
      id: args.holdId,
      tenantId: args.tenantId,
      status: SlotHoldStatus.active,
    },
    data: { status: SlotHoldStatus.consumed },
  });
  if (updated.count === 0) {
    throw new SlotHoldNotFoundError();
  }
  const row = await prisma.slotHold.findUnique({ where: { id: args.holdId } });
  if (!row) throw new SlotHoldNotFoundError();
  return row;
}

/**
 * Release a hold. The user backed out, or the timer fired client-side.
 * Idempotent — releasing an already-finalized hold is a no-op (so the UI's
 * tear-down path doesn't have to handle errors).
 */
export async function releaseSlotHold(
  prisma: ExtendedPrismaClient,
  args: { holdId: string; tenantId?: string },
): Promise<void> {
  await prisma.slotHold.updateMany({
    where: {
      id: args.holdId,
      ...(args.tenantId ? { tenantId: args.tenantId } : {}),
      status: SlotHoldStatus.active,
    },
    data: { status: SlotHoldStatus.released },
  });
}

/**
 * Bulk-expire stale active holds. Deferred to a future BullMQ cron;
 * exported now so an admin endpoint or smoke script can drive it.
 */
export async function expireStaleHolds(
  prisma: ExtendedPrismaClient,
): Promise<{ expired: number }> {
  const result = await prisma.slotHold.updateMany({
    where: {
      status: SlotHoldStatus.active,
      expiresAt: { lt: new Date() },
    },
    data: { status: SlotHoldStatus.expired },
  });
  return { expired: result.count };
}

/**
 * Return active (non-expired) hold ranges for a given staff over a UTC
 * window. The availability engine subtracts these from candidate slots.
 *
 * `excludeFingerprint` (when provided) excludes holds that this booker
 * created, so the user holding a slot still sees their own slot in the
 * picker without it disappearing.
 */
export async function loadActiveHoldsForStaff(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    staffId: string;
    windowStart: Date;
    windowEnd: Date;
    excludeFingerprint?: string;
  },
): Promise<Array<{ startsAt: Date; endsAt: Date }>> {
  const rows = await prisma.slotHold.findMany({
    where: {
      tenantId: args.tenantId,
      staffId: args.staffId,
      status: SlotHoldStatus.active,
      expiresAt: { gt: new Date() },
      AND: [
        { startsAt: { lt: args.windowEnd } },
        { endsAt: { gt: args.windowStart } },
      ],
      ...(args.excludeFingerprint
        ? { NOT: { createdByFingerprint: args.excludeFingerprint } }
        : {}),
    },
    select: { startsAt: true, endsAt: true },
  });
  return rows;
}
