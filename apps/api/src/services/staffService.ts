import { Prisma } from '@prisma/client';
import type { Staff } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  CreateStaffBody,
  ListStaffQuery,
  UpdateStaffBody,
} from '../schemas/staff.js';

// Domain layer for Staff admin CRUD with inline StaffService M2M
// management. Mirrors clientService/serviceService.
//
// Tenant scoping at every query. Soft-delete extension auto-filters
// deletedAt: null on reads. Audit log writes inside the same transaction.
//
// Service assignment semantics:
//   - serviceIds undefined  → leave existing assignments untouched (PATCH)
//   - serviceIds present    → replace assignments to exactly that set
//   - serviceIds []         → clear all assignments
//
// Cross-tenant safety: when accepting serviceIds, we verify each one
// belongs to the same tenant before linking. A malicious caller can't
// assign their staff to services from another tenant.

const STAFF_SAFE_FIELDS = {
  id: true,
  tenantId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  jobTitle: true,
  workingHours: true,
  hourlyRateCents: true,
  commissionRatePct: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.StaffSelect;

// Outward-facing shape: Staff fields plus the assigned service IDs flat
// array (a derived projection of staff_services join rows). Not a column.
export type StaffWithServices = Staff & { serviceIds: string[] };

export type CreateStaffResult = { staff: StaffWithServices };
export type UpdateStaffResult = { staff: StaffWithServices };

// Audit log payload includes serviceIds so the trail captures M2M changes.
type AuditPayload = (Staff & { serviceIds: string[] }) | null;

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action: 'staff.created' | 'staff.updated' | 'staff.deleted';
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
      entityType: 'staff',
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

// Verify every requested serviceId belongs to this tenant and isn't
// soft-deleted. Returns the validated set of IDs. Throws if any ID is
// invalid — we'd rather 400 than silently drop assignments.
async function validateServiceIds(
  tx: ExtendedTransactionClient,
  args: { tenantId: string; serviceIds: string[] },
): Promise<string[]> {
  if (args.serviceIds.length === 0) return [];
  const found = await tx.service.findMany({
    where: { tenantId: args.tenantId, id: { in: args.serviceIds } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((s) => s.id));
  const missing = args.serviceIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    const err = new Error(
      `Unknown service IDs for this tenant: ${missing.join(', ')}`,
    );
    (err as Error & { code?: string }).code = 'INVALID_SERVICE_IDS';
    throw err;
  }
  return [...foundIds];
}

// Replace the staff_services rows for a staff member with exactly the
// given set. Caller is responsible for already having validated the IDs.
async function replaceStaffServices(
  tx: ExtendedTransactionClient,
  args: { staffId: string; serviceIds: string[] },
): Promise<void> {
  await tx.staffService.deleteMany({ where: { staffId: args.staffId } });
  if (args.serviceIds.length > 0) {
    await tx.staffService.createMany({
      data: args.serviceIds.map((sid) => ({
        staffId: args.staffId,
        serviceId: sid,
      })),
    });
  }
}

async function loadServiceIds(
  tx: ExtendedTransactionClient,
  staffId: string,
): Promise<string[]> {
  const rows = await tx.staffService.findMany({
    where: { staffId },
    select: { serviceId: true },
  });
  return rows.map((r) => r.serviceId);
}

// Convert the validated body into a Prisma `data` shape. Numeric/json
// fields need narrow conversion; everything else passes through.
function staffWriteData(body: CreateStaffBody | UpdateStaffBody): Prisma.StaffUpdateInput {
  const data: Prisma.StaffUpdateInput = {};
  if ('firstName' in body && body.firstName !== undefined) data.firstName = body.firstName;
  if ('lastName' in body) data.lastName = body.lastName;
  if ('email' in body) data.email = body.email;
  if ('phone' in body) data.phone = body.phone;
  if ('jobTitle' in body) data.jobTitle = body.jobTitle;
  if ('workingHours' in body) {
    data.workingHours =
      body.workingHours === undefined
        ? Prisma.JsonNull
        : (body.workingHours as Prisma.InputJsonValue);
  }
  if ('hourlyRateCents' in body) data.hourlyRateCents = body.hourlyRateCents;
  if ('commissionRatePct' in body) data.commissionRatePct = body.commissionRatePct;
  if ('active' in body && body.active !== undefined) data.active = body.active;
  return data;
}

export async function createStaff(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    body: CreateStaffBody;
  },
): Promise<CreateStaffResult> {
  const { tenantId, actorUserId, body } = args;

  return prisma.$transaction(async (tx) => {
    const validatedServiceIds = body.serviceIds
      ? await validateServiceIds(tx, { tenantId, serviceIds: body.serviceIds })
      : [];

    const staff = await tx.staff.create({
      data: {
        tenantId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        jobTitle: body.jobTitle,
        workingHours: (body.workingHours as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        hourlyRateCents: body.hourlyRateCents,
        commissionRatePct: body.commissionRatePct,
        active: body.active ?? true,
      },
      select: STAFF_SAFE_FIELDS,
    });

    if (body.serviceIds) {
      await replaceStaffServices(tx, {
        staffId: staff.id,
        serviceIds: validatedServiceIds,
      });
    }

    const withServices: StaffWithServices = {
      ...staff,
      serviceIds: validatedServiceIds,
    };

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'staff.created',
      entityId: staff.id,
      before: null,
      after: withServices,
    });

    return { staff: withServices };
  });
}

export async function listStaff(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    query: ListStaffQuery;
  },
): Promise<{ staff: Staff[]; total: number }> {
  const { tenantId, query } = args;

  const where: Prisma.StaffWhereInput = { tenantId };
  if (query.active !== undefined) where.active = query.active;
  if (query.q) {
    where.OR = [
      { firstName: { contains: query.q, mode: 'insensitive' } },
      { lastName: { contains: query.q, mode: 'insensitive' } },
      { email: { contains: query.q, mode: 'insensitive' } },
      { phone: { contains: query.q } },
      { jobTitle: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  if (query.includeDeleted) {
    where.deletedAt = undefined;
  }

  const [staff, total] = await Promise.all([
    prisma.staff.findMany({
      where,
      select: STAFF_SAFE_FIELDS,
      orderBy: [{ firstName: 'asc' }, { id: 'asc' }],
      take: query.take,
      skip: query.skip,
    }),
    prisma.staff.count({ where }),
  ]);

  // List view doesn't include serviceIds — per-row M2M lookup is wasteful
  // when the table doesn't render them. Detail page fetches them on demand.
  return { staff, total };
}

export async function getStaffById(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    id: string;
  },
): Promise<StaffWithServices | null> {
  return prisma.$transaction(async (tx) => {
    const staff = await tx.staff.findFirst({
      where: { tenantId: args.tenantId, id: args.id },
      select: STAFF_SAFE_FIELDS,
    });
    if (!staff) return null;
    const serviceIds = await loadServiceIds(tx, staff.id);
    return { ...staff, serviceIds };
  });
}

export async function updateStaff(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    body: UpdateStaffBody;
  },
): Promise<UpdateStaffResult | null> {
  const { tenantId, actorUserId, id, body } = args;

  return prisma.$transaction(async (tx) => {
    const beforeStaff = await tx.staff.findFirst({
      where: { tenantId, id },
      select: STAFF_SAFE_FIELDS,
    });
    if (!beforeStaff) return null;
    const beforeServiceIds = await loadServiceIds(tx, id);
    const before: StaffWithServices = { ...beforeStaff, serviceIds: beforeServiceIds };

    // Empty PATCH (no staff fields, no serviceIds) → no-op.
    const hasStaffChanges =
      Object.keys(body).filter((k) => k !== 'serviceIds').length > 0;
    const hasServiceIdsChange = 'serviceIds' in body && body.serviceIds !== undefined;
    if (!hasStaffChanges && !hasServiceIdsChange) {
      return { staff: before };
    }

    let afterStaff = beforeStaff;
    if (hasStaffChanges) {
      afterStaff = await tx.staff.update({
        where: { id },
        data: staffWriteData(body),
        select: STAFF_SAFE_FIELDS,
      });
    }

    let afterServiceIds = beforeServiceIds;
    if (hasServiceIdsChange) {
      const validated = await validateServiceIds(tx, {
        tenantId,
        serviceIds: body.serviceIds!,
      });
      await replaceStaffServices(tx, { staffId: id, serviceIds: validated });
      afterServiceIds = validated;
    }

    const after: StaffWithServices = { ...afterStaff, serviceIds: afterServiceIds };

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'staff.updated',
      entityId: id,
      before,
      after,
    });

    return { staff: after };
  });
}

export async function softDeleteStaff(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
  },
): Promise<{ deleted: boolean }> {
  const { tenantId, actorUserId, id } = args;

  return prisma.$transaction(async (tx) => {
    const beforeStaff = await tx.staff.findFirst({
      where: { tenantId, id },
      select: STAFF_SAFE_FIELDS,
    });
    if (!beforeStaff) return { deleted: false };
    const beforeServiceIds = await loadServiceIds(tx, id);

    const afterStaff = await tx.staff.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: STAFF_SAFE_FIELDS,
    });

    // Don't tear down staff_services rows on soft-delete: the assignment
    // history is part of the audit/reporting trail. The booking engine
    // will filter on staff.deletedAt at query time.
    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'staff.deleted',
      entityId: id,
      before: { ...beforeStaff, serviceIds: beforeServiceIds },
      after: { ...afterStaff, serviceIds: beforeServiceIds },
    });

    return { deleted: true };
  });
}
