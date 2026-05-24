import { Prisma } from '@prisma/client';
import type { ClassInstance } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  CreateClassInstanceBody,
  ListClassInstancesQuery,
  UpdateClassInstanceBody,
} from '../schemas/classInstance.js';

// Domain layer for ClassInstance admin CRUD (Phase 2a of the Classes epic).
// Mirrors classService.ts. Phase 2a only ships manual scheduling of one-off
// occurrences; RecurrenceRule + cron come in Phase 2b, bookings + check-in
// in Phase 3-4.
//
// Tenant scoping: every query passes tenantId and every FK reference
// (classId, staffId, locationId) is validated against the caller's tenant
// before insert/update. Cross-tenant slip-through is the main risk surface.
//
// Audit log: create/update/cancel write inside the same transaction. Action
// names: class_instance.created, class_instance.updated, class_instance.cancelled.
//
// scheduledEndAt: server-computed from class.duration_minutes + buffer_before +
// buffer_after when the caller omits it. The buffer minutes ARE part of the
// instance's blocked time on the calendar even though students aren't
// "in class" yet — same convention as Service buffers in appointmentService.
//
// Eligible instructor check: when creating/updating, the staffId must
// already be in the class_instructors join for the target classId. We
// surface a clear error (INVALID_INSTRUCTOR_FOR_CLASS) so the route layer
// can return a 400 with a field-style issue.

const CLASS_INSTANCE_SAFE_FIELDS = {
  id: true,
  tenantId: true,
  classId: true,
  staffId: true,
  locationId: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  capacityOverride: true,
  waitlistOverride: true,
  state: true,
  cancelledReason: true,
  cancelledAt: true,
  recurrenceRuleId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClassInstanceSelect;

const CLASS_SUMMARY_SELECT = {
  id: true,
  name: true,
  color: true,
  durationMinutes: true,
  maxCapacity: true,
  waitlistLimit: true,
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

const CLASS_INSTANCE_WITH_RELATIONS_SELECT = {
  ...CLASS_INSTANCE_SAFE_FIELDS,
  class: { select: CLASS_SUMMARY_SELECT },
  staff: { select: STAFF_SUMMARY_SELECT },
  location: { select: LOCATION_SUMMARY_SELECT },
} satisfies Prisma.ClassInstanceSelect;

export type ClassInstanceWithRelations = Prisma.ClassInstanceGetPayload<{
  select: typeof CLASS_INSTANCE_WITH_RELATIONS_SELECT;
}>;

// Thrown when a referenced FK doesn't belong to caller's tenant or when
// the staff member is not in the class's eligible-instructors list. Route
// layer maps to 400 with the field surface.
export class InvalidClassInstanceReferenceError extends Error {
  code = 'INVALID_CLASS_INSTANCE_REFERENCE' as const;
  field: 'classId' | 'staffId' | 'locationId';
  constructor(
    field: 'classId' | 'staffId' | 'locationId',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidClassInstanceReferenceError';
    this.field = field;
  }
}

// Specifically: staff exists in this tenant, but is not in the class's
// instructor pool. Distinct from generic InvalidClassInstanceReferenceError
// so the UI can offer a more helpful message ("Add them as an instructor first").
export class InvalidInstructorForClassError extends Error {
  code = 'INVALID_INSTRUCTOR_FOR_CLASS' as const;
  staffId: string;
  classId: string;
  constructor(args: { staffId: string; classId: string }) {
    super(
      'This staff member is not in the eligible-instructor pool for this class. Add them on the Class detail page first.',
    );
    this.name = 'InvalidInstructorForClassError';
    this.staffId = args.staffId;
    this.classId = args.classId;
  }
}

export class ClassInstanceAlreadyCancelledError extends Error {
  code = 'CLASS_INSTANCE_ALREADY_CANCELLED' as const;
  constructor() {
    super('This class instance is already cancelled.');
    this.name = 'ClassInstanceAlreadyCancelledError';
  }
}

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action:
      | 'class_instance.created'
      | 'class_instance.updated'
      | 'class_instance.cancelled';
    entityId: string;
    before: ClassInstance | null;
    after: ClassInstance | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: 'class_instance',
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

type ClassForScheduling = {
  id: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
};

async function loadTenantClass(
  tx: ExtendedTransactionClient,
  args: { tenantId: string; classId: string },
): Promise<ClassForScheduling> {
  const klass = await tx.class.findFirst({
    where: { tenantId: args.tenantId, id: args.classId },
    select: {
      id: true,
      durationMinutes: true,
      bufferBeforeMinutes: true,
      bufferAfterMinutes: true,
    },
  });
  if (!klass) {
    throw new InvalidClassInstanceReferenceError(
      'classId',
      'Unknown class for this tenant.',
    );
  }
  return klass;
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
    throw new InvalidClassInstanceReferenceError(
      'locationId',
      'Unknown location for this tenant.',
    );
  }
}

// Validates staff belongs to tenant AND is in the eligible-instructor pool
// for the given class. Both checks happen here so callers can't accidentally
// skip the pool check.
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
    throw new InvalidClassInstanceReferenceError(
      'staffId',
      'Unknown staff for this tenant.',
    );
  }
  if (!instructorRow) {
    throw new InvalidInstructorForClassError({
      staffId: args.staffId,
      classId: args.classId,
    });
  }
}

function computeEndAt(start: Date, klass: ClassForScheduling): Date {
  const totalMinutes =
    klass.durationMinutes +
    klass.bufferBeforeMinutes +
    klass.bufferAfterMinutes;
  return new Date(start.getTime() + totalMinutes * 60_000);
}

export async function createClassInstance(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    body: CreateClassInstanceBody;
  },
): Promise<{ instance: ClassInstance }> {
  const { tenantId, actorUserId, body } = args;
  const startAt = new Date(body.scheduledStartAt);

  return prisma.$transaction(async (tx) => {
    const klass = await loadTenantClass(tx, {
      tenantId,
      classId: body.classId,
    });
    await Promise.all([
      validateLocation(tx, { tenantId, locationId: body.locationId }),
      validateStaffIsEligibleInstructor(tx, {
        tenantId,
        classId: body.classId,
        staffId: body.staffId,
      }),
    ]);

    const endAt = body.scheduledEndAt
      ? new Date(body.scheduledEndAt)
      : computeEndAt(startAt, klass);

    const instance = await tx.classInstance.create({
      data: {
        tenantId,
        classId: body.classId,
        staffId: body.staffId,
        locationId: body.locationId,
        scheduledStartAt: startAt,
        scheduledEndAt: endAt,
        capacityOverride: body.capacityOverride ?? null,
        waitlistOverride: body.waitlistOverride ?? null,
        state: 'scheduled',
      },
      select: CLASS_INSTANCE_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'class_instance.created',
      entityId: instance.id,
      before: null,
      after: instance as ClassInstance,
    });

    return { instance: instance as ClassInstance };
  });
}

export async function listClassInstances(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    query: ListClassInstancesQuery;
  },
): Promise<{ instances: ClassInstanceWithRelations[]; total: number }> {
  const { tenantId, query } = args;

  const where: Prisma.ClassInstanceWhereInput = { tenantId };
  if (query.classId) where.classId = query.classId;
  if (query.staffId) where.staffId = query.staffId;
  if (query.locationId) where.locationId = query.locationId;
  if (query.state) where.state = query.state;
  if (query.fromDate || query.toDate) {
    where.scheduledStartAt = {};
    if (query.fromDate) where.scheduledStartAt.gte = new Date(query.fromDate);
    if (query.toDate) where.scheduledStartAt.lt = new Date(query.toDate);
  }

  const [rows, total] = await Promise.all([
    prisma.classInstance.findMany({
      where,
      select: CLASS_INSTANCE_WITH_RELATIONS_SELECT,
      orderBy: [{ scheduledStartAt: 'asc' }, { id: 'asc' }],
      take: query.take,
      skip: query.skip,
    }),
    prisma.classInstance.count({ where }),
  ]);

  return { instances: rows, total };
}

export async function getClassInstanceById(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; id: string },
): Promise<ClassInstanceWithRelations | null> {
  return prisma.classInstance.findFirst({
    where: { tenantId: args.tenantId, id: args.id },
    select: CLASS_INSTANCE_WITH_RELATIONS_SELECT,
  });
}

export async function updateClassInstance(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    body: UpdateClassInstanceBody;
  },
): Promise<{ instance: ClassInstance } | null> {
  const { tenantId, actorUserId, id, body } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.classInstance.findFirst({
      where: { tenantId, id },
      select: CLASS_INSTANCE_SAFE_FIELDS,
    });
    if (!before) return null;

    const nextStaffId = body.staffId ?? before.staffId;
    const nextLocationId = body.locationId ?? before.locationId;

    if (body.locationId !== undefined) {
      await validateLocation(tx, { tenantId, locationId: nextLocationId });
    }
    if (body.staffId !== undefined) {
      await validateStaffIsEligibleInstructor(tx, {
        tenantId,
        classId: before.classId,
        staffId: nextStaffId,
      });
    }

    // Recompute scheduledEndAt from class duration + buffers ONLY when start
    // moves AND the caller did not explicitly set an end. If they passed an
    // end explicitly, honour it.
    let nextStartAt: Date | undefined;
    let nextEndAt: Date | undefined;
    if (body.scheduledStartAt !== undefined) {
      nextStartAt = new Date(body.scheduledStartAt);
    }
    if (body.scheduledEndAt !== undefined) {
      nextEndAt = new Date(body.scheduledEndAt);
    } else if (nextStartAt !== undefined) {
      const klass = await loadTenantClass(tx, {
        tenantId,
        classId: before.classId,
      });
      nextEndAt = computeEndAt(nextStartAt, klass);
    }

    const data: Prisma.ClassInstanceUpdateInput = {};
    if (body.staffId !== undefined) {
      data.staff = { connect: { id: nextStaffId } };
    }
    if (body.locationId !== undefined) {
      data.location = { connect: { id: nextLocationId } };
    }
    if (nextStartAt !== undefined) data.scheduledStartAt = nextStartAt;
    if (nextEndAt !== undefined) data.scheduledEndAt = nextEndAt;
    if (body.capacityOverride !== undefined) {
      data.capacityOverride = body.capacityOverride;
    }
    if (body.waitlistOverride !== undefined) {
      data.waitlistOverride = body.waitlistOverride;
    }

    const after = await tx.classInstance.update({
      where: { id },
      data,
      select: CLASS_INSTANCE_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'class_instance.updated',
      entityId: after.id,
      before: before as ClassInstance,
      after: after as ClassInstance,
    });

    return { instance: after as ClassInstance };
  });
}

export async function cancelClassInstance(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    reason: string | undefined;
  },
): Promise<{ instance: ClassInstance } | null> {
  const { tenantId, actorUserId, id, reason } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.classInstance.findFirst({
      where: { tenantId, id },
      select: CLASS_INSTANCE_SAFE_FIELDS,
    });
    if (!before) return null;

    if (before.state === 'cancelled') {
      throw new ClassInstanceAlreadyCancelledError();
    }

    const after = await tx.classInstance.update({
      where: { id },
      data: {
        state: 'cancelled',
        cancelledReason: reason ?? null,
        cancelledAt: new Date(),
      },
      select: CLASS_INSTANCE_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'class_instance.cancelled',
      entityId: after.id,
      before: before as ClassInstance,
      after: after as ClassInstance,
    });

    // TODO(phase-2b): trigger client notifications (SMS/email) for any
    // bookings on this instance. Phase 2a has no bookings yet so this is
    // a no-op; Phase 2b/notifications epic wires the dispatch via BullMQ.

    return { instance: after as ClassInstance };
  });
}
