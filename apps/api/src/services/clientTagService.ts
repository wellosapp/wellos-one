import { Prisma } from '@prisma/client';
import type { ClientTag } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  CreateClientTagBody,
  ListClientTagsQuery,
  UpdateClientTagBody,
} from '../schemas/clientTag.js';

// Domain layer for ClientTag admin CRUD. Mirrors serviceService.ts but
// simpler — there's no M2M to manage from this side. The client_tag_assignments
// rows are managed inline on Client create/update via clientService.ts.
//
// Tenant scoping: every query passes tenantId. The soft-delete extension
// auto-filters deletedAt: null on reads.
//
// Audit log: create/update/delete all write an audit_log row inside the
// same transaction. Action names: client_tag.created/updated/deleted.
//
// Unique-name handling: schema enforces @@unique([tenantId, name]). We map
// Prisma's P2002 violation to a typed error so the route layer can surface
// a 400 with a field-error on `name` instead of a generic 500.

const CLIENT_TAG_SAFE_FIELDS = {
  id: true,
  tenantId: true,
  name: true,
  color: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.ClientTagSelect;

export type CreateClientTagResult = { tag: ClientTag };
export type UpdateClientTagResult = { tag: ClientTag };

// Thrown when a create/update violates the (tenantId, name) unique index.
// Route layer maps to a 400 with field error on `name`.
export class DuplicateClientTagNameError extends Error {
  code = 'DUPLICATE_CLIENT_TAG_NAME' as const;
  constructor(message = 'A tag with this name already exists.') {
    super(message);
    this.name = 'DuplicateClientTagNameError';
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
      | 'client_tag.created'
      | 'client_tag.updated'
      | 'client_tag.deleted';
    entityId: string;
    before: ClientTag | null;
    after: ClientTag | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: 'client_tag',
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

export async function createClientTag(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    body: CreateClientTagBody;
  },
): Promise<CreateClientTagResult> {
  const { tenantId, actorUserId, body } = args;

  return prisma.$transaction(async (tx) => {
    let tag: ClientTag;
    try {
      tag = await tx.clientTag.create({
        data: {
          tenantId,
          name: body.name,
          color: body.color,
        },
        select: CLIENT_TAG_SAFE_FIELDS,
      });
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw new DuplicateClientTagNameError();
      }
      throw err;
    }

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'client_tag.created',
      entityId: tag.id,
      before: null,
      after: tag,
    });

    return { tag };
  });
}

export async function listClientTags(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    query: ListClientTagsQuery;
  },
): Promise<{ tags: ClientTag[]; total: number }> {
  const { tenantId, query } = args;

  const where: Prisma.ClientTagWhereInput = { tenantId };
  if (query.q) {
    where.name = { contains: query.q, mode: 'insensitive' };
  }
  if (query.includeDeleted) {
    // Opt-out: extension only injects when the field is absent.
    where.deletedAt = undefined;
  }

  const [tags, total] = await Promise.all([
    prisma.clientTag.findMany({
      where,
      select: CLIENT_TAG_SAFE_FIELDS,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: query.take,
      skip: query.skip,
    }),
    prisma.clientTag.count({ where }),
  ]);

  return { tags, total };
}

export async function getClientTagById(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    id: string;
  },
): Promise<ClientTag | null> {
  return prisma.clientTag.findFirst({
    where: { tenantId: args.tenantId, id: args.id },
    select: CLIENT_TAG_SAFE_FIELDS,
  });
}

export async function updateClientTag(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    body: UpdateClientTagBody;
  },
): Promise<UpdateClientTagResult | null> {
  const { tenantId, actorUserId, id, body } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.clientTag.findFirst({
      where: { tenantId, id },
      select: CLIENT_TAG_SAFE_FIELDS,
    });
    if (!before) return null;

    // Empty PATCH → no-op. Don't write an audit row for a non-change.
    const hasChanges = Object.keys(body).length > 0;
    if (!hasChanges) {
      return { tag: before };
    }

    let after: ClientTag;
    try {
      after = await tx.clientTag.update({
        where: { id },
        data: body,
        select: CLIENT_TAG_SAFE_FIELDS,
      });
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw new DuplicateClientTagNameError();
      }
      throw err;
    }

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'client_tag.updated',
      entityId: after.id,
      before,
      after,
    });

    return { tag: after };
  });
}

export async function softDeleteClientTag(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
  },
): Promise<{ deleted: boolean }> {
  const { tenantId, actorUserId, id } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.clientTag.findFirst({
      where: { tenantId, id },
      select: CLIENT_TAG_SAFE_FIELDS,
    });
    if (!before) return { deleted: false };

    const after = await tx.clientTag.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: CLIENT_TAG_SAFE_FIELDS,
    });

    // Don't tear down client_tag_assignments rows on soft-delete: assignment
    // history is part of the audit/reporting trail. UI filters the deleted
    // tag out of pickers and badge rendering.
    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'client_tag.deleted',
      entityId: id,
      before,
      after,
    });

    return { deleted: true };
  });
}
