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

const SERVICE_SAFE_FIELDS = {
  id: true,
  tenantId: true,
  name: true,
  description: true,
  durationMinutes: true,
  basePriceCents: true,
  color: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.ServiceSelect;

export type CreateServiceResult = { service: Service };
export type UpdateServiceResult = { service: Service };

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action: 'service.created' | 'service.updated' | 'service.deleted';
    entityId: string;
    before: Service | null;
    after: Service | null;
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
    const service = await tx.service.create({
      data: {
        tenantId,
        name: body.name,
        description: body.description,
        durationMinutes: body.durationMinutes,
        basePriceCents: body.basePriceCents,
        color: body.color,
        // Default to active=true on create unless explicitly false. Same
        // default the DB column has, but stating it here avoids surprise
        // if the schema default ever changes.
        active: body.active ?? true,
      },
      select: SERVICE_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'service.created',
      entityId: service.id,
      before: null,
      after: service,
    });

    return { service };
  });
}

export async function listServices(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    query: ListServicesQuery;
  },
): Promise<{ services: Service[]; total: number }> {
  const { tenantId, query } = args;

  // Build a Prisma where that the soft-delete extension can still inject
  // deletedAt: null into. Setting deletedAt explicitly in the where (when
  // includeDeleted is true) opts out.
  const where: Prisma.ServiceWhereInput = { tenantId };
  if (query.active !== undefined) where.active = query.active;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  if (query.includeDeleted) {
    where.deletedAt = undefined;
  }

  const [services, total] = await Promise.all([
    prisma.service.findMany({
      where,
      select: SERVICE_SAFE_FIELDS,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
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
): Promise<Service | null> {
  return prisma.service.findFirst({
    where: { tenantId: args.tenantId, id: args.id },
    select: SERVICE_SAFE_FIELDS,
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
    const before = await tx.service.findFirst({
      where: { tenantId, id },
      select: SERVICE_SAFE_FIELDS,
    });
    if (!before) return null;

    // Empty PATCH → no-op. Don't write an audit row for a non-change.
    const hasChanges = Object.keys(body).length > 0;
    if (!hasChanges) {
      return { service: before };
    }

    const after = await tx.service.update({
      where: { id },
      data: body,
      select: SERVICE_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'service.updated',
      entityId: after.id,
      before,
      after,
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
    const before = await tx.service.findFirst({
      where: { tenantId, id },
      select: SERVICE_SAFE_FIELDS,
    });
    if (!before) return { deleted: false };

    const after = await tx.service.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: SERVICE_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'service.deleted',
      entityId: after.id,
      before,
      after,
    });

    return { deleted: true };
  });
}
