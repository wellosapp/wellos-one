import { Prisma } from '@prisma/client';

import type { ExtendedPrismaClient } from '../db/client.js';
import { haversineDistanceMeters } from '../lib/geo.js';

// Service layer for the public geofence check-in routes (PR 8b of the
// Geofence Auto Check-in epic). Two surfaces:
//
//   getEligibleBookingsForClient — list confirmed bookings starting in the
//     next 30 minutes on geofence-enabled locations, scoped to one client.
//
//   submitGeofenceCheckIn — the GPS submission endpoint. Runs the 7
//     validations from docs/specs/geofence-check-in-epic.md (in order, fail
//     fast). Writes a class_check_in_attempt row on EVERY attempt (success
//     and failure) for the compliance/fraud audit trail. On success,
//     transitions booking.state from 'confirmed' to 'checked_in' with
//     check_in_method='geofence' and captures the submitted GPS payload on
//     the booking row.
//
// Anti-spoof note: the spec's "location-jump" pattern check (step 8) is
// LOGGED but does NOT block in MVP per "For Phase 2 MVP, fraud flags don't
// block check-in — they just log for review". A separate
// class_check_in_attempt row with result='suspicious_pattern' is written
// alongside the 'success' row when triggered.

// Window in minutes used by getEligibleBookingsForClient — anything starting
// within +/- this many minutes is considered eligible, so the PWA can see
// both "I'm 25 min early" and "I'm just inside the late grace window".
const ELIGIBILITY_HORIZON_MINUTES = 30;

// Rate limit window from the spec. Counted on class_check_in_attempt rows
// for this booking.
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_ATTEMPTS = 3;

// Anti-spoof location-jump check. If this client's last 30 minutes shows
// any successful attempt > 100 km from the new submission, flag it.
const ANTI_SPOOF_LOOKBACK_MINUTES = 30;
const ANTI_SPOOF_DISTANCE_METERS = 100_000;

// Spec threshold — GPS accuracy at or above this is rejected.
const LOW_ACCURACY_THRESHOLD_METERS = 100;

// ---------- Eligible bookings ----------

export interface EligibleBooking {
  bookingId: string;
  classInstanceId: string;
  className: string;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  locationId: string;
  locationName: string;
  geofence: {
    centerLat: number;
    centerLng: number;
    radiusMeters: number;
    checkInWindowBeforeMinutes: number;
    checkInWindowAfterMinutes: number;
  };
}

export interface EligibleBookingsResponse {
  eligible: EligibleBooking[];
}

function decimalToNumber(d: Prisma.Decimal | number): number {
  return typeof d === 'number' ? d : Number(d.toString());
}

export async function getEligibleBookingsForClient(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; clientId: string; horizonMinutes?: number },
): Promise<EligibleBookingsResponse> {
  const horizon = args.horizonMinutes ?? ELIGIBILITY_HORIZON_MINUTES;
  const now = new Date();
  const lowerBound = new Date(now.getTime() - horizon * 60_000);
  const upperBound = new Date(now.getTime() + horizon * 60_000);

  // Bookings filtered by client + tenant + state, then narrowed in the join
  // by instance scheduledStartAt window AND a non-null geofence on the
  // instance's location. We require the geofence to be enabled so a
  // disabled-but-existing config doesn't surface in eligibility.
  const rows = await prisma.classBooking.findMany({
    where: {
      tenantId: args.tenantId,
      clientId: args.clientId,
      state: 'confirmed',
      classInstance: {
        scheduledStartAt: { gte: lowerBound, lte: upperBound },
        location: {
          geofence: { enabled: true },
        },
      },
    },
    select: {
      id: true,
      classInstanceId: true,
      classInstance: {
        select: {
          scheduledStartAt: true,
          scheduledEndAt: true,
          class: { select: { name: true } },
          location: {
            select: {
              id: true,
              name: true,
              geofence: {
                select: {
                  centerLat: true,
                  centerLng: true,
                  radiusMeters: true,
                  checkInWindowBeforeMinutes: true,
                  checkInWindowAfterMinutes: true,
                  enabled: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ classInstance: { scheduledStartAt: 'asc' } }],
  });

  const eligible: EligibleBooking[] = [];
  for (const row of rows) {
    const geo = row.classInstance.location.geofence;
    // Belt-and-braces: the Prisma filter already requires geofence enabled,
    // but TypeScript can't see that so we narrow here.
    if (!geo || !geo.enabled) continue;
    eligible.push({
      bookingId: row.id,
      classInstanceId: row.classInstanceId,
      className: row.classInstance.class.name,
      scheduledStartAt: row.classInstance.scheduledStartAt,
      scheduledEndAt: row.classInstance.scheduledEndAt,
      locationId: row.classInstance.location.id,
      locationName: row.classInstance.location.name,
      geofence: {
        centerLat: decimalToNumber(geo.centerLat),
        centerLng: decimalToNumber(geo.centerLng),
        radiusMeters: geo.radiusMeters,
        checkInWindowBeforeMinutes: geo.checkInWindowBeforeMinutes,
        checkInWindowAfterMinutes: geo.checkInWindowAfterMinutes,
      },
    });
  }

  return { eligible };
}

// ---------- Validation error ----------

export type GeofenceValidationCode =
  | 'TOKEN_BOOKING_MISMATCH'
  | 'BOOKING_NOT_CHECK_IN_ELIGIBLE'
  | 'GEOFENCE_DISABLED'
  | 'GEOFENCE_NOT_CONFIGURED'
  | 'OUT_OF_WINDOW'
  | 'LOW_ACCURACY'
  | 'OUT_OF_RANGE'
  | 'RATE_LIMITED';

export class GeofenceValidationError extends Error {
  code: GeofenceValidationCode;
  status: number;
  /** Booking state on a BOOKING_NOT_CHECK_IN_ELIGIBLE error. */
  bookingState?: string;
  /** Computed haversine distance on an OUT_OF_RANGE error. */
  distanceMeters?: number;

  constructor(
    code: GeofenceValidationCode,
    status: number,
    message: string,
    extras: { bookingState?: string; distanceMeters?: number } = {},
  ) {
    super(message);
    this.name = 'GeofenceValidationError';
    this.code = code;
    this.status = status;
    if (extras.bookingState !== undefined) {
      this.bookingState = extras.bookingState;
    }
    if (extras.distanceMeters !== undefined) {
      this.distanceMeters = extras.distanceMeters;
    }
  }
}

// ---------- Check-in result ----------

export type GeofenceCheckInResult =
  | {
      kind: 'success';
      booking: {
        id: string;
        state: string;
        checkedInAt: Date;
      };
    }
  | {
      kind: 'already_checked_in';
      booking: {
        id: string;
        state: string;
        checkedInAt: Date | null;
      };
    };

// ---------- Audit row writer (matches the seven failure codes + success) ----------

// Maps validation codes → the class_check_in_attempt.result enum value.
// `success` is written by the success path; this map only covers failures.
const RESULT_CODE_BY_VALIDATION: Record<
  GeofenceValidationCode,
  string | null
> = {
  TOKEN_BOOKING_MISMATCH: 'error',
  BOOKING_NOT_CHECK_IN_ELIGIBLE: 'error',
  GEOFENCE_DISABLED: 'error',
  GEOFENCE_NOT_CONFIGURED: 'error',
  OUT_OF_WINDOW: 'out_of_window',
  LOW_ACCURACY: 'low_accuracy',
  OUT_OF_RANGE: 'out_of_range',
  RATE_LIMITED: 'rate_limited',
};

// ---------- submitGeofenceCheckIn ----------

/**
 * Apply the 7 validations from docs/specs/geofence-check-in-epic.md (in
 * order, fail fast), then transition the booking to 'checked_in'. Writes a
 * class_check_in_attempt audit row on EVERY attempt (success and failure)
 * and a parallel 'suspicious_pattern' attempt row when the anti-spoof
 * location-jump heuristic fires (informational only — does not block).
 *
 * On idempotent re-check-in (state already 'checked_in') returns
 * { kind: 'already_checked_in' } with the existing booking — domain-level
 * idempotency layered above HTTP-level withIdempotency.
 *
 * On failure: throws GeofenceValidationError. The route layer maps
 * `err.status` to the HTTP code and exposes `err.code` to the PWA so the
 * PWA can decide whether to retry silently (OUT_OF_RANGE, LOW_ACCURACY)
 * or surface a hard error.
 */
export async function submitGeofenceCheckIn(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    clientId: string;
    bookingId: string;
    /** From the magic-link token — must match the URL's bookingId. */
    tokenClassBookingId: string | null;
    lat: number;
    lng: number;
    accuracyMeters: number;
    userAgent: string | null;
    ipAddress: string | null;
  },
): Promise<GeofenceCheckInResult> {
  // Validation 1: token's classBookingId matches the URL bookingId.
  // Done first so we don't burn DB queries on a mismatched token. The
  // audit row for this case still goes in — track who tried a swap.
  if (args.tokenClassBookingId !== args.bookingId) {
    await writeAttempt(prisma, {
      tenantId: args.tenantId,
      classBookingId: args.bookingId,
      clientId: args.clientId,
      result: 'error',
      submittedLat: args.lat,
      submittedLng: args.lng,
      submittedAccuracyMeters: args.accuracyMeters,
      distanceFromGeofenceMeters: null,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    });
    throw new GeofenceValidationError(
      'TOKEN_BOOKING_MISMATCH',
      403,
      'Token does not match the booking in the URL.',
    );
  }

  // Load booking + instance + location.geofence in a single round-trip.
  // tenantId on the WHERE is defense-in-depth even though the token scopes
  // us already.
  const booking = await prisma.classBooking.findFirst({
    where: { id: args.bookingId, tenantId: args.tenantId },
    select: {
      id: true,
      state: true,
      checkedInAt: true,
      classInstanceId: true,
      classInstance: {
        select: {
          scheduledStartAt: true,
          scheduledEndAt: true,
          location: {
            select: {
              geofence: {
                select: {
                  centerLat: true,
                  centerLng: true,
                  radiusMeters: true,
                  checkInWindowBeforeMinutes: true,
                  checkInWindowAfterMinutes: true,
                  enabled: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!booking) {
    // Token scope is gone (e.g. soft-deleted). Audit + 403.
    await writeAttempt(prisma, {
      tenantId: args.tenantId,
      classBookingId: args.bookingId,
      clientId: args.clientId,
      result: 'error',
      submittedLat: args.lat,
      submittedLng: args.lng,
      submittedAccuracyMeters: args.accuracyMeters,
      distanceFromGeofenceMeters: null,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    });
    throw new GeofenceValidationError(
      'TOKEN_BOOKING_MISMATCH',
      403,
      'Booking not found for this token.',
    );
  }

  // Validation 2: booking state.
  //   'checked_in' → idempotent success (don't audit-as-error)
  //   anything other than 'confirmed' → reject
  if (booking.state === 'checked_in') {
    return {
      kind: 'already_checked_in',
      booking: {
        id: booking.id,
        state: booking.state,
        checkedInAt: booking.checkedInAt,
      },
    };
  }
  if (booking.state !== 'confirmed') {
    await writeAttempt(prisma, {
      tenantId: args.tenantId,
      classBookingId: args.bookingId,
      clientId: args.clientId,
      result: RESULT_CODE_BY_VALIDATION.BOOKING_NOT_CHECK_IN_ELIGIBLE!,
      submittedLat: args.lat,
      submittedLng: args.lng,
      submittedAccuracyMeters: args.accuracyMeters,
      distanceFromGeofenceMeters: null,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    });
    await incrementBookingAttempts(prisma, args.bookingId);
    throw new GeofenceValidationError(
      'BOOKING_NOT_CHECK_IN_ELIGIBLE',
      409,
      `Booking in state '${booking.state}' cannot be checked in via geofence.`,
      { bookingState: booking.state },
    );
  }

  const geofence = booking.classInstance.location.geofence;

  // Geofence config exists? (separate code from disabled — admin may have
  // deleted the row entirely while the client was en route).
  if (!geofence) {
    await writeAttempt(prisma, {
      tenantId: args.tenantId,
      classBookingId: args.bookingId,
      clientId: args.clientId,
      result: 'error',
      submittedLat: args.lat,
      submittedLng: args.lng,
      submittedAccuracyMeters: args.accuracyMeters,
      distanceFromGeofenceMeters: null,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    });
    await incrementBookingAttempts(prisma, args.bookingId);
    throw new GeofenceValidationError(
      'GEOFENCE_NOT_CONFIGURED',
      403,
      'No geofence configured for this location.',
    );
  }

  // Validation 3: in the check-in window.
  const now = new Date();
  const windowOpensAt = new Date(
    booking.classInstance.scheduledStartAt.getTime() -
      geofence.checkInWindowBeforeMinutes * 60_000,
  );
  const windowClosesAt = new Date(
    booking.classInstance.scheduledStartAt.getTime() +
      geofence.checkInWindowAfterMinutes * 60_000,
  );
  if (now < windowOpensAt || now > windowClosesAt) {
    await writeAttempt(prisma, {
      tenantId: args.tenantId,
      classBookingId: args.bookingId,
      clientId: args.clientId,
      result: RESULT_CODE_BY_VALIDATION.OUT_OF_WINDOW!,
      submittedLat: args.lat,
      submittedLng: args.lng,
      submittedAccuracyMeters: args.accuracyMeters,
      distanceFromGeofenceMeters: null,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    });
    await incrementBookingAttempts(prisma, args.bookingId);
    throw new GeofenceValidationError(
      'OUT_OF_WINDOW',
      422,
      'Check-in window is not open.',
    );
  }

  // Validation 4: geofence enabled.
  if (!geofence.enabled) {
    await writeAttempt(prisma, {
      tenantId: args.tenantId,
      classBookingId: args.bookingId,
      clientId: args.clientId,
      result: 'error',
      submittedLat: args.lat,
      submittedLng: args.lng,
      submittedAccuracyMeters: args.accuracyMeters,
      distanceFromGeofenceMeters: null,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    });
    await incrementBookingAttempts(prisma, args.bookingId);
    throw new GeofenceValidationError(
      'GEOFENCE_DISABLED',
      403,
      'Geofence check-in is disabled for this location.',
    );
  }

  // Validation 5: GPS accuracy.
  if (args.accuracyMeters >= LOW_ACCURACY_THRESHOLD_METERS) {
    await writeAttempt(prisma, {
      tenantId: args.tenantId,
      classBookingId: args.bookingId,
      clientId: args.clientId,
      result: RESULT_CODE_BY_VALIDATION.LOW_ACCURACY!,
      submittedLat: args.lat,
      submittedLng: args.lng,
      submittedAccuracyMeters: args.accuracyMeters,
      distanceFromGeofenceMeters: null,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    });
    await incrementBookingAttempts(prisma, args.bookingId);
    throw new GeofenceValidationError(
      'LOW_ACCURACY',
      422,
      'GPS accuracy is too low.',
    );
  }

  // Validation 6: distance.
  const centerLat = decimalToNumber(geofence.centerLat);
  const centerLng = decimalToNumber(geofence.centerLng);
  const distanceMeters = haversineDistanceMeters(
    { lat: args.lat, lng: args.lng },
    { lat: centerLat, lng: centerLng },
  );
  if (distanceMeters > geofence.radiusMeters) {
    await writeAttempt(prisma, {
      tenantId: args.tenantId,
      classBookingId: args.bookingId,
      clientId: args.clientId,
      result: RESULT_CODE_BY_VALIDATION.OUT_OF_RANGE!,
      submittedLat: args.lat,
      submittedLng: args.lng,
      submittedAccuracyMeters: args.accuracyMeters,
      distanceFromGeofenceMeters: distanceMeters,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    });
    await incrementBookingAttempts(prisma, args.bookingId);
    throw new GeofenceValidationError(
      'OUT_OF_RANGE',
      422,
      'GPS location is outside the geofence radius.',
      { distanceMeters },
    );
  }

  // Validation 7: rate limit on attempts (per booking, last 10 min).
  const rateWindowStart = new Date(
    now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60_000,
  );
  const recentAttempts = await prisma.classCheckInAttempt.count({
    where: {
      classBookingId: args.bookingId,
      attemptedAt: { gte: rateWindowStart },
    },
  });
  if (recentAttempts >= RATE_LIMIT_MAX_ATTEMPTS) {
    await writeAttempt(prisma, {
      tenantId: args.tenantId,
      classBookingId: args.bookingId,
      clientId: args.clientId,
      result: RESULT_CODE_BY_VALIDATION.RATE_LIMITED!,
      submittedLat: args.lat,
      submittedLng: args.lng,
      submittedAccuracyMeters: args.accuracyMeters,
      distanceFromGeofenceMeters: distanceMeters,
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    });
    await incrementBookingAttempts(prisma, args.bookingId);
    throw new GeofenceValidationError(
      'RATE_LIMITED',
      429,
      'Too many check-in attempts in the last 10 minutes.',
    );
  }

  // Anti-spoof / location-jump check. Informational only in MVP — we log a
  // separate 'suspicious_pattern' attempt row alongside the success row but
  // do NOT block. Future enhancement: threshold-based staff approval.
  const antiSpoofWindowStart = new Date(
    now.getTime() - ANTI_SPOOF_LOOKBACK_MINUTES * 60_000,
  );
  const recentSuccessfulOther = await prisma.classCheckInAttempt.findMany({
    where: {
      clientId: args.clientId,
      tenantId: args.tenantId,
      result: 'success',
      attemptedAt: { gte: antiSpoofWindowStart },
      submittedLat: { not: null },
      submittedLng: { not: null },
    },
    select: {
      submittedLat: true,
      submittedLng: true,
    },
  });
  let triggeredAntiSpoof = false;
  for (const r of recentSuccessfulOther) {
    if (r.submittedLat === null || r.submittedLng === null) continue;
    const otherLat = decimalToNumber(r.submittedLat);
    const otherLng = decimalToNumber(r.submittedLng);
    const jump = haversineDistanceMeters(
      { lat: args.lat, lng: args.lng },
      { lat: otherLat, lng: otherLng },
    );
    if (jump > ANTI_SPOOF_DISTANCE_METERS) {
      triggeredAntiSpoof = true;
      break;
    }
  }

  // Success path. Booking transition + success audit + (optional)
  // suspicious_pattern audit, all in one transaction so the audit trail
  // can never disagree with the booking state.
  const updated = await prisma.$transaction(async (tx) => {
    const after = await tx.classBooking.update({
      where: { id: args.bookingId },
      data: {
        state: 'checked_in',
        checkInMethod: 'geofence',
        checkedInAt: now,
        checkedInByStaffId: null,
        checkInLat: new Prisma.Decimal(args.lat),
        checkInLng: new Prisma.Decimal(args.lng),
        checkInAccuracyMeters: Math.round(args.accuracyMeters),
        checkInAttempts: { increment: 1 },
      },
      select: {
        id: true,
        state: true,
        checkedInAt: true,
      },
    });

    await tx.classCheckInAttempt.create({
      data: {
        tenantId: args.tenantId,
        classBookingId: args.bookingId,
        clientId: args.clientId,
        method: 'geofence',
        result: 'success',
        submittedLat: new Prisma.Decimal(args.lat),
        submittedLng: new Prisma.Decimal(args.lng),
        submittedAccuracyMeters: Math.round(args.accuracyMeters),
        distanceFromGeofenceMeters: new Prisma.Decimal(distanceMeters.toFixed(2)),
        userAgent: args.userAgent,
        ipAddress: args.ipAddress,
      },
    });

    if (triggeredAntiSpoof) {
      // Separate row keeps queryability clean — analysts can SELECT result=
      // 'suspicious_pattern' to find flagged check-ins without a JOIN.
      await tx.classCheckInAttempt.create({
        data: {
          tenantId: args.tenantId,
          classBookingId: args.bookingId,
          clientId: args.clientId,
          method: 'geofence',
          result: 'suspicious_pattern',
          submittedLat: new Prisma.Decimal(args.lat),
          submittedLng: new Prisma.Decimal(args.lng),
          submittedAccuracyMeters: Math.round(args.accuracyMeters),
          distanceFromGeofenceMeters: new Prisma.Decimal(
            distanceMeters.toFixed(2),
          ),
          userAgent: args.userAgent,
          ipAddress: args.ipAddress,
        },
      });
    }

    // Domain audit log — mirrors classBookingService.checkInBooking. No
    // actor user (clients aren't Clerk users); actorType='system' surfaces
    // in the audit row and the metadata in `after` records the clientId.
    await tx.auditLog.create({
      data: {
        tenantId: args.tenantId,
        actorUserId: null,
        actorType: 'system',
        action: 'class_booking.checked_in',
        entityType: 'class_booking',
        entityId: after.id,
        before: Prisma.JsonNull,
        after: {
          id: after.id,
          state: after.state,
          checkedInAt: after.checkedInAt?.toISOString() ?? null,
          checkInMethod: 'geofence',
          clientId: args.clientId,
          flaggedSuspiciousPattern: triggeredAntiSpoof,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return after;
  });

  // TODO(epic-8): notify client + roster SSE (PR 10).

  return {
    kind: 'success',
    booking: {
      id: updated.id,
      state: updated.state,
      // The update above always sets checkedInAt = now, so this is non-null.
      checkedInAt: updated.checkedInAt ?? now,
    },
  };
}

// ---------- helpers ----------

// Write a class_check_in_attempt audit row outside any transaction. Used by
// the failure paths above so the audit trail captures the attempt even when
// the validation rejects further work.
async function writeAttempt(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    classBookingId: string;
    clientId: string;
    result: string;
    submittedLat: number | null;
    submittedLng: number | null;
    submittedAccuracyMeters: number | null;
    distanceFromGeofenceMeters: number | null;
    userAgent: string | null;
    ipAddress: string | null;
  },
): Promise<void> {
  await prisma.classCheckInAttempt.create({
    data: {
      tenantId: args.tenantId,
      classBookingId: args.classBookingId,
      clientId: args.clientId,
      method: 'geofence',
      result: args.result,
      submittedLat:
        args.submittedLat === null
          ? null
          : new Prisma.Decimal(args.submittedLat),
      submittedLng:
        args.submittedLng === null
          ? null
          : new Prisma.Decimal(args.submittedLng),
      submittedAccuracyMeters:
        args.submittedAccuracyMeters === null
          ? null
          : Math.round(args.submittedAccuracyMeters),
      distanceFromGeofenceMeters:
        args.distanceFromGeofenceMeters === null
          ? null
          : new Prisma.Decimal(args.distanceFromGeofenceMeters.toFixed(2)),
      userAgent: args.userAgent,
      ipAddress: args.ipAddress,
    },
  });
}

// Per spec: failed attempts also bump the booking's `check_in_attempts`
// counter. We do this in a separate write (outside the audit insert) to
// keep the failure path simple — the rate-limit check reads
// class_check_in_attempt, not this field, so the two counters can drift
// without correctness impact. The field is for UI display ("3 attempts so
// far") and forensic review.
async function incrementBookingAttempts(
  prisma: ExtendedPrismaClient,
  bookingId: string,
): Promise<void> {
  await prisma.classBooking.update({
    where: { id: bookingId },
    data: { checkInAttempts: { increment: 1 } },
  });
}

