import { Prisma } from '@prisma/client';
import type { WaitlistEntry, WaitlistEntryStatus } from '@prisma/client';

import type { ExtendedPrismaClient } from '../db/client.js';

// Domain layer for WaitlistEntry (R2 §10). Tenant scoping at every query.
//
// State machine:
//   active     → offered       (worker or admin)
//   active     → cancelled     (client/admin cancel)
//   active     → expired       (TTL elapsed; bulk sweep — Epic 8)
//   offered    → claimed       (client accepted offer; magic link)
//   offered    → expired       (offer TTL elapsed without claim)
//   offered    → cancelled     (admin manual cancel)
//
// Notification dispatch is intentionally deferred — Epic 8 wires SMS/email
// via @wellos/notifications. The cancellation trigger hook
// (appointmentService.transitionAppointmentState) calls
// findEligibleEntriesForOpening and only LOGS "would offer to N entries" for
// now. Marking entries as offered happens in the admin "offer" route.
//
// Why no soft-delete: status=cancelled / expired carries the same semantics
// and survives reporting. Mirrors how SoapNoteRevision opts out.

/** Default TTL when the client doesn't override (R2 §10.1). */
const DEFAULT_TTL_DAYS = 14;

const WAITLIST_SAFE_FIELDS = {
  id: true,
  tenantId: true,
  locationId: true,
  serviceId: true,
  staffId: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  preferredStart: true,
  preferredEnd: true,
  preferredTimeOfDay: true,
  smsOptIn: true,
  notes: true,
  status: true,
  ttlExpiresAt: true,
  offeredAt: true,
  offeredAppointmentId: true,
  claimedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WaitlistEntrySelect;

export class InvalidWaitlistReferenceError extends Error {
  code = 'INVALID_WAITLIST_REFERENCE' as const;
  field: 'locationId' | 'serviceId' | 'staffId';
  constructor(
    field: 'locationId' | 'serviceId' | 'staffId',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidWaitlistReferenceError';
    this.field = field;
  }
}

export class WaitlistContactRequiredError extends Error {
  code = 'WAITLIST_CONTACT_REQUIRED' as const;
  constructor() {
    super('Provide an email or phone so we can reach you about an opening.');
    this.name = 'WaitlistContactRequiredError';
  }
}

interface ContactInput {
  name: string;
  email: string | null;
  phone: string | null;
}

interface PreferencesInput {
  start: Date | null;
  end: Date | null;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'any' | null;
}

/**
 * Create or refresh a waitlist entry. If the same contact (matched by email
 * OR phone) already has an `active` entry for this service in this tenant,
 * the existing row is updated rather than duplicated — this matches the
 * "no duplicate active entry per (tenant, contact, service)" invariant
 * documented on the model.
 */
export async function createWaitlistEntry(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    locationId: string;
    serviceId: string;
    staffId: string | null;
    contact: ContactInput;
    preferences: PreferencesInput;
    smsOptIn: boolean;
    notes: string | null;
    /** Optional TTL override (days). Defaults to DEFAULT_TTL_DAYS. */
    ttlDays?: number;
  },
): Promise<{ entry: WaitlistEntry; replacedExisting: boolean }> {
  if (!args.contact.email && !args.contact.phone) {
    throw new WaitlistContactRequiredError();
  }

  const ttlDays = args.ttlDays ?? DEFAULT_TTL_DAYS;

  return prisma.$transaction(async (tx) => {
    // 1) Resolve and validate FK references inside the same tx.
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
        select: { id: true },
      }),
      args.staffId
        ? tx.staff.findFirst({
            where: {
              id: args.staffId,
              tenantId: args.tenantId,
              deletedAt: null,
              active: true,
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (!location) {
      throw new InvalidWaitlistReferenceError(
        'locationId',
        'Unknown location for this tenant.',
      );
    }
    if (!service) {
      throw new InvalidWaitlistReferenceError(
        'serviceId',
        'Unknown or inactive service for this tenant.',
      );
    }
    if (args.staffId && !staff) {
      throw new InvalidWaitlistReferenceError(
        'staffId',
        'Unknown or inactive staff for this tenant.',
      );
    }

    // 2) Look for an existing active entry for this contact + service. We
    //    match on (email OR phone) — clients sometimes use one or the other
    //    across sessions; merging keeps the row count honest.
    const contactOrClauses: Prisma.WaitlistEntryWhereInput[] = [];
    if (args.contact.email) {
      contactOrClauses.push({ contactEmail: args.contact.email });
    }
    if (args.contact.phone) {
      contactOrClauses.push({ contactPhone: args.contact.phone });
    }

    const existing = await tx.waitlistEntry.findFirst({
      where: {
        tenantId: args.tenantId,
        serviceId: args.serviceId,
        status: 'active',
        OR: contactOrClauses,
      },
      select: WAITLIST_SAFE_FIELDS,
      orderBy: { createdAt: 'desc' },
    });

    const newTtl = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    if (existing) {
      const updated = await tx.waitlistEntry.update({
        where: { id: existing.id },
        data: {
          locationId: args.locationId,
          staffId: args.staffId,
          contactName: args.contact.name,
          contactEmail: args.contact.email,
          contactPhone: args.contact.phone,
          preferredStart: args.preferences.start,
          preferredEnd: args.preferences.end,
          preferredTimeOfDay: args.preferences.timeOfDay,
          smsOptIn: args.smsOptIn,
          notes: args.notes,
          ttlExpiresAt: newTtl,
        },
        select: WAITLIST_SAFE_FIELDS,
      });
      return { entry: updated, replacedExisting: true };
    }

    const created = await tx.waitlistEntry.create({
      data: {
        tenantId: args.tenantId,
        locationId: args.locationId,
        serviceId: args.serviceId,
        staffId: args.staffId,
        contactName: args.contact.name,
        contactEmail: args.contact.email,
        contactPhone: args.contact.phone,
        preferredStart: args.preferences.start,
        preferredEnd: args.preferences.end,
        preferredTimeOfDay: args.preferences.timeOfDay,
        smsOptIn: args.smsOptIn,
        notes: args.notes,
        ttlExpiresAt: newTtl,
      },
      select: WAITLIST_SAFE_FIELDS,
    });
    return { entry: created, replacedExisting: false };
  });
}

export interface ListWaitlistResult {
  entries: WaitlistEntry[];
  total: number;
  page: number;
  limit: number;
}

/** Paginated list for the admin UI. Default sort: nearest TTL first. */
export async function listWaitlistEntries(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    status?: WaitlistEntryStatus;
    serviceId?: string;
    staffId?: string;
    q?: string;
    page: number;
    limit: number;
    includeExpired?: boolean;
  },
): Promise<ListWaitlistResult> {
  const where: Prisma.WaitlistEntryWhereInput = { tenantId: args.tenantId };

  if (args.status) {
    where.status = args.status;
  } else if (!args.includeExpired) {
    // Default view hides expired+cancelled noise unless explicitly asked.
    where.status = { in: ['active', 'offered', 'claimed'] };
  }

  if (args.serviceId) where.serviceId = args.serviceId;
  if (args.staffId) where.staffId = args.staffId;

  if (args.q) {
    const term = args.q;
    where.OR = [
      { contactName: { contains: term, mode: 'insensitive' } },
      { contactEmail: { contains: term, mode: 'insensitive' } },
      { contactPhone: { contains: term, mode: 'insensitive' } },
    ];
  }

  const [entries, total] = await Promise.all([
    prisma.waitlistEntry.findMany({
      where,
      select: WAITLIST_SAFE_FIELDS,
      orderBy: [{ ttlExpiresAt: 'asc' }, { createdAt: 'asc' }],
      take: args.limit,
      skip: (args.page - 1) * args.limit,
    }),
    prisma.waitlistEntry.count({ where }),
  ]);

  return { entries, total, page: args.page, limit: args.limit };
}

export async function getWaitlistEntry(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; id: string },
): Promise<WaitlistEntry | null> {
  return prisma.waitlistEntry.findFirst({
    where: { tenantId: args.tenantId, id: args.id },
    select: WAITLIST_SAFE_FIELDS,
  });
}

/**
 * Mark a waitlist entry as cancelled. Returns null if not found / already
 * in a terminal state.
 */
export async function cancelWaitlistEntry(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; id: string },
): Promise<WaitlistEntry | null> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.waitlistEntry.findFirst({
      where: { tenantId: args.tenantId, id: args.id },
      select: { id: true, status: true },
    });
    if (!before) return null;
    // Idempotent: already-cancelled is a successful no-op.
    if (before.status === 'cancelled') {
      return tx.waitlistEntry.findFirst({
        where: { id: args.id },
        select: WAITLIST_SAFE_FIELDS,
      });
    }
    return tx.waitlistEntry.update({
      where: { id: args.id },
      data: { status: 'cancelled' },
      select: WAITLIST_SAFE_FIELDS,
    });
  });
}

/**
 * Mark a waitlist entry as offered. Idempotent: a no-op when already in
 * `offered`/`claimed`/`cancelled`/`expired`.
 */
export async function markEntryOffered(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; id: string; appointmentId?: string | null },
): Promise<WaitlistEntry | null> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.waitlistEntry.findFirst({
      where: { tenantId: args.tenantId, id: args.id },
      select: { id: true, status: true },
    });
    if (!before) return null;
    if (before.status !== 'active') {
      return tx.waitlistEntry.findFirst({
        where: { id: args.id },
        select: WAITLIST_SAFE_FIELDS,
      });
    }
    return tx.waitlistEntry.update({
      where: { id: args.id },
      data: {
        status: 'offered',
        offeredAt: new Date(),
        offeredAppointmentId: args.appointmentId ?? null,
      },
      select: WAITLIST_SAFE_FIELDS,
    });
  });
}

/** Mark a waitlist entry as claimed. Worker / claim-link flow uses this. */
export async function markEntryClaimed(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; id: string },
): Promise<WaitlistEntry | null> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.waitlistEntry.findFirst({
      where: { tenantId: args.tenantId, id: args.id },
      select: { id: true, status: true },
    });
    if (!before) return null;
    if (before.status === 'claimed') {
      return tx.waitlistEntry.findFirst({
        where: { id: args.id },
        select: WAITLIST_SAFE_FIELDS,
      });
    }
    return tx.waitlistEntry.update({
      where: { id: args.id },
      data: { status: 'claimed', claimedAt: new Date() },
      select: WAITLIST_SAFE_FIELDS,
    });
  });
}

/** Mark a waitlist entry as expired. Bulk TTL sweep (Epic 8) uses this. */
export async function markEntryExpired(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; id: string },
): Promise<WaitlistEntry | null> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.waitlistEntry.findFirst({
      where: { tenantId: args.tenantId, id: args.id },
      select: { id: true, status: true },
    });
    if (!before) return null;
    if (before.status === 'expired') {
      return tx.waitlistEntry.findFirst({
        where: { id: args.id },
        select: WAITLIST_SAFE_FIELDS,
      });
    }
    return tx.waitlistEntry.update({
      where: { id: args.id },
      data: { status: 'expired' },
      select: WAITLIST_SAFE_FIELDS,
    });
  });
}

/**
 * Find active waitlist entries that fit an opening. The eligibility test:
 *   - same tenant + service
 *   - staffId == null (any staff OK) OR staffId == opening staff
 *   - preferredStart, when set, is <= opening startsAt
 *   - preferredEnd,   when set, is >= opening endsAt
 *   - preferredTimeOfDay matches the bucket the opening falls into (or 'any')
 *   - status is 'active' and ttlExpiresAt is in the future
 *
 * Sort: created_at ASC (first-come, first-offered) per R2 §10.3.
 *
 * Time-of-day buckets are simple wall-clock ranges in UTC: morning [05-12),
 * afternoon [12-17), evening [17-23). The location timezone refinement is
 * a follow-up (matches the wider scheduler's "compute in UTC, render local"
 * convention; the current matching test ignores TZ to keep this PR focused
 * on schema + plumbing).
 */
export async function findEligibleEntriesForOpening(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    serviceId: string;
    staffId: string;
    startsAt: Date;
    endsAt: Date;
  },
): Promise<WaitlistEntry[]> {
  const now = new Date();
  const candidates = await prisma.waitlistEntry.findMany({
    where: {
      tenantId: args.tenantId,
      serviceId: args.serviceId,
      status: 'active',
      ttlExpiresAt: { gt: now },
      OR: [{ staffId: null }, { staffId: args.staffId }],
    },
    select: WAITLIST_SAFE_FIELDS,
    orderBy: { createdAt: 'asc' },
  });

  return candidates.filter((c) =>
    matchesOpening(c, args.startsAt, args.endsAt),
  );
}

function timeOfDayBucket(d: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = d.getUTCHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function matchesOpening(
  entry: WaitlistEntry,
  startsAt: Date,
  endsAt: Date,
): boolean {
  if (entry.preferredStart && startsAt < entry.preferredStart) return false;
  if (entry.preferredEnd && endsAt > entry.preferredEnd) return false;
  if (entry.preferredTimeOfDay && entry.preferredTimeOfDay !== 'any') {
    if (entry.preferredTimeOfDay !== timeOfDayBucket(startsAt)) return false;
  }
  return true;
}
