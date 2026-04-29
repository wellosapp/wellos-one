import { Prisma } from '@prisma/client';
import type { Client } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  CreateClientBody,
  ListClientsQuery,
  UpdateClientBody,
} from '../schemas/client.js';

// Domain layer for Client admin CRUD.
//
// Tenant scoping: every query passes tenantId. The soft-delete extension
// (apps/api/src/db/softDelete.ts) auto-filters deletedAt: null on reads;
// callers don't need to pass it. List/get behavior treats soft-deleted
// rows as not-found unless `includeDeleted` is explicitly set.
//
// Duplicate detection: on create + email/phone changes via update, return a
// non-blocking warning. UI surfaces this as "looks like X already exists,
// continue?" rather than rejecting. The DB has no unique constraint on
// (tenantId, email) or (tenantId, phone) — see schema.prisma comments.
//
// Audit log: create/update/delete all write an audit_log row inside the
// same transaction as the mutation. Action names: client.created,
// client.updated, client.deleted. Actor is the authenticated user.

const CLIENT_SAFE_FIELDS = {
  id: true,
  tenantId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  dateOfBirth: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  intakeStatus: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.ClientSelect;

export type DuplicateWarning = {
  matchedByEmail: number;
  matchedByPhone: number;
  matchIds: string[];
};

export type CreateClientResult = {
  client: Client;
  duplicateWarning: DuplicateWarning | null;
};

export type UpdateClientResult = {
  client: Client;
  duplicateWarning: DuplicateWarning | null;
};

async function findDuplicates(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    email: string | undefined;
    phone: string | undefined;
    excludeId?: string;
  },
): Promise<DuplicateWarning | null> {
  const { tenantId, email, phone, excludeId } = args;
  if (!email && !phone) return null;

  const orClauses: Prisma.ClientWhereInput[] = [];
  if (email) orClauses.push({ email });
  if (phone) orClauses.push({ phone });

  const matches = await tx.client.findMany({
    where: {
      tenantId,
      OR: orClauses,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, email: true, phone: true },
    take: 25, // cap; UI can show "X+ matches" if hit
  });

  if (matches.length === 0) return null;

  return {
    matchedByEmail: email
      ? matches.filter((m) => m.email === email).length
      : 0,
    matchedByPhone: phone
      ? matches.filter((m) => m.phone === phone).length
      : 0,
    matchIds: matches.map((m) => m.id),
  };
}

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action: 'client.created' | 'client.updated' | 'client.deleted';
    entityId: string;
    before: Client | null;
    after: Client | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: 'client',
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

export async function createClient(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    body: CreateClientBody;
  },
): Promise<CreateClientResult> {
  const { tenantId, actorUserId, body } = args;

  return prisma.$transaction(async (tx) => {
    const duplicateWarning = await findDuplicates(tx, {
      tenantId,
      email: body.email,
      phone: body.phone,
    });

    const client = await tx.client.create({
      data: {
        tenantId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        addressLine1: body.addressLine1,
        addressLine2: body.addressLine2,
        city: body.city,
        state: body.state,
        postalCode: body.postalCode,
        country: body.country,
        emergencyContactName: body.emergencyContactName,
        emergencyContactPhone: body.emergencyContactPhone,
        intakeStatus: body.intakeStatus,
        notes: body.notes,
      },
      select: CLIENT_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'client.created',
      entityId: client.id,
      before: null,
      after: client,
    });

    return { client, duplicateWarning };
  });
}

export async function listClients(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    query: ListClientsQuery;
  },
): Promise<{ clients: Client[]; total: number }> {
  const { tenantId, query } = args;

  // Build a Prisma where that the soft-delete extension can still inject
  // deletedAt: null into. Setting deletedAt explicitly in the where (when
  // includeDeleted is true) opts out.
  const where: Prisma.ClientWhereInput = { tenantId };
  if (query.intakeStatus) where.intakeStatus = query.intakeStatus;
  if (query.q) {
    where.OR = [
      { firstName: { contains: query.q, mode: 'insensitive' } },
      { lastName: { contains: query.q, mode: 'insensitive' } },
      { email: { contains: query.q, mode: 'insensitive' } },
      { phone: { contains: query.q } },
    ];
  }
  if (query.includeDeleted) {
    // Opt-out: extension only injects when the field is absent.
    where.deletedAt = undefined;
  }

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      select: CLIENT_SAFE_FIELDS,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.take,
      skip: query.skip,
    }),
    prisma.client.count({ where }),
  ]);

  return { clients, total };
}

export async function getClientById(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    id: string;
  },
): Promise<Client | null> {
  return prisma.client.findFirst({
    where: { tenantId: args.tenantId, id: args.id },
    select: CLIENT_SAFE_FIELDS,
  });
}

export async function updateClient(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    body: UpdateClientBody;
  },
): Promise<UpdateClientResult | null> {
  const { tenantId, actorUserId, id, body } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.client.findFirst({
      where: { tenantId, id },
      select: CLIENT_SAFE_FIELDS,
    });
    if (!before) return null;

    // Empty PATCH → no-op. Don't write an audit row for a non-change.
    const hasChanges = Object.keys(body).length > 0;
    if (!hasChanges) {
      return { client: before, duplicateWarning: null };
    }

    // Only re-check duplicates when email/phone changed.
    const emailChanged = 'email' in body && body.email !== before.email;
    const phoneChanged = 'phone' in body && body.phone !== before.phone;
    const duplicateWarning =
      emailChanged || phoneChanged
        ? await findDuplicates(tx, {
            tenantId,
            email: body.email ?? undefined,
            phone: body.phone ?? undefined,
            excludeId: id,
          })
        : null;

    const after = await tx.client.update({
      where: { id },
      data: {
        ...body,
        dateOfBirth:
          'dateOfBirth' in body
            ? body.dateOfBirth
              ? new Date(body.dateOfBirth)
              : null
            : undefined,
      },
      select: CLIENT_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'client.updated',
      entityId: after.id,
      before,
      after,
    });

    return { client: after, duplicateWarning };
  });
}

export async function softDeleteClient(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
  },
): Promise<{ deleted: boolean }> {
  const { tenantId, actorUserId, id } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.client.findFirst({
      where: { tenantId, id },
      select: CLIENT_SAFE_FIELDS,
    });
    // Not found OR already soft-deleted → idempotent no-op (caller decides
    // whether to 404 on first case; here we just report whether we made a
    // change).
    if (!before) return { deleted: false };

    const after = await tx.client.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: CLIENT_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'client.deleted',
      entityId: after.id,
      before,
      after,
    });

    return { deleted: true };
  });
}
