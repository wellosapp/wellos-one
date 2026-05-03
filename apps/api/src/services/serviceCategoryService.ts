import { Prisma } from '@prisma/client';
import type { ServiceCategory } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  CreateServiceCategoryBody,
  ListServiceCategoriesQuery,
  UpdateServiceCategoryBody,
} from '../schemas/serviceCategory.js';

const SERVICE_CATEGORY_SAFE_FIELDS = {
  id: true,
  tenantId: true,
  name: true,
  displayOrder: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.ServiceCategorySelect;

export type CreateServiceCategoryResult = { category: ServiceCategory };
export type UpdateServiceCategoryResult = { category: ServiceCategory };

export class DuplicateServiceCategoryNameError extends Error {
  code = 'DUPLICATE_SERVICE_CATEGORY_NAME' as const;
  constructor(message = 'A category with this name already exists.') {
    super(message);
    this.name = 'DuplicateServiceCategoryNameError';
  }
}

function isPrismaUniqueViolation(
  err: unknown,
): err is Prisma.PrismaClientKnownRequestError {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action:
      | 'service_category.created'
      | 'service_category.updated'
      | 'service_category.deleted';
    entityId: string;
    before: ServiceCategory | null;
    after: ServiceCategory | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: 'service_category',
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

export async function createServiceCategory(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    body: CreateServiceCategoryBody;
  },
): Promise<CreateServiceCategoryResult> {
  const { tenantId, actorUserId, body } = args;

  return prisma.$transaction(async (tx) => {
    let category: ServiceCategory;
    try {
      category = await tx.serviceCategory.create({
        data: {
          tenantId,
          name: body.name,
          displayOrder: body.displayOrder ?? 0,
        },
        select: SERVICE_CATEGORY_SAFE_FIELDS,
      });
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw new DuplicateServiceCategoryNameError();
      }
      throw err;
    }

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'service_category.created',
      entityId: category.id,
      before: null,
      after: category,
    });

    return { category };
  });
}

export async function listServiceCategories(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    query: ListServiceCategoriesQuery;
  },
): Promise<{ categories: ServiceCategory[]; total: number }> {
  const { tenantId, query } = args;

  const where: Prisma.ServiceCategoryWhereInput = { tenantId };
  if (query.q) {
    where.name = { contains: query.q, mode: 'insensitive' };
  }
  if (query.includeDeleted) {
    where.deletedAt = undefined;
  }

  const [categories, total] = await Promise.all([
    prisma.serviceCategory.findMany({
      where,
      select: SERVICE_CATEGORY_SAFE_FIELDS,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      take: query.take,
      skip: query.skip,
    }),
    prisma.serviceCategory.count({ where }),
  ]);

  return { categories, total };
}

export async function getServiceCategoryById(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    id: string;
  },
): Promise<ServiceCategory | null> {
  return prisma.serviceCategory.findFirst({
    where: { tenantId: args.tenantId, id: args.id },
    select: SERVICE_CATEGORY_SAFE_FIELDS,
  });
}

export async function updateServiceCategory(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    body: UpdateServiceCategoryBody;
  },
): Promise<UpdateServiceCategoryResult | null> {
  const { tenantId, actorUserId, id, body } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.serviceCategory.findFirst({
      where: { tenantId, id },
      select: SERVICE_CATEGORY_SAFE_FIELDS,
    });
    if (!before) return null;

    const hasChanges = Object.keys(body).length > 0;
    if (!hasChanges) {
      return { category: before };
    }

    let after: ServiceCategory;
    try {
      after = await tx.serviceCategory.update({
        where: { id },
        data: body,
        select: SERVICE_CATEGORY_SAFE_FIELDS,
      });
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw new DuplicateServiceCategoryNameError();
      }
      throw err;
    }

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'service_category.updated',
      entityId: after.id,
      before,
      after,
    });

    return { category: after };
  });
}

export async function softDeleteServiceCategory(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
  },
): Promise<{ deleted: boolean }> {
  const { tenantId, actorUserId, id } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.serviceCategory.findFirst({
      where: { tenantId, id, deletedAt: null },
      select: SERVICE_CATEGORY_SAFE_FIELDS,
    });
    if (!before) return { deleted: false };

    await tx.service.updateMany({
      where: { tenantId, categoryId: id },
      data: { categoryId: null },
    });

    const after = await tx.serviceCategory.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: SERVICE_CATEGORY_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'service_category.deleted',
      entityId: id,
      before,
      after,
    });

    return { deleted: true };
  });
}
