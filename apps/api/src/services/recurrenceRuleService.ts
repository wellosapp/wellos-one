import { Prisma } from '@prisma/client';
import type { RecurrenceRule } from '@prisma/client';
import { addWeeks, startOfDay } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  CreateRecurrenceRuleBody,
  ListRecurrenceRulesQuery,
  UpdateRecurrenceRuleBody,
} from '../schemas/recurrenceRule.js';

// Domain layer for RecurrenceRule admin CRUD (Phase 2b of the Classes epic).
// Mirrors classInstanceService.ts. Phase 2b ships the rule + a manual
// "Generate next N weeks" endpoint; the cron that runs the generator
// weekly is deferred to Epic 8 (BullMQ infrastructure not yet wired).
//
// Tenant scoping: every query passes tenantId and every FK reference
// (classId, staffId, locationId) is validated against the caller's tenant
// before insert/update. Staff must also be in the class's eligible
// instructor pool — same check as classInstanceService.
//
// Audit log: create/update/generate all write inside the same transaction.
// Action names: recurrence_rule.created, recurrence_rule.updated,
// recurrence_rule.generated. No hard delete — pause via active=false.
//
// Timezone correctness: byday + startTime live in the rule's timezone.
// generateInstancesForRule walks calendar dates in that zone and converts
// each (date, time) wall-clock pair to UTC via date-fns-tz.fromZonedTime
// so DST flips don't shift the class's local hour.

const RECURRENCE_RULE_SAFE_FIELDS = {
  id: true,
  tenantId: true,
  classId: true,
  staffId: true,
  locationId: true,
  startDate: true,
  endDate: true,
  byday: true,
  startTime: true,
  durationMinutes: true,
  timezone: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RecurrenceRuleSelect;

const CLASS_SUMMARY_SELECT = {
  id: true,
  name: true,
  color: true,
  durationMinutes: true,
} satisfies Prisma.ClassSelect;

const STAFF_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  jobTitle: true,
} satisfies Prisma.StaffSelect;

const LOCATION_SUMMARY_SELECT = {
  id: true,
  name: true,
} satisfies Prisma.LocationSelect;

const RECURRENCE_RULE_WITH_RELATIONS_SELECT = {
  ...RECURRENCE_RULE_SAFE_FIELDS,
  class: { select: CLASS_SUMMARY_SELECT },
  staff: { select: STAFF_SUMMARY_SELECT },
  location: { select: LOCATION_SUMMARY_SELECT },
} satisfies Prisma.RecurrenceRuleSelect;

export type RecurrenceRuleWithRelations = Prisma.RecurrenceRuleGetPayload<{
  select: typeof RECURRENCE_RULE_WITH_RELATIONS_SELECT;
}>;

// Thrown when a referenced FK doesn't belong to caller's tenant. Route
// layer maps to 400 with the field surface.
export class InvalidRecurrenceRuleReferenceError extends Error {
  code = 'INVALID_RECURRENCE_RULE_REFERENCE' as const;
  field: 'classId' | 'staffId' | 'locationId';
  constructor(
    field: 'classId' | 'staffId' | 'locationId',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidRecurrenceRuleReferenceError';
    this.field = field;
  }
}

// Specifically: staff exists in this tenant, but is not in the class's
// instructor pool. Distinct from generic InvalidRecurrenceRuleReferenceError
// so the UI can offer a more helpful message.
export class InvalidInstructorForRecurrenceRuleError extends Error {
  code = 'INVALID_INSTRUCTOR_FOR_CLASS' as const;
  staffId: string;
  classId: string;
  constructor(args: { staffId: string; classId: string }) {
    super(
      'This staff member is not in the eligible-instructor pool for this class. Add them on the Class detail page first.',
    );
    this.name = 'InvalidInstructorForRecurrenceRuleError';
    this.staffId = args.staffId;
    this.classId = args.classId;
  }
}

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action:
      | 'recurrence_rule.created'
      | 'recurrence_rule.updated'
      | 'recurrence_rule.generated';
    entityId: string;
    before: RecurrenceRule | null;
    after: RecurrenceRule | { created: number; skipped: number } | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: 'recurrence_rule',
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

async function validateClass(
  tx: ExtendedTransactionClient,
  args: { tenantId: string; classId: string },
): Promise<void> {
  const klass = await tx.class.findFirst({
    where: { tenantId: args.tenantId, id: args.classId },
    select: { id: true },
  });
  if (!klass) {
    throw new InvalidRecurrenceRuleReferenceError(
      'classId',
      'Unknown class for this tenant.',
    );
  }
}

async function validateLocation(
  tx: ExtendedTransactionClient,
  args: { tenantId: string; locationId: string },
): Promise<void> {
  const loc = await tx.location.findFirst({
    where: { id: args.locationId, tenantId: args.tenantId },
    select: { id: true },
  });
  if (!loc) {
    throw new InvalidRecurrenceRuleReferenceError(
      'locationId',
      'Unknown location for this tenant.',
    );
  }
}

// Validates staff belongs to tenant AND is in the eligible-instructor pool
// for the given class. Mirrors classInstanceService.validateStaffIsEligibleInstructor.
async function validateStaffIsEligibleInstructor(
  tx: ExtendedTransactionClient,
  args: { tenantId: string; classId: string; staffId: string },
): Promise<void> {
  const [staff, instructorRow] = await Promise.all([
    tx.staff.findFirst({
      where: { id: args.staffId, tenantId: args.tenantId },
      select: { id: true },
    }),
    tx.classInstructor.findFirst({
      where: { classId: args.classId, staffId: args.staffId },
      select: { staffId: true },
    }),
  ]);
  if (!staff) {
    throw new InvalidRecurrenceRuleReferenceError(
      'staffId',
      'Unknown staff for this tenant.',
    );
  }
  if (!instructorRow) {
    throw new InvalidInstructorForRecurrenceRuleError({
      staffId: args.staffId,
      classId: args.classId,
    });
  }
}

// "YYYY-MM-DD" → Date at UTC midnight. Prisma's @db.Date column round-trips
// at UTC midnight so this keeps the storage canonical regardless of server tz.
function parseIsoDateToUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export async function createRecurrenceRule(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    body: CreateRecurrenceRuleBody;
  },
): Promise<{ rule: RecurrenceRule }> {
  const { tenantId, actorUserId, body } = args;

  return prisma.$transaction(async (tx) => {
    await Promise.all([
      validateClass(tx, { tenantId, classId: body.classId }),
      validateLocation(tx, { tenantId, locationId: body.locationId }),
      validateStaffIsEligibleInstructor(tx, {
        tenantId,
        classId: body.classId,
        staffId: body.staffId,
      }),
    ]);

    const rule = await tx.recurrenceRule.create({
      data: {
        tenantId,
        classId: body.classId,
        staffId: body.staffId,
        locationId: body.locationId,
        startDate: parseIsoDateToUtc(body.startDate),
        endDate: body.endDate ? parseIsoDateToUtc(body.endDate) : null,
        byday: body.byday as unknown as Prisma.InputJsonValue,
        startTime: body.startTime,
        durationMinutes: body.durationMinutes,
        timezone: body.timezone,
        active: body.active,
      },
      select: RECURRENCE_RULE_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'recurrence_rule.created',
      entityId: rule.id,
      before: null,
      after: rule as RecurrenceRule,
    });

    return { rule: rule as RecurrenceRule };
  });
}

export async function listRecurrenceRules(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    query: ListRecurrenceRulesQuery;
  },
): Promise<{ rules: RecurrenceRuleWithRelations[]; total: number }> {
  const { tenantId, query } = args;

  const where: Prisma.RecurrenceRuleWhereInput = { tenantId };
  if (query.classId) where.classId = query.classId;
  if (query.active !== undefined) where.active = query.active;

  const [rows, total] = await Promise.all([
    prisma.recurrenceRule.findMany({
      where,
      select: RECURRENCE_RULE_WITH_RELATIONS_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: query.take,
      skip: query.skip,
    }),
    prisma.recurrenceRule.count({ where }),
  ]);

  return { rules: rows, total };
}

export async function getRecurrenceRuleById(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; id: string },
): Promise<RecurrenceRuleWithRelations | null> {
  return prisma.recurrenceRule.findFirst({
    where: { tenantId: args.tenantId, id: args.id },
    select: RECURRENCE_RULE_WITH_RELATIONS_SELECT,
  });
}

export async function updateRecurrenceRule(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    body: UpdateRecurrenceRuleBody;
  },
): Promise<{ rule: RecurrenceRule } | null> {
  const { tenantId, actorUserId, id, body } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.recurrenceRule.findFirst({
      where: { tenantId, id },
      select: RECURRENCE_RULE_SAFE_FIELDS,
    });
    if (!before) return null;

    if (body.locationId !== undefined) {
      await validateLocation(tx, { tenantId, locationId: body.locationId });
    }
    if (body.staffId !== undefined) {
      await validateStaffIsEligibleInstructor(tx, {
        tenantId,
        classId: before.classId,
        staffId: body.staffId,
      });
    }

    // Cross-field date check: if only one of startDate/endDate is being
    // updated, validate against the existing row's other bound. The Zod
    // refine only catches the case where both are present in the payload.
    const nextStartDate =
      body.startDate !== undefined
        ? parseIsoDateToUtc(body.startDate)
        : before.startDate;
    const nextEndDate =
      body.endDate === null
        ? null
        : body.endDate !== undefined
          ? parseIsoDateToUtc(body.endDate)
          : before.endDate;
    if (nextEndDate && nextEndDate < nextStartDate) {
      throw new InvalidRecurrenceRuleReferenceError(
        // Surface this as an endDate field error so the UI highlights the
        // right input. classId is the only path the route mapper handles
        // for this error class — extend it here if you add another field.
        'classId',
        'endDate must be on or after startDate',
      );
    }

    const data: Prisma.RecurrenceRuleUpdateInput = {};
    if (body.staffId !== undefined) {
      data.staff = { connect: { id: body.staffId } };
    }
    if (body.locationId !== undefined) {
      data.location = { connect: { id: body.locationId } };
    }
    if (body.startDate !== undefined) {
      data.startDate = parseIsoDateToUtc(body.startDate);
    }
    if (body.endDate !== undefined) {
      data.endDate = body.endDate ? parseIsoDateToUtc(body.endDate) : null;
    }
    if (body.byday !== undefined) {
      data.byday = body.byday as unknown as Prisma.InputJsonValue;
    }
    if (body.startTime !== undefined) data.startTime = body.startTime;
    if (body.durationMinutes !== undefined) {
      data.durationMinutes = body.durationMinutes;
    }
    if (body.timezone !== undefined) data.timezone = body.timezone;
    if (body.active !== undefined) data.active = body.active;

    const after = await tx.recurrenceRule.update({
      where: { id },
      data,
      select: RECURRENCE_RULE_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'recurrence_rule.updated',
      entityId: after.id,
      before: before as RecurrenceRule,
      after: after as RecurrenceRule,
    });

    return { rule: after as RecurrenceRule };
  });
}

// Maps JS Date.getUTCDay() (0=Sun..6=Sat) to RFC 5545 byday codes.
const DOW_CODES: readonly string[] = [
  'SU',
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
];

export type GenerateInstancesResult = {
  created: number;
  skipped: number;
  skippedReason?: 'rule_not_found' | 'rule_inactive' | 'window_empty';
};

// Idempotent generator. Walks every calendar date in the window, picks the
// ones whose day-of-week matches rule.byday, composes the local
// (date + startTime) string and converts to UTC via fromZonedTime, then
// bulk-inserts only the ones not already present for this rule.
//
// Window: max(rule.startDate, today) → min(rule.endDate ?? infinity,
//         today + horizonWeeks). Past dates are skipped (no point
//         generating history). Re-runs are safe — existing rows for
//         this rule in the window are skipped via Set membership.
//
// scheduledEndAt = scheduledStartAt + class.duration + bufferBefore +
// bufferAfter (same formula as classInstanceService.computeEndAt).
export async function generateInstancesForRule(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    ruleId: string;
    horizonWeeks: number;
    actorUserId: string;
  },
): Promise<GenerateInstancesResult> {
  const rule = await prisma.recurrenceRule.findFirst({
    where: { id: args.ruleId, tenantId: args.tenantId },
    include: {
      class: {
        select: {
          id: true,
          durationMinutes: true,
          bufferBeforeMinutes: true,
          bufferAfterMinutes: true,
        },
      },
    },
  });
  if (!rule) return { created: 0, skipped: 0, skippedReason: 'rule_not_found' };
  if (!rule.active) {
    return { created: 0, skipped: 0, skippedReason: 'rule_inactive' };
  }

  const today = startOfDay(new Date());
  const start = rule.startDate > today ? rule.startDate : today;
  const horizonEnd = addWeeks(today, args.horizonWeeks);
  const end =
    rule.endDate && rule.endDate < horizonEnd ? rule.endDate : horizonEnd;

  if (end < start) {
    return { created: 0, skipped: 0, skippedReason: 'window_empty' };
  }

  // byday is stored as Prisma.Json — coerce. Schema constrains it to the
  // 7-value enum at write time, so a runtime check would only fire on a
  // hand-tampered row.
  const byday = (rule.byday as unknown as string[]) ?? [];

  // Enumerate candidate UTC start datetimes in the window. We walk by
  // local-date strings (in the rule's timezone) rather than Date deltas
  // because 24h-delta walking can skip or repeat a calendar day across
  // DST transitions. Bound the walk by the local-date string for `start`
  // and `end` so the window is inclusive on both ends.
  const startLocal = formatInTimeZone(start, rule.timezone, 'yyyy-MM-dd');
  const endLocal = formatInTimeZone(end, rule.timezone, 'yyyy-MM-dd');
  const candidates: Date[] = [];
  let cursor = startLocal;
  // Loop guard — at 1 day per iteration, horizonWeeks=52 caps at ~365 dates.
  // Use 400 as a safety ceiling so a malformed end string can't infinite-loop.
  for (let i = 0; i < 400 && cursor <= endLocal; i++) {
    // Compose midnight in the rule's tz to read day-of-week locally.
    const midnightUtc = fromZonedTime(`${cursor}T00:00:00`, rule.timezone);
    const dowNum = Number(
      formatInTimeZone(midnightUtc, rule.timezone, 'i'),
    ); // ISO 1-7, Mon=1..Sun=7
    const dowIdx = dowNum === 7 ? 0 : dowNum; // map ISO Sun=7 to JS Sun=0
    const dow = DOW_CODES[dowIdx];
    if (dow && byday.includes(dow)) {
      const utc = fromZonedTime(
        `${cursor}T${rule.startTime}:00`,
        rule.timezone,
      );
      candidates.push(utc);
    }
    // Advance one local day. parse cursor → add 1 day in UTC space → format
    // back to local-date. Using UTC arithmetic on a date-only string is
    // DST-safe because we're not crossing a midnight wall-clock.
    const [yy, mm, dd] = cursor.split('-').map(Number);
    const nextUtc = new Date(Date.UTC(yy!, mm! - 1, dd! + 1));
    cursor = `${nextUtc.getUTCFullYear()}-${String(nextUtc.getUTCMonth() + 1).padStart(2, '0')}-${String(nextUtc.getUTCDate()).padStart(2, '0')}`;
  }

  if (candidates.length === 0) {
    // Audit a zero-result generation too, so ops can see the button was
    // pressed even when nothing materialised (helpful for debugging
    // "why didn't my Tuesday show up").
    await prisma.auditLog.create({
      data: {
        tenantId: args.tenantId,
        actorUserId: args.actorUserId,
        actorType: 'user',
        action: 'recurrence_rule.generated',
        entityType: 'recurrence_rule',
        entityId: rule.id,
        before: Prisma.JsonNull,
        after: { created: 0, skipped: 0 } as Prisma.InputJsonValue,
      },
    });
    return { created: 0, skipped: 0 };
  }

  // Idempotency: fetch existing instances for this rule in the candidate
  // window and skip matches by exact UTC timestamp.
  const windowStart = candidates[0]!;
  const windowEnd = candidates[candidates.length - 1]!;
  const existing = await prisma.classInstance.findMany({
    where: {
      recurrenceRuleId: rule.id,
      scheduledStartAt: { gte: windowStart, lte: windowEnd },
    },
    select: { scheduledStartAt: true },
  });
  const existingTimes = new Set(
    existing.map((e) => e.scheduledStartAt.toISOString()),
  );

  const toInsert = candidates.filter(
    (c) => !existingTimes.has(c.toISOString()),
  );

  const totalMinutes =
    rule.class.durationMinutes +
    rule.class.bufferBeforeMinutes +
    rule.class.bufferAfterMinutes;

  if (toInsert.length > 0) {
    await prisma.classInstance.createMany({
      data: toInsert.map((startAt) => ({
        tenantId: args.tenantId,
        classId: rule.classId,
        staffId: rule.staffId,
        locationId: rule.locationId,
        scheduledStartAt: startAt,
        scheduledEndAt: new Date(startAt.getTime() + totalMinutes * 60_000),
        state: 'scheduled',
        recurrenceRuleId: rule.id,
      })),
    });
  }

  await prisma.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: 'recurrence_rule.generated',
      entityType: 'recurrence_rule',
      entityId: rule.id,
      before: Prisma.JsonNull,
      after: {
        created: toInsert.length,
        skipped: candidates.length - toInsert.length,
        horizonWeeks: args.horizonWeeks,
      } as Prisma.InputJsonValue,
    },
  });

  return {
    created: toInsert.length,
    skipped: candidates.length - toInsert.length,
  };
}
