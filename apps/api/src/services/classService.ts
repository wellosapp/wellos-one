import { Prisma } from '@prisma/client';
import type { Class } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  CreateClassBody,
  ListClassesQuery,
  UpdateClassBody,
} from '../schemas/class.js';

// Domain layer for Class admin CRUD (Phase 1 of the Classes epic).
// Mirrors serviceService.ts. Phase 1 ships the TEMPLATE only; per-occurrence
// (ClassInstance), bookings, and check-in land in Phase 2-4.
//
// Tenant scoping: every query passes tenantId. The soft-delete extension
// (apps/api/src/db/softDelete.ts) auto-filters deletedAt: null on reads;
// callers don't need to pass it. List/get behavior treats soft-deleted
// rows as not-found unless `includeDeleted` is explicitly set.
//
// Audit log: create/update/delete all write an audit_log row inside the
// same transaction as the mutation. Action names: class.created,
// class.updated, class.deleted. Actor is the authenticated user.
//
// ClassInstructor M2M: instructorIds on the create/update body manages the
// staff_id assignment set. First ID in the array gets is_primary=true on
// insert; the rest get false. On update with instructorIds set, the
// assignment set is replaced (delete + insert) inside the same transaction.

const CLASS_SAFE_FIELDS = {
  id: true,
  tenantId: true,
  name: true,
  shortDescription: true,
  longDescription: true,
  durationMinutes: true,
  basePriceCents: true,
  maxCapacity: true,
  minToRun: true,
  allowWaitlist: true,
  waitlistLimit: true,
  color: true,
  bufferBeforeMinutes: true,
  bufferAfterMinutes: true,
  active: true,
  categoryId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.ClassSelect;

const CATEGORY_SUMMARY_SELECT = {
  id: true,
  name: true,
} satisfies Prisma.ServiceCategorySelect;

const CLASS_WITH_CATEGORY_SELECT = {
  ...CLASS_SAFE_FIELDS,
  category: { select: CATEGORY_SUMMARY_SELECT },
} satisfies Prisma.ClassSelect;

export type ClassCategorySummary = {
  id: string;
  name: string;
};

export type ClassListItemRow = Prisma.ClassGetPayload<{
  select: typeof CLASS_WITH_CATEGORY_SELECT;
}>;

export type ClassInstructorSummary = {
  staffId: string;
  isPrimary: boolean;
};

export type ClassListItem = ClassListItemRow & {
  instructorCount: number;
};

export type ClassWithInstructors = ClassListItemRow & {
  instructors: ClassInstructorSummary[];
};

export type CreateClassResult = { class: ClassWithInstructors };
export type UpdateClassResult = { class: ClassWithInstructors };

type AuditPayload =
  | (Class & { instructors: ClassInstructorSummary[] })
  | null;

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action: 'class.created' | 'class.updated' | 'class.deleted';
    entityId: string;
    before: AuditPayload;
    after: AuditPayload;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: 'class',
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

// Verify every requested staffId belongs to this tenant. Returns the
// validated set preserving caller-supplied order. Throws if any ID is
// invalid — 400 over silent drop.
async function validateInstructorIds(
  tx: ExtendedTransactionClient,
  args: { tenantId: string; staffIds: string[] },
): Promise<string[]> {
  if (args.staffIds.length === 0) return [];
  const found = await tx.staff.findMany({
    where: { tenantId: args.tenantId, id: { in: args.staffIds } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((s) => s.id));
  const missing = args.staffIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    const err = new Error(
      `Unknown staff IDs for this tenant: ${missing.join(', ')}`,
    );
    (err as Error & { code?: string }).code = 'INVALID_INSTRUCTOR_IDS';
    throw err;
  }
  // Preserve order from the input — first ID becomes the primary.
  return args.staffIds.filter((id) => foundIds.has(id));
}

async function validateCategoryId(
  tx: ExtendedTransactionClient,
  args: { tenantId: string; categoryId: string },
): Promise<void> {
  const row = await tx.serviceCategory.findFirst({
    where: { tenantId: args.tenantId, id: args.categoryId },
    select: { id: true },
  });
  if (!row) {
    const err = new Error(
      `Unknown service category for this tenant: ${args.categoryId}`,
    );
    (err as Error & { code?: string }).code = 'INVALID_CATEGORY_ID';
    throw err;
  }
}

// Replace the class_instructors rows for a class with exactly the given set.
// First ID in the array is marked is_primary=true (Phase 1 convention).
// Caller is responsible for already having validated the IDs.
async function replaceClassInstructors(
  tx: ExtendedTransactionClient,
  args: { classId: string; staffIds: string[] },
): Promise<void> {
  await tx.classInstructor.deleteMany({ where: { classId: args.classId } });
  if (args.staffIds.length > 0) {
    // createMany doesn't return created rows; insert sequentially so the
    // primary marker is deterministic and matches the input order.
    await Promise.all(
      args.staffIds.map((sid, idx) =>
        tx.classInstructor.create({
          data: {
            classId: args.classId,
            staffId: sid,
            isPrimary: idx === 0,
          },
        }),
      ),
    );
  }
}

async function loadInstructors(
  tx: ExtendedTransactionClient,
  classId: string,
): Promise<ClassInstructorSummary[]> {
  const rows = await tx.classInstructor.findMany({
    where: { classId },
    select: { staffId: true, isPrimary: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map((r) => ({ staffId: r.staffId, isPrimary: r.isPrimary }));
}

function buildUpdateData(
  body: UpdateClassBody,
): Prisma.ClassUpdateInput | null {
  const data: Prisma.ClassUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.shortDescription !== undefined) {
    data.shortDescription = body.shortDescription;
  }
  if (body.longDescription !== undefined) {
    data.longDescription = body.longDescription;
  }
  if (body.durationMinutes !== undefined) {
    data.durationMinutes = body.durationMinutes;
  }
  if (body.basePriceCents !== undefined) {
    data.basePriceCents = body.basePriceCents;
  }
  if (body.maxCapacity !== undefined) data.maxCapacity = body.maxCapacity;
  if (body.minToRun !== undefined) data.minToRun = body.minToRun;
  if (body.allowWaitlist !== undefined) {
    data.allowWaitlist = body.allowWaitlist;
  }
  if (body.waitlistLimit !== undefined) {
    data.waitlistLimit = body.waitlistLimit;
  }
  if (body.color !== undefined) data.color = body.color;
  if (body.bufferBeforeMinutes !== undefined) {
    data.bufferBeforeMinutes = body.bufferBeforeMinutes;
  }
  if (body.bufferAfterMinutes !== undefined) {
    data.bufferAfterMinutes = body.bufferAfterMinutes;
  }
  if (body.active !== undefined) data.active = body.active;

  if (body.categoryId !== undefined) {
    if (body.categoryId === null || body.categoryId === '') {
      data.category = { disconnect: true };
    } else {
      data.category = { connect: { id: body.categoryId } };
    }
  }

  return Object.keys(data).length > 0 ? data : null;
}

function stripCategoryForAudit(c: ClassWithInstructors): AuditPayload {
  const { instructors, category: _c, ...rest } = c;
  void _c;
  return { ...(rest as Class), instructors };
}

export async function createClass(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    body: CreateClassBody;
  },
): Promise<CreateClassResult> {
  const { tenantId, actorUserId, body } = args;

  return prisma.$transaction(async (tx) => {
    const validatedInstructorIds = body.instructorIds
      ? await validateInstructorIds(tx, {
          tenantId,
          staffIds: body.instructorIds,
        })
      : [];

    if (body.categoryId) {
      await validateCategoryId(tx, { tenantId, categoryId: body.categoryId });
    }

    const created = await tx.class.create({
      data: {
        tenantId,
        name: body.name,
        shortDescription: body.shortDescription ?? null,
        longDescription: body.longDescription ?? null,
        durationMinutes: body.durationMinutes,
        basePriceCents: body.basePriceCents ?? 0,
        maxCapacity: body.maxCapacity,
        minToRun: body.minToRun ?? 1,
        allowWaitlist: body.allowWaitlist ?? false,
        waitlistLimit: body.waitlistLimit ?? 0,
        color: body.color,
        bufferBeforeMinutes: body.bufferBeforeMinutes ?? 0,
        bufferAfterMinutes: body.bufferAfterMinutes ?? 0,
        active: body.active ?? true,
        categoryId: body.categoryId ?? undefined,
      },
      select: CLASS_WITH_CATEGORY_SELECT,
    });

    if (body.instructorIds) {
      await replaceClassInstructors(tx, {
        classId: created.id,
        staffIds: validatedInstructorIds,
      });
    }

    const instructors = body.instructorIds
      ? validatedInstructorIds.map((sid, idx) => ({
          staffId: sid,
          isPrimary: idx === 0,
        }))
      : [];

    const withInstructors: ClassWithInstructors = {
      ...created,
      instructors,
    };

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'class.created',
      entityId: created.id,
      before: null,
      after: stripCategoryForAudit(withInstructors),
    });

    return { class: withInstructors };
  });
}

export async function listClasses(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    query: ListClassesQuery;
  },
): Promise<{ classes: ClassListItem[]; total: number }> {
  const { tenantId, query } = args;

  const where: Prisma.ClassWhereInput = { tenantId };
  if (query.active !== undefined) where.active = query.active;
  if (query.categoryId !== undefined) where.categoryId = query.categoryId;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { shortDescription: { contains: query.q, mode: 'insensitive' } },
      { longDescription: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  if (query.includeDeleted) {
    where.deletedAt = undefined;
  }

  const [rows, total] = await Promise.all([
    prisma.class.findMany({
      where,
      select: {
        ...CLASS_WITH_CATEGORY_SELECT,
        _count: { select: { instructors: true } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: query.take,
      skip: query.skip,
    }),
    prisma.class.count({ where }),
  ]);

  const classes: ClassListItem[] = rows.map((r) => {
    const { _count, ...rest } = r;
    return { ...rest, instructorCount: _count.instructors };
  });

  return { classes, total };
}

export async function getClassById(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    id: string;
  },
): Promise<ClassWithInstructors | null> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.class.findFirst({
      where: { tenantId: args.tenantId, id: args.id },
      select: CLASS_WITH_CATEGORY_SELECT,
    });
    if (!row) return null;
    const instructors = await loadInstructors(tx, row.id);
    return { ...row, instructors };
  });
}

export async function updateClass(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    body: UpdateClassBody;
  },
): Promise<UpdateClassResult | null> {
  const { tenantId, actorUserId, id, body } = args;

  return prisma.$transaction(async (tx) => {
    const beforeRow = await tx.class.findFirst({
      where: { tenantId, id },
      select: CLASS_WITH_CATEGORY_SELECT,
    });
    if (!beforeRow) return null;
    const beforeInstructors = await loadInstructors(tx, id);
    const before: ClassWithInstructors = {
      ...beforeRow,
      instructors: beforeInstructors,
    };

    const hasClassChanges =
      Object.keys(body).filter((k) => k !== 'instructorIds').length > 0;
    const hasInstructorChange =
      'instructorIds' in body && body.instructorIds !== undefined;
    if (!hasClassChanges && !hasInstructorChange) {
      return { class: before };
    }

    // Cross-tier capacity sanity: when only one of min/max moves, enforce
    // against the existing value too. (Zod handles the both-supplied case.)
    const nextMaxCapacity =
      body.maxCapacity !== undefined ? body.maxCapacity : beforeRow.maxCapacity;
    const nextMinToRun =
      body.minToRun !== undefined ? body.minToRun : beforeRow.minToRun;
    if (nextMinToRun > nextMaxCapacity) {
      const err = new Error('minToRun cannot exceed maxCapacity');
      (err as Error & { code?: string }).code = 'INVALID_CAPACITY';
      throw err;
    }

    if (body.categoryId !== undefined && body.categoryId !== null) {
      const cid =
        typeof body.categoryId === 'string' && body.categoryId.length > 0
          ? body.categoryId
          : null;
      if (cid) {
        await validateCategoryId(tx, { tenantId, categoryId: cid });
      }
    }

    let afterRow = beforeRow;
    if (hasClassChanges) {
      const { instructorIds: _omit, ...rest } = body;
      void _omit;
      const updateData = buildUpdateData(rest);
      if (updateData) {
        afterRow = await tx.class.update({
          where: { id },
          data: updateData,
          select: CLASS_WITH_CATEGORY_SELECT,
        });
      }
    }

    let afterInstructors = beforeInstructors;
    if (hasInstructorChange) {
      const validated = await validateInstructorIds(tx, {
        tenantId,
        staffIds: body.instructorIds!,
      });
      await replaceClassInstructors(tx, { classId: id, staffIds: validated });
      afterInstructors = validated.map((sid, idx) => ({
        staffId: sid,
        isPrimary: idx === 0,
      }));
    }

    const after: ClassWithInstructors = {
      ...afterRow,
      instructors: afterInstructors,
    };

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'class.updated',
      entityId: after.id,
      before: stripCategoryForAudit(before),
      after: stripCategoryForAudit(after),
    });

    return { class: after };
  });
}

export async function softDeleteClass(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
  },
): Promise<{ deleted: boolean }> {
  const { tenantId, actorUserId, id } = args;

  return prisma.$transaction(async (tx) => {
    const beforeRow = await tx.class.findFirst({
      where: { tenantId, id },
      select: CLASS_WITH_CATEGORY_SELECT,
    });
    if (!beforeRow) return { deleted: false };
    const beforeInstructors = await loadInstructors(tx, id);

    const afterRow = await tx.class.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: CLASS_WITH_CATEGORY_SELECT,
    });

    const before: ClassWithInstructors = {
      ...beforeRow,
      instructors: beforeInstructors,
    };
    const after: ClassWithInstructors = {
      ...afterRow,
      instructors: beforeInstructors,
    };

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'class.deleted',
      entityId: id,
      before: stripCategoryForAudit(before),
      after: stripCategoryForAudit(after),
    });

    return { deleted: true };
  });
}
