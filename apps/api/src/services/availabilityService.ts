import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

import type { ExtendedPrismaClient } from '../db/client.js';
import type { ListAvailabilityQuery } from '../schemas/appointment.js';
import { stateOccupiesSlot } from './appointmentStateMachine.js';
import { loadActiveHoldsForStaff } from './slotHoldService.js';

// Availability computation for E3-S1.
//
// Per Epic 3 spec: availability is COMPUTED, never materialized. The
// algorithm below runs on every query. For a single day with normal staff
// hours and < 50 existing appointments it's microsecond-fast.
//
// Algorithm:
//   1. Load Location (tz), Staff (workingHours JSONB), Service (duration + buffers)
//   2. Resolve day-of-week key in the location's timezone for the requested date
//   3. Look up staff.workingHours[dayKey] — array of { start, end } in local time
//   4. For each shift, generate candidate slots stepping by service duration
//   5. Query existing appointments for this staff that overlap the day (UTC range)
//   6. Blocked footprint per existing appointment: scheduled interval enlarged by
//      THAT service's bufferBeforeMinutes + bufferAfterMinutes (leading/trailing).
//   7. For each candidate slot, overlap-test using the REQUESTED service's
//      [slotStart - bufferBefore, slotEnd + bufferAfter]. Skip candidates whose
//      expanded start is strictly before the shift start (cannot prep outside shift).
//   8. Return UTC ISO tuples (actual booking window, not inflated) in order
//
// DST correctness: date-fns-tz fromZonedTime handles spring-forward and
// fall-back natively. "9:00 America/New_York on 2026-03-08" maps to the
// correct UTC instant; nothing special needed in this code.

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type DayKey = (typeof DAY_KEYS)[number];

// Staff.workingHours JSONB shape per the Epic 2 schema:
//   { mon: [{ start: "09:00", end: "17:00" }, ...], tue: [...], ... }
// Day keys are 3-letter lowercase. A day may be missing, null, or [] meaning
// "closed". Hours are local-time HH:MM strings (24-hour) in the location's TZ.
interface ShiftEntry {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}
type WorkingHoursJson = Partial<Record<DayKey, ShiftEntry[] | null>>;

export interface AvailableSlot {
  startAt: string; // UTC ISO
  endAt: string;   // UTC ISO
}

export class InvalidAvailabilityRequestError extends Error {
  code = 'INVALID_AVAILABILITY_REQUEST' as const;
  field: 'locationId' | 'staffId' | 'serviceId';
  constructor(field: 'locationId' | 'staffId' | 'serviceId', message: string) {
    super(message);
    this.name = 'InvalidAvailabilityRequestError';
    this.field = field;
  }
}

// Combine a YYYY-MM-DD local date and HH:MM local time in the given IANA tz
// into a UTC Date. date-fns-tz's fromZonedTime takes a string the parser
// can read as a wall-clock time AND a tz; the result is the corresponding UTC
// instant.
function localToUtc(date: string, time: string, tz: string): Date {
  // date-fns-tz parses "YYYY-MM-DDTHH:MM:SS" as a local time in `tz`. Pad
  // seconds to keep parsing deterministic.
  return fromZonedTime(`${date}T${time}:00`, tz);
}

// Return the day-of-week for a YYYY-MM-DD local date in the given tz.
// formatInTimeZone with 'eee' returns the abbreviated lowercase day key.
function dayKeyFor(date: string, tz: string): DayKey {
  // "Mon", "Tue", ... — lowercase to match the JSONB shape.
  const abbr = formatInTimeZone(localToUtc(date, '12:00', tz), tz, 'eee').toLowerCase();
  if (!(DAY_KEYS as readonly string[]).includes(abbr)) {
    // Should be unreachable; date-fns guarantees the abbr.
    throw new Error(`Unexpected day-of-week abbreviation: ${abbr}`);
  }
  return abbr as DayKey;
}

function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  // Half-open [start, end). Touching at a single instant does NOT overlap.
  return aStart < bEnd && bStart < aEnd;
}

export async function listAvailableSlots(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    query: ListAvailabilityQuery;
    /**
     * Optional browser fingerprint of the requesting public booker. When
     * provided, active slot holds created by THIS fingerprint are NOT
     * subtracted from candidate slots — so the user holding a slot still
     * sees it in their own picker. All OTHER active holds (held by other
     * concurrent bookers) are subtracted per R2 §9.
     */
    excludeHoldsForFingerprint?: string;
  },
): Promise<{ slots: AvailableSlot[] }> {
  const { tenantId, query } = args;

  // Cross-tenant safety on the three FK fields.
  const [location, staff, service] = await Promise.all([
    prisma.location.findFirst({
      where: { id: query.locationId, tenantId },
      select: { id: true, timezone: true },
    }),
    prisma.staff.findFirst({
      where: { id: query.staffId, tenantId },
      select: { id: true, workingHours: true, active: true },
    }),
    prisma.service.findFirst({
      where: { id: query.serviceId, tenantId },
      select: {
        id: true,
        durationMinutes: true,
        bufferBeforeMinutes: true,
        bufferAfterMinutes: true,
        active: true,
      },
    }),
  ]);
  if (!location)
    throw new InvalidAvailabilityRequestError(
      'locationId',
      'Unknown location for this tenant.',
    );
  if (!staff)
    throw new InvalidAvailabilityRequestError(
      'staffId',
      'Unknown staff for this tenant.',
    );
  if (!service)
    throw new InvalidAvailabilityRequestError(
      'serviceId',
      'Unknown service for this tenant.',
    );

  const tz = query.tz ?? location.timezone;
  const dayKey = dayKeyFor(query.date, tz);
  const workingHours = (staff.workingHours ?? {}) as WorkingHoursJson;
  const shifts = workingHours[dayKey] ?? [];
  if (!Array.isArray(shifts) || shifts.length === 0) {
    return { slots: [] };
  }

  const durationMs = service.durationMinutes * 60_000;
  const bufBeforeMs = service.bufferBeforeMinutes * 60_000;
  const bufAfterMs = service.bufferAfterMinutes * 60_000;
  if (durationMs <= 0) {
    return { slots: [] };
  }

  // Pull existing appointments that touch this date in UTC. We use a wide-
  // enough envelope: from local 00:00 to next local 00:00, both converted to
  // UTC. Filtering out cancelled / no_show via stateOccupiesSlot below.
  const dayStartUtc = localToUtc(query.date, '00:00', tz);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);
  const existing = await prisma.appointment.findMany({
    where: {
      staffId: query.staffId,
      state: { notIn: ['cancelled', 'no_show'] },
      AND: [
        { scheduledStartAt: { lt: dayEndUtc } },
        { scheduledEndAt: { gt: dayStartUtc } },
      ],
    },
    select: {
      scheduledStartAt: true,
      scheduledEndAt: true,
      state: true,
      service: {
        select: {
          bufferBeforeMinutes: true,
          bufferAfterMinutes: true,
        },
      },
    },
    orderBy: { scheduledStartAt: 'asc' },
  });

  const blocked = existing
    .filter((a) => stateOccupiesSlot(a.state))
    .map((a) => ({
      startAt: new Date(
        a.scheduledStartAt.getTime() -
          a.service.bufferBeforeMinutes * 60_000,
      ),
      endAt: new Date(
        a.scheduledEndAt.getTime() + a.service.bufferAfterMinutes * 60_000,
      ),
    }));

  const scheduleBlocks = await prisma.staffScheduleBlock.findMany({
    where: {
      tenantId,
      staffId: query.staffId,
      deletedAt: null,
      AND: [
        { startsAt: { lt: dayEndUtc } },
        { endsAt: { gt: dayStartUtc } },
        {
          OR: [{ locationId: null }, { locationId: query.locationId }],
        },
      ],
    },
    select: { startsAt: true, endsAt: true },
  });
  for (const b of scheduleBlocks) {
    blocked.push({ startAt: b.startsAt, endAt: b.endsAt });
  }

  // Subtract active slot holds (R2 §9). A hold owned by THIS booker's
  // fingerprint stays out of the blocked list so they can see their own
  // held time as available — every other active hold is treated identically
  // to a confirmed appointment for picker purposes.
  const activeHolds = await loadActiveHoldsForStaff(prisma, {
    tenantId,
    staffId: query.staffId,
    windowStart: dayStartUtc,
    windowEnd: dayEndUtc,
    excludeFingerprint: args.excludeHoldsForFingerprint,
  });
  for (const h of activeHolds) {
    blocked.push({ startAt: h.startsAt, endAt: h.endsAt });
  }

  // Generate candidate slots and filter against blocked ranges.
  const slots: AvailableSlot[] = [];
  for (const shift of shifts) {
    const shiftStart = localToUtc(query.date, shift.start, tz);
    const shiftEnd = localToUtc(query.date, shift.end, tz);
    if (!(shiftStart < shiftEnd)) continue;

    // Step in service-duration increments. Cursor starts at shiftStart and
    // advances until a candidate's end would exceed shiftEnd.
    for (
      let cursor = shiftStart;
      cursor.getTime() + durationMs <= shiftEnd.getTime();
      cursor = new Date(cursor.getTime() + durationMs)
    ) {
      const slotStart = cursor;
      const slotEnd = new Date(cursor.getTime() + durationMs);
      const expandedStart = new Date(slotStart.getTime() - bufBeforeMs);
      const expandedEnd = new Date(slotEnd.getTime() + bufAfterMs);
      if (expandedStart < shiftStart) {
        continue;
      }
      const conflicts = blocked.some((b) =>
        rangesOverlap(expandedStart, expandedEnd, b.startAt, b.endAt),
      );
      if (!conflicts) {
        slots.push({
          startAt: slotStart.toISOString(),
          endAt: slotEnd.toISOString(),
        });
      }
      // Cap defensively. Typical day < 50 slots; cap at 200.
      if (slots.length >= 200) break;
    }
    if (slots.length >= 200) break;
  }

  return { slots };
}
