import type { ExtendedPrismaClient } from '../db/client.js';
import { resolveOrCreateClientForPublicBooking } from './clientService.js';
import {
  createBookingOrWaitlist,
  type BookingOrWaitlistResult,
} from './classBookingService.js';

// Public /book?type=classes service layer. Phase 3b of the Classes epic.
//
// Booking writes delegate to classBookingService.createBookingOrWaitlist —
// the race-safe Serializable + SELECT FOR UPDATE pattern from Phase 3a is
// reused, not duplicated.
//
// Client resolution reuses resolveOrCreateClientForPublicBooking from
// clientService (Epic 4 silent duplicate attach by email). Banned clients
// surface here so the route can return 403 before delegating.
//
// Tenant resolution is the caller's job (mirrors the appointment public
// flow); this service receives a pre-resolved tenantId.

// ---------- Wire DTOs ----------

export type PublicClassDto = {
  id: string;
  name: string;
  color: string | null;
  durationMinutes: number;
  basePriceCents: number;
  allowWaitlist: boolean;
  maxCapacity: number;
  waitlistLimit: number;
  categoryId: string | null;
  shortDescription: string | null;
};

export type PublicClassCategoryDto = {
  id: string;
  name: string;
};

export type PublicClassCatalogResponse = {
  classes: PublicClassDto[];
  categories: PublicClassCategoryDto[];
};

export type PublicClassInstanceDto = {
  id: string;
  classId: string;
  class: PublicClassDto;
  staff: {
    id: string;
    firstName: string;
    lastName: string | null;
  };
  location: {
    id: string;
    name: string;
    timezone: string;
  };
  scheduledStartAt: string;
  scheduledEndAt: string;
  capacityOverride: number | null;
  waitlistOverride: number | null;
  confirmedBookingCount: number;
  waitlistCount: number;
};

export type PublicClassInstancesResponse = {
  instances: PublicClassInstanceDto[];
};

export type CreatePublicClassBookingResult =
  | {
      kind: 'booking';
      id: string;
      /**
       * Raw magic-link bearer token (purpose='geofence_check_in') scoped
       * to this booking. The PWA stores it in localStorage keyed by booking
       * id and sends it as `Authorization: Bearer <token>` on geofence
       * check-in requests. Null only when the booking was an idempotent
       * replay (the original mint already happened).
       */
      geofenceCheckInToken: string | null;
    }
  | { kind: 'waitlist'; id: string; position: number };

// ---------- Typed errors (route maps to 4xx) ----------

export class BannedClientError extends Error {
  code = 'BANNED' as const;
  constructor() {
    super(
      'Online booking is not available for this contact. Please call the business.',
    );
    this.name = 'BannedClientError';
  }
}

// ---------- Catalog ----------

export async function listPublicClassCatalog(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string },
): Promise<PublicClassCatalogResponse> {
  const [classes, categories] = await Promise.all([
    prisma.class.findMany({
      where: { tenantId: args.tenantId, active: true },
      select: {
        id: true,
        name: true,
        color: true,
        durationMinutes: true,
        basePriceCents: true,
        allowWaitlist: true,
        maxCapacity: true,
        waitlistLimit: true,
        categoryId: true,
        shortDescription: true,
      },
      orderBy: [{ name: 'asc' }],
    }),
    // ServiceCategory has deletedAt but isn't in the soft-delete extension
    // model list — filter explicitly.
    prisma.serviceCategory.findMany({
      where: { tenantId: args.tenantId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    }),
  ]);

  return { classes, categories };
}

// ---------- Instance listing ----------

/**
 * 14-day default window when from/to are omitted. Keeps the public-facing
 * grid bounded (no infinite scroll on the first paint) while still showing
 * enough to be useful — most studios publish 2 weeks ahead.
 */
const DEFAULT_WINDOW_DAYS = 14;

export async function listPublicClassInstances(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    fromDate?: string;
    toDate?: string;
    classId?: string;
    categoryId?: string;
    staffId?: string;
    locationId?: string;
  },
): Promise<PublicClassInstancesResponse> {
  const now = new Date();
  const from = args.fromDate ? new Date(args.fromDate) : now;
  const to = args.toDate
    ? new Date(args.toDate)
    : new Date(now.getTime() + DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const instances = await prisma.classInstance.findMany({
    where: {
      tenantId: args.tenantId,
      state: 'scheduled',
      scheduledStartAt: { gte: from, lte: to },
      ...(args.classId && { classId: args.classId }),
      ...(args.staffId && { staffId: args.staffId }),
      ...(args.locationId && { locationId: args.locationId }),
      // Public surface hides inactive class templates entirely.
      class: {
        active: true,
        ...(args.categoryId && { categoryId: args.categoryId }),
      },
    },
    select: {
      id: true,
      classId: true,
      scheduledStartAt: true,
      scheduledEndAt: true,
      capacityOverride: true,
      waitlistOverride: true,
      class: {
        select: {
          id: true,
          name: true,
          color: true,
          durationMinutes: true,
          basePriceCents: true,
          allowWaitlist: true,
          maxCapacity: true,
          waitlistLimit: true,
          categoryId: true,
          shortDescription: true,
        },
      },
      staff: {
        select: { id: true, firstName: true, lastName: true },
      },
      location: {
        select: { id: true, name: true, timezone: true },
      },
    },
    orderBy: [{ scheduledStartAt: 'asc' }],
  });

  // Empty grid → skip the count round-trips.
  if (instances.length === 0) {
    return { instances: [] };
  }

  const ids = instances.map((i) => i.id);
  const [bookingCounts, waitlistCounts] = await Promise.all([
    prisma.classBooking.groupBy({
      by: ['classInstanceId'],
      where: {
        classInstanceId: { in: ids },
        state: { in: ['confirmed', 'checked_in'] },
      },
      _count: { _all: true },
    }),
    prisma.classWaitlistEntry.groupBy({
      by: ['classInstanceId'],
      where: {
        classInstanceId: { in: ids },
        state: { in: ['waiting', 'promoted'] },
      },
      _count: { _all: true },
    }),
  ]);

  const bookingCountById = new Map<string, number>(
    bookingCounts.map((b) => [b.classInstanceId, b._count._all]),
  );
  const waitlistCountById = new Map<string, number>(
    waitlistCounts.map((w) => [w.classInstanceId, w._count._all]),
  );

  return {
    instances: instances.map((i) => ({
      id: i.id,
      classId: i.classId,
      class: i.class,
      staff: i.staff,
      location: i.location,
      scheduledStartAt: i.scheduledStartAt.toISOString(),
      scheduledEndAt: i.scheduledEndAt.toISOString(),
      capacityOverride: i.capacityOverride,
      waitlistOverride: i.waitlistOverride,
      confirmedBookingCount: bookingCountById.get(i.id) ?? 0,
      waitlistCount: waitlistCountById.get(i.id) ?? 0,
    })),
  };
}

// ---------- Booking create ----------

export async function createPublicClassBooking(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    classInstanceId: string;
    idempotencyKey: string;
    guest: {
      firstName: string;
      lastName?: string;
      email: string;
      phone?: string;
    };
  },
): Promise<CreatePublicClassBookingResult> {
  const { clientId, banned } = await resolveOrCreateClientForPublicBooking(
    prisma,
    {
      tenantId: args.tenantId,
      email: args.guest.email,
      phone: args.guest.phone,
      firstName: args.guest.firstName,
      lastName: args.guest.lastName,
    },
  );
  if (banned) {
    throw new BannedClientError();
  }

  // Race-safe seat allocation + audit + idempotency lives in Phase 3a's
  // service. actorUserId=null surfaces as actorType='system' in the audit
  // row (writeAudit branches on that). mintCheckInToken=true asks the
  // service to mint a magic-link bearer token (Geofence epic PR 8b) — only
  // the public flow gets one; admin-side bookings are checked in manually.
  const result: BookingOrWaitlistResult = await createBookingOrWaitlist(
    prisma,
    {
      tenantId: args.tenantId,
      actorUserId: null,
      instanceId: args.classInstanceId,
      clientId,
      idempotencyKey: args.idempotencyKey,
      mintCheckInToken: true,
    },
  );

  if (result.kind === 'booking') {
    return {
      kind: 'booking',
      id: result.booking.id,
      geofenceCheckInToken: result.geofenceCheckInToken,
    };
  }
  return {
    kind: 'waitlist',
    id: result.entry.id,
    position: result.entry.position,
  };
}
