import { Prisma } from '@prisma/client';
import type { Service } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  CreateServiceBody,
  ListServicesQuery,
  UpdateServiceBody,
} from '../schemas/service.js';

// Domain layer for Service admin CRUD. Mirrors clientService.ts; per
// docs/09-dev-handoff.md "Epic 2", services do NOT need duplicate detection
// (no email/phone) so the surface is simpler.
//
// Tenant scoping: every query passes tenantId. The soft-delete extension
// (apps/api/src/db/softDelete.ts) auto-filters deletedAt: null on reads;
// callers don't need to pass it. List/get behavior treats soft-deleted
// rows as not-found unless `includeDeleted` is explicitly set.
//
// Audit log: create/update/delete all write an audit_log row inside the
// same transaction as the mutation. Action names: service.created,
// service.updated, service.deleted. Actor is the authenticated user.
//
// StaffService M2M: Service.staffIds on the create/update body is the
// inverse of Staff.serviceIds (managed in staffService.ts). Both write to
// the same staff_services join table. Either side can replace the
// assignment set atomically with the parent write.

const SERVICE_SAFE_FIELDS = {
  id: true,
  tenantId: true,
  categoryId: true,
  name: true,
  description: true,
  descriptionShort: true,
  durationMinutes: true,
  basePriceCents: true,
  priceDisplayMode: true,
  displayOrder: true,
  publicVisible: true,
  bufferBeforeMinutes: true,
  bufferAfterMinutes: true,
  color: true,
  active: true,
  bookingPolicy: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.ServiceSelect;

const CATEGORY_SUMMARY_SELECT = {
  id: true,
  name: true,
} satisfies Prisma.ServiceCategorySelect;

const SERVICE_WITH_CATEGORY_SELECT = {
  ...SERVICE_SAFE_FIELDS,
  category: { select: CATEGORY_SUMMARY_SELECT },
} satisfies Prisma.ServiceSelect;

export type ServiceCategorySummary = {
  id: string;
  name: string;
};

export type ServiceListItem = Prisma.ServiceGetPayload<{
  select: typeof SERVICE_WITH_CATEGORY_SELECT;
}>;

// Detail endpoint augments Service with staffIds (a derived projection of
// staff_services join rows, not a column). List endpoint omits this for
// per-row M2M-lookup cost reasons.
export type ServiceWithStaff = ServiceListItem & { staffIds: string[] };

export type CreateServiceResult = { service: ServiceWithStaff };
export type UpdateServiceResult = { service: ServiceWithStaff };

type AuditPayload = (Service & { staffIds: string[] }) | null;

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action: 'service.created' | 'service.updated' | 'service.deleted';
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
      entityType: 'service',
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
// validated set. Throws if any ID is invalid -- 400 over silent drop.
async function validateStaffIds(
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
    (err as Error & { code?: string }).code = 'INVALID_STAFF_IDS';
    throw err;
  }
  return [...foundIds];
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

// Replace the staff_services rows for a service with exactly the given
// set. Caller is responsible for already having validated the IDs.
async function replaceServiceStaff(
  tx: ExtendedTransactionClient,
  args: { serviceId: string; staffIds: string[] },
): Promise<void> {
  await tx.staffService.deleteMany({ where: { serviceId: args.serviceId } });
  if (args.staffIds.length > 0) {
    await tx.staffService.createMany({
      data: args.staffIds.map((sid) => ({
        staffId: sid,
        serviceId: args.serviceId,
      })),
    });
  }
}

async function loadStaffIds(
  tx: ExtendedTransactionClient,
  serviceId: string,
): Promise<string[]> {
  const rows = await tx.staffService.findMany({
    where: { serviceId },
    select: { staffId: true },
  });
  return rows.map((r) => r.staffId);
}

function buildUpdateData(
  body: UpdateServiceBody,
): Prisma.ServiceUpdateInput | null {
  const data: Prisma.ServiceUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.descriptionShort !== undefined) {
    data.descriptionShort = body.descriptionShort;
  }
  if (body.durationMinutes !== undefined) {
    data.durationMinutes = body.durationMinutes;
  }
  if (body.basePriceCents !== undefined) {
    data.basePriceCents = body.basePriceCents;
  }
  if (body.displayOrder !== undefined) data.displayOrder = body.displayOrder;
  if (body.publicVisible !== undefined) {
    data.publicVisible = body.publicVisible;
  }
  if (body.bufferBeforeMinutes !== undefined) {
    data.bufferBeforeMinutes = body.bufferBeforeMinutes;
  }
  if (body.bufferAfterMinutes !== undefined) {
    data.bufferAfterMinutes = body.bufferAfterMinutes;
  }
  if (body.priceDisplayMode !== undefined) {
    data.priceDisplayMode = body.priceDisplayMode;
  }
  if (body.color !== undefined) data.color = body.color;
  if (body.active !== undefined) data.active = body.active;
  if (body.bookingPolicy !== undefined) {
    data.bookingPolicy = body.bookingPolicy;
  }

  if (body.categoryId !== undefined) {
    if (body.categoryId === null || body.categoryId === '') {
      data.category = { disconnect: true };
    } else {
      data.category = { connect: { id: body.categoryId } };
    }
  }

  return Object.keys(data).length > 0 ? data : null;
}

export async function createService(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    body: CreateServiceBody;
  },
): Promise<CreateServiceResult> {
  const { tenantId, actorUserId, body } = args;

  return prisma.$transaction(async (tx) => {
    const validatedStaffIds = body.staffIds
      ? await validateStaffIds(tx, { tenantId, staffIds: body.staffIds })
      : [];

    if (body.categoryId) {
      await validateCategoryId(tx, { tenantId, categoryId: body.categoryId });
    }

    const service = await tx.service.create({
      data: {
        tenantId,
        name: body.name,
        description: body.description,
        descriptionShort: body.descriptionShort,
        durationMinutes: body.durationMinutes,
        basePriceCents: body.basePriceCents,
        categoryId: body.categoryId ?? undefined,
        displayOrder: body.displayOrder,
        publicVisible: body.publicVisible,
        bufferBeforeMinutes: body.bufferBeforeMinutes,
        bufferAfterMinutes: body.bufferAfterMinutes,
        priceDisplayMode: body.priceDisplayMode,
        color: body.color,
        active: body.active ?? true,
        bookingPolicy: body.bookingPolicy ?? 'instant',
      },
      select: SERVICE_WITH_CATEGORY_SELECT,
    });

    if (body.staffIds) {
      await replaceServiceStaff(tx, {
        serviceId: service.id,
        staffIds: validatedStaffIds,
      });
    }

    const withStaff: ServiceWithStaff = {
      ...service,
      staffIds: validatedStaffIds,
    };

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'service.created',
      entityId: service.id,
      before: null,
      after: stripCategoryForAudit(withStaff),
    });

    return { service: withStaff };
  });
}

/** Audit payloads mirror historical Service JSON shape (no nested category). */
function stripCategoryForAudit(s: ServiceWithStaff): AuditPayload {
  const { staffIds, category: _c, ...rest } = s;
  void _c;
  return { ...(rest as Service), staffIds };
}

export async function listServices(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    query: ListServicesQuery;
  },
): Promise<{ services: ServiceListItem[]; total: number }> {
  const { tenantId, query } = args;

  const where: Prisma.ServiceWhereInput = { tenantId };
  if (query.active !== undefined) where.active = query.active;
  if (query.publicVisible !== undefined) {
    where.publicVisible = query.publicVisible;
  }
  if (query.categoryId !== undefined) {
    where.categoryId = query.categoryId;
  }
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
      {
        descriptionShort: { contains: query.q, mode: 'insensitive' },
      },
    ];
  }
  if (query.includeDeleted) {
    where.deletedAt = undefined;
  }
  if (query.staffId) {
    where.AND = [
      ...(where.AND
        ? Array.isArray(where.AND)
          ? where.AND
          : [where.AND]
        : []),
      {
        OR: [
          { staff: { none: {} } },
          { staff: { some: { staffId: query.staffId } } },
        ],
      },
    ];
  }

  const [services, total] = await Promise.all([
    prisma.service.findMany({
      where,
      select: SERVICE_WITH_CATEGORY_SELECT,
      orderBy: [
        { displayOrder: 'asc' },
        { name: 'asc' },
        { id: 'asc' },
      ],
      take: query.take,
      skip: query.skip,
    }),
    prisma.service.count({ where }),
  ]);

  return { services, total };
}

export async function getServiceById(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    id: string;
  },
): Promise<ServiceWithStaff | null> {
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.findFirst({
      where: { tenantId: args.tenantId, id: args.id },
      select: SERVICE_WITH_CATEGORY_SELECT,
    });
    if (!service) return null;
    const staffIds = await loadStaffIds(tx, service.id);
    return { ...service, staffIds };
  });
}

export async function updateService(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    body: UpdateServiceBody;
  },
): Promise<UpdateServiceResult | null> {
  const { tenantId, actorUserId, id, body } = args;

  return prisma.$transaction(async (tx) => {
    const beforeService = await tx.service.findFirst({
      where: { tenantId, id },
      select: SERVICE_WITH_CATEGORY_SELECT,
    });
    if (!beforeService) return null;
    const beforeStaffIds = await loadStaffIds(tx, id);
    const before: ServiceWithStaff = {
      ...beforeService,
      staffIds: beforeStaffIds,
    };

    const hasServiceChanges =
      Object.keys(body).filter((k) => k !== 'staffIds').length > 0;
    const hasStaffIdsChange = 'staffIds' in body && body.staffIds !== undefined;
    if (!hasServiceChanges && !hasStaffIdsChange) {
      return { service: before };
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

    let afterService = beforeService;
    if (hasServiceChanges) {
      const { staffIds: _omit, ...rest } = body;
      void _omit;
      const updateData = buildUpdateData(rest);
      if (updateData) {
        afterService = await tx.service.update({
          where: { id },
          data: updateData,
          select: SERVICE_WITH_CATEGORY_SELECT,
        });
      }
    }

    let afterStaffIds = beforeStaffIds;
    if (hasStaffIdsChange) {
      const validated = await validateStaffIds(tx, {
        tenantId,
        staffIds: body.staffIds!,
      });
      await replaceServiceStaff(tx, { serviceId: id, staffIds: validated });
      afterStaffIds = validated;
    }

    const after: ServiceWithStaff = { ...afterService, staffIds: afterStaffIds };

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'service.updated',
      entityId: after.id,
      before: stripCategoryForAudit(before),
      after: stripCategoryForAudit(after),
    });

    return { service: after };
  });
}

export async function softDeleteService(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
  },
): Promise<{ deleted: boolean }> {
  const { tenantId, actorUserId, id } = args;

  return prisma.$transaction(async (tx) => {
    const beforeService = await tx.service.findFirst({
      where: { tenantId, id },
      select: SERVICE_WITH_CATEGORY_SELECT,
    });
    if (!beforeService) return { deleted: false };
    const beforeStaffIds = await loadStaffIds(tx, id);

    const afterService = await tx.service.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: SERVICE_WITH_CATEGORY_SELECT,
    });

    const before: ServiceWithStaff = {
      ...beforeService,
      staffIds: beforeStaffIds,
    };
    const after: ServiceWithStaff = {
      ...afterService,
      staffIds: beforeStaffIds,
    };

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'service.deleted',
      entityId: id,
      before: stripCategoryForAudit(before),
      after: stripCategoryForAudit(after),
    });

    return { deleted: true };
  });
}
