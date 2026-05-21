import { Prisma } from '@prisma/client';
import type {
  Appointment,
  AppointmentSeries,
  AppointmentSeriesStatus,
  SeriesCadence,
} from '@prisma/client';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  CreateSeriesBody,
  ListSeriesQuery,
} from '../schemas/appointmentSeries.js';
import {
  InvalidAppointmentReferenceError,
  isExclusionViolation,
} from './appointmentService.js';

// Domain layer for AppointmentSeries admin CRUD (PR S2 — Tier B recurring).
//
// Each series describes a template; each generated occurrence is a real
// Appointment row with seriesId set back here. Conflict detection runs in
// the same transaction as the inserts so a single race-window conflict
// rolls back the whole create.
//
// Tenant scoping: every query passes tenantId. AppointmentSeries is NOT in
// the soft-delete extension list (apps/api/src/db/softDelete.ts) — callers
// must add `deletedAt: null` to where clauses themselves.
//
// Audit log: `appointment_series.created` on create, `appointment_series.cancelled`
// on cancel. One row per call (not per occurrence) for bulk ops, per spec.
//
// Time math:
//   - All input dates (anchorDate, endsOn) are YYYY-MM-DD in the Location
//     timezone.
//   - timeOfDay is "HH:MM" local. fromZonedTime() converts "date + time + tz"
//     to the UTC instant for the appointment row.
//   - DST: fromZonedTime handles spring-forward/fall-back correctly.

// Hard cap on generated occurrences per series. The schema allows up to 365
// via Zod (occurrenceCount.max), but endsOn-bounded series with weekly cadence
// + 7 days-of-week could blow past that — surface a truncated flag to the API
// so the caller can refuse or warn.
const MAX_OCCURRENCES = 365;


// -------- Pure occurrence-date math (no DB) --------

type EndCondition =
  | { occurrenceCount: number }
  | { endsOn: Date };

// Format a Date as YYYY-MM-DD using its UTC components. Per the function
// contract, anchorDate / endsOn arrive as a Date constructed via
// `new Date(Date.UTC(year, month-1, day))` — i.e. UTC midnight on the
// caller's chosen local date. We pull the calendar date back out via the
// UTC accessors (NOT formatInTimeZone, which would shift the date by a day
// in any zone west of UTC).
function ymdFromUtcDate(d: Date): string {
  return `${d.getUTCFullYear().toString().padStart(4, '0')}-${pad2(
    d.getUTCMonth() + 1,
  )}-${pad2(d.getUTCDate())}`;
}

// Convert a YYYY-MM-DD local date (in tz) to ISO weekday (1=Mon..7=Sun).
function isoWeekdayFor(date: string, tz: string): number {
  // formatInTimeZone with token 'i' → ISO day-of-week as a 1-7 number string.
  const raw = formatInTimeZone(
    fromZonedTime(`${date}T12:00:00`, tz),
    tz,
    'i',
  );
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 7) {
    throw new Error(`Unexpected ISO weekday for ${date} in ${tz}: ${raw}`);
  }
  return n;
}

// Parse a YYYY-MM-DD string into year/month/day numbers (calendar-local).
function parseYmd(date: string): { year: number; month: number; day: number } {
  // Avoid `new Date(date)` — it would interpret in the runtime's local zone.
  const parts = date.split('-').map((p) => Number(p));
  const [year, month, day] = parts;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new Error(`Invalid YYYY-MM-DD: ${date}`);
  }
  return { year, month, day };
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

// Add `days` calendar days to a YYYY-MM-DD (zone-independent: pure calendar math).
function addDaysYmd(date: string, days: number): string {
  const { year, month, day } = parseYmd(date);
  // Use UTC math to avoid DST shenanigans — we just want calendar days.
  const utc = Date.UTC(year, month - 1, day);
  const next = new Date(utc + days * 86_400_000);
  return `${next.getUTCFullYear().toString().padStart(4, '0')}-${pad2(
    next.getUTCMonth() + 1,
  )}-${pad2(next.getUTCDate())}`;
}

// True if year/month/day form a real calendar date (no Feb 30 clamp).
function isValidCalendarDate(
  year: number,
  month: number,
  day: number,
): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

/**
 * Compute the UTC `scheduledStartAt` for every occurrence of a series.
 *
 * Pure function — no DB access. Returns an array ordered ascending.
 *
 * Cadence semantics (MVP):
 * - weekly:   every week on each picked weekday from daysOfWeek.
 * - biweekly: every other week on each picked weekday from daysOfWeek.
 * - monthly:  once per calendar month on the SAME calendar day as anchorDate.
 *             daysOfWeek is ignored. If a target month doesn't have that day
 *             (e.g. Feb 30), skip the month — do NOT clamp to the last day.
 *
 * End condition: exactly one of occurrenceCount OR endsOn is honored.
 *
 * Timezone handling: timeOfDay is parsed as local time on the candidate date
 * in `timezone` and converted to UTC via fromZonedTime (date-fns-tz). DST
 * transitions are handled by the library.
 *
 * Safety bound: hard-cap at MAX_OCCURRENCES (365). Past that, returns the
 * first MAX_OCCURRENCES and signals via `truncated: true`.
 */
export function expandOccurrenceDates(args: {
  cadence: SeriesCadence;
  daysOfWeek: number[];
  timeOfDay: string;
  durationMinutes: number;
  anchorDate: Date;
  endCondition: EndCondition;
  timezone: string;
}): {
  occurrences: Array<{ scheduledStartAt: Date; scheduledEndAt: Date }>;
  truncated: boolean;
} {
  const {
    cadence,
    daysOfWeek,
    timeOfDay,
    durationMinutes,
    anchorDate,
    endCondition,
    timezone,
  } = args;

  // anchorDate arrived as a Date — represent it as a YYYY-MM-DD in the
  // location timezone so the calendar math stays zone-aware.
  const anchorYmd = ymdFromUtcDate(anchorDate);

  const targetCount =
    'occurrenceCount' in endCondition
      ? Math.min(endCondition.occurrenceCount, MAX_OCCURRENCES)
      : MAX_OCCURRENCES;
  const wantsTruncate =
    'occurrenceCount' in endCondition
      ? endCondition.occurrenceCount > MAX_OCCURRENCES
      : false;
  const lastEligibleYmd =
    'endsOn' in endCondition ? ymdFromUtcDate(endCondition.endsOn) : null;

  const occurrences: Array<{
    scheduledStartAt: Date;
    scheduledEndAt: Date;
  }> = [];
  let truncated = wantsTruncate;

  function pushOccurrence(localYmd: string): boolean {
    if (occurrences.length >= MAX_OCCURRENCES) {
      truncated = true;
      return false;
    }
    if (lastEligibleYmd && localYmd > lastEligibleYmd) {
      return false;
    }
    const startAt = fromZonedTime(`${localYmd}T${timeOfDay}:00`, timezone);
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    occurrences.push({ scheduledStartAt: startAt, scheduledEndAt: endAt });
    return true;
  }

  if (cadence === 'monthly') {
    // Monthly fires on the SAME calendar day as anchorDate. daysOfWeek ignored.
    // Skip months that don't have the day (Feb 30 → skip Feb).
    const { year: anchorYear, month: anchorMonth, day: anchorDay } =
      parseYmd(anchorYmd);
    let year = anchorYear;
    let month = anchorMonth;
    while (true) {
      if (isValidCalendarDate(year, month, anchorDay)) {
        const ymd = formatYmd(year, month, anchorDay);
        // Skip dates strictly before the anchor (shouldn't happen since we
        // start at the anchor month, but guard anyway).
        if (ymd >= anchorYmd) {
          if (lastEligibleYmd && ymd > lastEligibleYmd) break;
          const pushed = pushOccurrence(ymd);
          if (!pushed) {
            // Either truncated or past endsOn.
            break;
          }
          if (
            'occurrenceCount' in endCondition &&
            occurrences.length >= targetCount
          ) {
            break;
          }
        }
      }
      // Advance to next month.
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
      // Hard safety bound — at most 12 * MAX_OCCURRENCES months scanned
      // (handles long Feb-30 skip runs without spinning forever).
      if (year - anchorYear > MAX_OCCURRENCES) break;
    }
  } else {
    // weekly / biweekly: emit on each picked weekday, then step by week.
    const stepDays = cadence === 'weekly' ? 7 : 14;

    // Find the earliest emission day within the first cycle. We walk forward
    // up to (stepDays - 1) days from the anchor scanning the picked weekdays
    // in calendar order so the result is always sorted ascending.
    const pickedSorted = Array.from(new Set(daysOfWeek)).sort((a, b) => a - b);

    // The "anchor week" starts at anchorYmd. For each emission cycle we walk
    // days 0..stepDays-1 from the cycle start; the eligible ones are those
    // whose ISO weekday is in the picked set. After the cycle we jump by
    // stepDays calendar days.
    let cycleStartYmd = anchorYmd;
    let firstCycle = true;
    while (true) {
      let emittedInCycle = 0;
      for (let offset = 0; offset < stepDays; offset += 1) {
        const candidateYmd = addDaysYmd(cycleStartYmd, offset);
        // In the first cycle, skip days strictly before the anchor.
        if (firstCycle && candidateYmd < anchorYmd) continue;
        const dow = isoWeekdayFor(candidateYmd, timezone);
        if (!pickedSorted.includes(dow)) continue;
        if (lastEligibleYmd && candidateYmd > lastEligibleYmd) {
          // Past the end — nothing further to emit.
          return { occurrences, truncated };
        }
        const pushed = pushOccurrence(candidateYmd);
        if (!pushed) return { occurrences, truncated };
        emittedInCycle += 1;
        if (
          'occurrenceCount' in endCondition &&
          occurrences.length >= targetCount
        ) {
          return { occurrences, truncated };
        }
      }
      firstCycle = false;
      // If a cycle produced nothing AND we have no end date, we'd loop
      // forever — daysOfWeek is constrained to 1-7 ints so this is only
      // possible when pickedSorted is empty (Zod prevents that). Guard
      // anyway: if no progress was made AND no end date pulls us, stop.
      if (emittedInCycle === 0 && lastEligibleYmd === null) {
        break;
      }
      cycleStartYmd = addDaysYmd(cycleStartYmd, stepDays);
      // Loop termination: stop once we've walked far past endsOn even when
      // no day in the cycle matched.
      if (lastEligibleYmd && cycleStartYmd > lastEligibleYmd) break;
    }
  }

  return { occurrences, truncated };
}

// -------- Audit helper --------

async function writeSeriesAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string | null;
    action: 'appointment_series.created' | 'appointment_series.cancelled';
    entityId: string;
    before: AppointmentSeries | null;
    after: AppointmentSeries | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  // Folding `metadata` into the `after` JSON column. Audit log has no
  // dedicated metadata column; this keeps the row searchable in one place.
  const afterPayload =
    args.after !== null || args.metadata
      ? {
          ...(args.after !== null
            ? (args.after as unknown as Record<string, unknown>)
            : {}),
          ...(args.metadata ? { _metadata: args.metadata } : {}),
        }
      : null;

  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: args.actorUserId ? 'user' : 'system',
      action: args.action,
      entityType: 'appointment_series',
      entityId: args.entityId,
      before: args.before
        ? (args.before as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      after:
        afterPayload === null
          ? Prisma.JsonNull
          : (afterPayload as unknown as Prisma.InputJsonValue),
    },
  });
}

// -------- FK validation (mirrors appointmentService.validateReferences) --------

async function validateSeriesReferences(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    locationId: string;
    clientId: string;
    staffId: string;
    serviceId: string;
  },
): Promise<{
  timezone: string;
  durationMinutes: number;
  basePriceCents: number;
}> {
  const [location, client, staff, service, assignmentCount, assignmentHit] =
    await Promise.all([
      tx.location.findFirst({
        where: { id: args.locationId, tenantId: args.tenantId },
        select: { id: true, timezone: true },
      }),
      tx.client.findFirst({
        where: { id: args.clientId, tenantId: args.tenantId },
        select: { id: true },
      }),
      tx.staff.findFirst({
        where: { id: args.staffId, tenantId: args.tenantId },
        select: { id: true, active: true },
      }),
      tx.service.findFirst({
        where: { id: args.serviceId, tenantId: args.tenantId },
        select: {
          id: true,
          durationMinutes: true,
          basePriceCents: true,
          active: true,
        },
      }),
      tx.staffService.count({
        where: { serviceId: args.serviceId },
      }),
      tx.staffService.findFirst({
        where: { serviceId: args.serviceId, staffId: args.staffId },
        select: { staffId: true },
      }),
    ]);
  if (!location)
    throw new InvalidAppointmentReferenceError(
      'locationId',
      'Unknown location for this tenant.',
    );
  if (!client)
    throw new InvalidAppointmentReferenceError(
      'clientId',
      'Unknown client for this tenant.',
    );
  if (!staff)
    throw new InvalidAppointmentReferenceError(
      'staffId',
      'Unknown staff for this tenant.',
    );
  if (!service)
    throw new InvalidAppointmentReferenceError(
      'serviceId',
      'Unknown service for this tenant.',
    );
  if (assignmentCount > 0 && !assignmentHit) {
    throw new InvalidAppointmentReferenceError(
      'serviceId',
      'This staff member is not assigned to this service.',
    );
  }
  return {
    timezone: location.timezone,
    durationMinutes: service.durationMinutes,
    basePriceCents: service.basePriceCents,
  };
}

// -------- createAppointmentSeries --------

export type CreateSeriesArgs = {
  tenantId: string;
  actorUserId: string;
  body: CreateSeriesBody;
};

export type CreateSeriesConflict = {
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  reason: 'appointment_overlap' | 'staff_schedule_block';
  conflictingId: string | null;
};

export type CreateSeriesResult =
  | {
      ok: true;
      series: AppointmentSeries;
      occurrences: Appointment[];
      truncated: boolean;
    }
  | {
      ok: false;
      conflicts: CreateSeriesConflict[];
    };

export async function createAppointmentSeries(
  prisma: ExtendedPrismaClient,
  args: CreateSeriesArgs,
): Promise<CreateSeriesResult> {
  const { tenantId, actorUserId, body } = args;

  // Sanity check the endCondition union (Zod already enforces shape; this
  // keeps the service callable from tests that bypass Zod).
  const endCondition: EndCondition =
    'occurrenceCount' in body.endCondition
      ? { occurrenceCount: body.endCondition.occurrenceCount }
      : { endsOn: parseYmdAsUtcDate(body.endCondition.endsOn) };
  const anchorAsDate = parseYmdAsUtcDate(body.anchorDate);

  return prisma.$transaction(async (tx) => {
    const { timezone, durationMinutes, basePriceCents } =
      await validateSeriesReferences(tx, {
        tenantId,
        locationId: body.locationId,
        clientId: body.clientId,
        staffId: body.staffId,
        serviceId: body.serviceId,
      });

    const { occurrences, truncated } = expandOccurrenceDates({
      cadence: body.cadence,
      daysOfWeek: body.daysOfWeek,
      timeOfDay: body.timeOfDay,
      durationMinutes,
      anchorDate: anchorAsDate,
      endCondition,
      timezone,
    });

    if (occurrences.length === 0) {
      // No occurrences could be generated (e.g. endsOn before anchor).
      // Caller distinguishes by conflicts.length === 0 and maps to 422.
      const emptyResult: CreateSeriesResult = { ok: false, conflicts: [] };
      return emptyResult;
    }

    // ---- Conflict check (single read covering every generated window) ----
    // Build an OR of half-open overlap predicates: existing.start < occ.end
    // AND existing.end > occ.start. Capped by staffId + tenantId + deletedAt.
    const overlapClauses = occurrences.map((o) => ({
      AND: [
        { scheduledStartAt: { lt: o.scheduledEndAt } },
        { scheduledEndAt: { gt: o.scheduledStartAt } },
      ],
    }));
    const blockClauses = occurrences.map((o) => ({
      AND: [
        { startsAt: { lt: o.scheduledEndAt } },
        { endsAt: { gt: o.scheduledStartAt } },
      ],
    }));

    const [conflictingAppointments, conflictingBlocks] = await Promise.all([
      tx.appointment.findMany({
        where: {
          tenantId,
          staffId: body.staffId,
          state: { notIn: ['cancelled', 'no_show'] },
          OR: overlapClauses,
        },
        select: {
          id: true,
          scheduledStartAt: true,
          scheduledEndAt: true,
        },
      }),
      tx.staffScheduleBlock.findMany({
        where: {
          tenantId,
          staffId: body.staffId,
          deletedAt: null,
          OR: blockClauses,
          AND: [
            {
              OR: [{ locationId: null }, { locationId: body.locationId }],
            },
          ],
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
        },
      }),
    ]);

    if (conflictingAppointments.length > 0 || conflictingBlocks.length > 0) {
      const conflicts: CreateSeriesConflict[] = [];
      for (const occ of occurrences) {
        const overlap = conflictingAppointments.find(
          (c) =>
            c.scheduledStartAt < occ.scheduledEndAt &&
            c.scheduledEndAt > occ.scheduledStartAt,
        );
        if (overlap) {
          conflicts.push({
            scheduledStartAt: occ.scheduledStartAt,
            scheduledEndAt: occ.scheduledEndAt,
            reason: 'appointment_overlap',
            conflictingId: overlap.id,
          });
          continue;
        }
        const block = conflictingBlocks.find(
          (b) =>
            b.startsAt < occ.scheduledEndAt &&
            b.endsAt > occ.scheduledStartAt,
        );
        if (block) {
          conflicts.push({
            scheduledStartAt: occ.scheduledStartAt,
            scheduledEndAt: occ.scheduledEndAt,
            reason: 'staff_schedule_block',
            conflictingId: block.id,
          });
        }
      }
      const conflictResult: CreateSeriesResult = { ok: false, conflicts };
      return conflictResult;
    }

    // ---- Persist series + occurrences ----
    const series = await tx.appointmentSeries.create({
      data: {
        tenantId,
        clientId: body.clientId,
        staffId: body.staffId,
        serviceId: body.serviceId,
        locationId: body.locationId,
        cadence: body.cadence,
        daysOfWeek: body.daysOfWeek,
        timeOfDay: body.timeOfDay,
        durationMinutesSnapshot: durationMinutes,
        priceCentsSnapshot: basePriceCents,
        anchorDate: anchorAsDate,
        occurrenceCount:
          'occurrenceCount' in body.endCondition
            ? body.endCondition.occurrenceCount
            : null,
        endsOn:
          'endsOn' in body.endCondition
            ? parseYmdAsUtcDate(body.endCondition.endsOn)
            : null,
        createdByUserId: actorUserId,
      },
    });

    try {
      await tx.appointment.createMany({
        data: occurrences.map((o) => ({
          tenantId,
          locationId: body.locationId,
          clientId: body.clientId,
          staffId: body.staffId,
          serviceId: body.serviceId,
          scheduledStartAt: o.scheduledStartAt,
          scheduledEndAt: o.scheduledEndAt,
          state: 'confirmed' as const,
          createdByUserId: actorUserId,
          bookedBasePriceCents: basePriceCents,
          source: 'staff' as const,
          seriesId: series.id,
        })),
      });
    } catch (err) {
      if (isExclusionViolation(err)) {
        // Race: someone booked the same slot between our conflict read and
        // the createMany. Surface as a conflict result so the tx rolls back.
        // We don't know which occurrence collided; map them all to a generic
        // appointment_overlap with conflictingId=null.
        const conflicts: CreateSeriesConflict[] = occurrences.map((o) => ({
          scheduledStartAt: o.scheduledStartAt,
          scheduledEndAt: o.scheduledEndAt,
          reason: 'appointment_overlap',
          conflictingId: null,
        }));
        // Throw a sentinel so Prisma rolls the tx back; map to result outside.
        throw new SeriesRaceConflict(conflicts);
      }
      throw err;
    }

    const createdOccurrences = await tx.appointment.findMany({
      where: { tenantId, seriesId: series.id },
      orderBy: { scheduledStartAt: 'asc' },
    });

    await writeSeriesAudit(tx, {
      tenantId,
      actorUserId,
      action: 'appointment_series.created',
      entityId: series.id,
      before: null,
      after: series,
      metadata: {
        occurrenceCount: createdOccurrences.length,
        truncated,
        cadence: body.cadence,
      },
    });

    const okResult: CreateSeriesResult = {
      ok: true,
      series,
      occurrences: createdOccurrences,
      truncated,
    };
    return okResult;
  }).catch((err) => {
    if (err instanceof SeriesRaceConflict) {
      const conflictResult: CreateSeriesResult = {
        ok: false,
        conflicts: err.conflicts,
      };
      return conflictResult;
    }
    throw err;
  });
}

// Sentinel thrown when the DB EXCLUDE constraint catches a race after our
// pre-check passed. Caught at the outer await to convert into a CreateSeriesResult.
class SeriesRaceConflict extends Error {
  conflicts: CreateSeriesConflict[];
  constructor(conflicts: CreateSeriesConflict[]) {
    super('Series occurrences raced an external booking.');
    this.name = 'SeriesRaceConflict';
    this.conflicts = conflicts;
  }
}

// Parse YYYY-MM-DD into a UTC Date at 00:00:00. Used for Prisma @db.Date
// columns — Prisma serializes a Date to a date-only string when the column
// is typed Date, so the time-of-day component is irrelevant on disk.
function parseYmdAsUtcDate(date: string): Date {
  const { year, month, day } = parseYmd(date);
  return new Date(Date.UTC(year, month - 1, day));
}

// -------- cancelAppointmentSeries --------

export async function cancelAppointmentSeries(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    reason?: string;
  },
): Promise<{
  cancelledOccurrences: number;
  alreadyTerminal: boolean;
}> {
  const { tenantId, actorUserId, id, reason } = args;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const series = await tx.appointmentSeries.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!series) {
      // Caller maps null-like result to 404 by checking alreadyTerminal=false
      // + cancelledOccurrences=0. Easier path: throw a sentinel.
      throw new SeriesNotFoundError();
    }

    if (series.status !== 'active') {
      return { cancelledOccurrences: 0, alreadyTerminal: true };
    }

    const updatedSeries = await tx.appointmentSeries.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: now,
        cancelledByUserId: actorUserId,
        cancelReason: reason ?? null,
      },
    });

    // Bulk-cancel future, non-terminal occurrences. updateMany bypasses
    // per-row audit writes by design — we write ONE audit row below for
    // the series-level action.
    const cancelMessage = `Series cancelled: ${reason ?? 'no reason'}`;
    const updateResult = await tx.appointment.updateMany({
      where: {
        tenantId,
        seriesId: id,
        scheduledStartAt: { gt: now },
        state: { notIn: ['cancelled', 'no_show', 'completed'] },
      },
      data: {
        state: 'cancelled',
        cancelledAt: now,
        cancelledByUserId: actorUserId,
        cancelReason: cancelMessage,
      },
    });

    await writeSeriesAudit(tx, {
      tenantId,
      actorUserId,
      action: 'appointment_series.cancelled',
      entityId: id,
      before: series,
      after: updatedSeries,
      metadata: {
        cancelledOccurrences: updateResult.count,
        reason: reason ?? null,
      },
    });

    return {
      cancelledOccurrences: updateResult.count,
      alreadyTerminal: false,
    };
  });
}

export class SeriesNotFoundError extends Error {
  code = 'SERIES_NOT_FOUND' as const;
  constructor() {
    super('Series not found.');
    this.name = 'SeriesNotFoundError';
  }
}

// -------- getAppointmentSeriesById --------

export async function getAppointmentSeriesById(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; id: string },
): Promise<{
  series: AppointmentSeries;
  occurrences: Appointment[];
} | null> {
  const series = await prisma.appointmentSeries.findFirst({
    where: { id: args.id, tenantId: args.tenantId, deletedAt: null },
  });
  if (!series) return null;
  const occurrences = await prisma.appointment.findMany({
    where: { tenantId: args.tenantId, seriesId: series.id },
    orderBy: { scheduledStartAt: 'asc' },
  });
  return { series, occurrences };
}

// -------- listAppointmentSeries --------

export type ListSeriesRow = {
  seriesId: string;
  cadence: SeriesCadence;
  status: AppointmentSeriesStatus;
  clientId: string;
  clientFirstName: string;
  clientLastName: string | null;
  staffId: string;
  serviceId: string;
  nextOccurrenceAt: Date | null;
  remainingOccurrences: number;
  createdAt: Date;
};

const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 100;

// Encode a (createdAt, id) tuple as an opaque base64 cursor.
function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString(
    'base64url',
  );
}

function decodeCursor(
  raw: string,
): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const idx = decoded.indexOf('|');
    if (idx < 0) return null;
    const iso = decoded.slice(0, idx);
    const id = decoded.slice(idx + 1);
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export async function listAppointmentSeries(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; query: ListSeriesQuery },
): Promise<{
  rows: ListSeriesRow[];
  nextCursor: string | null;
}> {
  const { tenantId, query } = args;
  const limit = Math.min(query.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);

  const where: Prisma.AppointmentSeriesWhereInput = {
    tenantId,
    deletedAt: null,
  };
  if (query.clientId) where.clientId = query.clientId;
  if (query.staffId) where.staffId = query.staffId;
  if (query.status) where.status = query.status;

  // Cursor: order by createdAt DESC, id DESC. A row is "after" cursor C if
  // (createdAt < C.createdAt) OR (createdAt == C.createdAt AND id < C.id).
  if (query.cursor) {
    const parsed = decodeCursor(query.cursor);
    if (parsed) {
      where.OR = [
        { createdAt: { lt: parsed.createdAt } },
        {
          AND: [
            { createdAt: parsed.createdAt },
            { id: { lt: parsed.id } },
          ],
        },
      ];
    }
  }

  const seriesRows = await prisma.appointmentSeries.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      cadence: true,
      status: true,
      clientId: true,
      staffId: true,
      serviceId: true,
      createdAt: true,
      occurrenceCount: true,
      endsOn: true,
      client: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  const hasMore = seriesRows.length > limit;
  const trimmed = hasMore ? seriesRows.slice(0, limit) : seriesRows;

  // For each series, look up:
  //   - next future, non-terminal occurrence
  //   - remaining (non-terminal, future or in-progress) occurrence count
  // We could batch these via a single groupBy, but per-series queries are
  // fine for the page size (max 100) and keep the code obvious.
  const now = new Date();
  const seriesIds = trimmed.map((s) => s.id);

  const [nextOccurrences, remainingCounts] = await Promise.all([
    seriesIds.length > 0
      ? prisma.appointment.findMany({
          where: {
            tenantId,
            seriesId: { in: seriesIds },
            scheduledStartAt: { gt: now },
            state: { notIn: ['cancelled', 'no_show', 'completed'] },
          },
          select: { seriesId: true, scheduledStartAt: true },
          orderBy: { scheduledStartAt: 'asc' },
        })
      : Promise.resolve([] as Array<{
          seriesId: string | null;
          scheduledStartAt: Date;
        }>),
    seriesIds.length > 0
      ? prisma.appointment.groupBy({
          by: ['seriesId'],
          where: {
            tenantId,
            seriesId: { in: seriesIds },
            scheduledStartAt: { gt: now },
            state: { notIn: ['cancelled', 'no_show', 'completed'] },
          },
          _count: { _all: true },
        })
      : Promise.resolve(
          [] as Array<{ seriesId: string | null; _count: { _all: number } }>,
        ),
  ]);

  const nextBySeries = new Map<string, Date>();
  for (const occ of nextOccurrences) {
    if (occ.seriesId && !nextBySeries.has(occ.seriesId)) {
      nextBySeries.set(occ.seriesId, occ.scheduledStartAt);
    }
  }
  const remainingBySeries = new Map<string, number>();
  for (const row of remainingCounts) {
    if (row.seriesId) {
      remainingBySeries.set(row.seriesId, row._count._all);
    }
  }

  const rows: ListSeriesRow[] = trimmed.map((s) => ({
    seriesId: s.id,
    cadence: s.cadence,
    status: s.status,
    clientId: s.clientId,
    clientFirstName: s.client.firstName,
    clientLastName: s.client.lastName,
    staffId: s.staffId,
    serviceId: s.serviceId,
    nextOccurrenceAt: nextBySeries.get(s.id) ?? null,
    remainingOccurrences: remainingBySeries.get(s.id) ?? 0,
    createdAt: s.createdAt,
  }));

  const last = trimmed[trimmed.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return { rows, nextCursor };
}
