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
//
// ClientTag M2M: tagIds[] on the create/update body is the inline edit
// surface. Both writes happen in the same $transaction as the parent
// client write. Cross-tenant tag IDs raise INVALID_TAG_IDS (mirrors
// serviceService.validateStaffIds).

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

// Small projection of ClientTag returned alongside Client rows (list +
// detail) for badge rendering. Keeps the wire payload small and lets the
// UI render the pill without a second fetch.
export type ClientTagSummary = {
  id: string;
  name: string;
  color: string | null;
};

export type ClientWithTags = Client & {
  tagIds: string[];
  tags: ClientTagSummary[];
};

export type DuplicateWarning = {
  matchedByEmail: number;
  matchedByPhone: number;
  matchIds: string[];
};

export type CreateClientResult = {
  client: ClientWithTags;
  duplicateWarning: DuplicateWarning | null;
};

export type UpdateClientResult = {
  client: ClientWithTags;
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

// Verify every requested tagId belongs to this tenant AND is not soft-
// deleted. Returns the validated set. Throws INVALID_TAG_IDS if any ID is
// invalid -- 400 over silent drop.
async function validateTagIds(
  tx: ExtendedTransactionClient,
  args: { tenantId: string; tagIds: string[] },
): Promise<string[]> {
  if (args.tagIds.length === 0) return [];
  const found = await tx.clientTag.findMany({
    where: { tenantId: args.tenantId, id: { in: args.tagIds } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((t) => t.id));
  const missing = args.tagIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    const err = new Error(
      `Unknown tag IDs for this tenant: ${missing.join(', ')}`,
    );
    (err as Error & { code?: string }).code = 'INVALID_TAG_IDS';
    throw err;
  }
  return [...foundIds];
}

// Replace the client_tag_assignments rows for a client with exactly the
// given set. Caller is responsible for already having validated the IDs.
async function replaceClientTags(
  tx: ExtendedTransactionClient,
  args: { clientId: string; tagIds: string[] },
): Promise<void> {
  await tx.clientTagAssignment.deleteMany({
    where: { clientId: args.clientId },
  });
  if (args.tagIds.length > 0) {
    await tx.clientTagAssignment.createMany({
      data: args.tagIds.map((tid) => ({
        clientId: args.clientId,
        tagId: tid,
      })),
    });
  }
}

// Load the tag projection used for list/detail responses. Filters out
// soft-deleted tags so badges / pickers don't render orphaned pills,
// while leaving the client_tag_assignments rows intact for audit history.
async function loadTagsForClients(
  tx: ExtendedTransactionClient,
  clientIds: string[],
): Promise<Map<string, ClientTagSummary[]>> {
  if (clientIds.length === 0) return new Map();
  const rows = await tx.clientTagAssignment.findMany({
    where: {
      clientId: { in: clientIds },
      tag: { deletedAt: null },
    },
    select: {
      clientId: true,
      tag: { select: { id: true, name: true, color: true } },
    },
    orderBy: [{ tag: { name: 'asc' } }],
  });
  const out = new Map<string, ClientTagSummary[]>();
  for (const r of rows) {
    const arr = out.get(r.clientId) ?? [];
    arr.push(r.tag);
    out.set(r.clientId, arr);
  }
  return out;
}

async function loadTagIds(
  tx: ExtendedTransactionClient,
  clientId: string,
): Promise<string[]> {
  const rows = await tx.clientTagAssignment.findMany({
    where: { clientId, tag: { deletedAt: null } },
    select: { tagId: true },
    orderBy: [{ tag: { name: 'asc' } }],
  });
  return rows.map((r) => r.tagId);
}

type AuditPayload = ClientWithTags | null;

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action: 'client.created' | 'client.updated' | 'client.deleted';
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
    const validatedTagIds = body.tagIds
      ? await validateTagIds(tx, { tenantId, tagIds: body.tagIds })
      : [];

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

    if (body.tagIds) {
      await replaceClientTags(tx, {
        clientId: client.id,
        tagIds: validatedTagIds,
      });
    }

    const tagsByClient = await loadTagsForClients(tx, [client.id]);
    const tags = tagsByClient.get(client.id) ?? [];
    const withTags: ClientWithTags = {
      ...client,
      tagIds: validatedTagIds,
      tags,
    };

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'client.created',
      entityId: client.id,
      before: null,
      after: withTags,
    });

    return { client: withTags, duplicateWarning };
  });
}

export async function listClients(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    query: ListClientsQuery;
  },
): Promise<{ clients: Array<Client & { tags: ClientTagSummary[] }>; total: number }> {
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

  return prisma.$transaction(async (tx) => {
    const [clients, total] = await Promise.all([
      tx.client.findMany({
        where,
        select: CLIENT_SAFE_FIELDS,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.take,
        skip: query.skip,
      }),
      tx.client.count({ where }),
    ]);

    const tagsByClient = await loadTagsForClients(
      tx,
      clients.map((c) => c.id),
    );
    const decorated = clients.map((c) => ({
      ...c,
      tags: tagsByClient.get(c.id) ?? [],
    }));

    return { clients: decorated, total };
  });
}

export async function getClientById(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    id: string;
  },
): Promise<ClientWithTags | null> {
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.findFirst({
      where: { tenantId: args.tenantId, id: args.id },
      select: CLIENT_SAFE_FIELDS,
    });
    if (!client) return null;
    const tagIds = await loadTagIds(tx, client.id);
    const tagsByClient = await loadTagsForClients(tx, [client.id]);
    const tags = tagsByClient.get(client.id) ?? [];
    return { ...client, tagIds, tags };
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
    const beforeClient = await tx.client.findFirst({
      where: { tenantId, id },
      select: CLIENT_SAFE_FIELDS,
    });
    if (!beforeClient) return null;
    const beforeTagIds = await loadTagIds(tx, id);
    const beforeTags = (await loadTagsForClients(tx, [id])).get(id) ?? [];
    const before: ClientWithTags = {
      ...beforeClient,
      tagIds: beforeTagIds,
      tags: beforeTags,
    };

    // Empty PATCH (no client fields, no tagIds) → no-op.
    const hasClientChanges =
      Object.keys(body).filter((k) => k !== 'tagIds').length > 0;
    const hasTagIdsChange = 'tagIds' in body && body.tagIds !== undefined;
    if (!hasClientChanges && !hasTagIdsChange) {
      return { client: before, duplicateWarning: null };
    }

    // Only re-check duplicates when email/phone changed.
    const emailChanged = 'email' in body && body.email !== beforeClient.email;
    const phoneChanged = 'phone' in body && body.phone !== beforeClient.phone;
    const duplicateWarning =
      emailChanged || phoneChanged
        ? await findDuplicates(tx, {
            tenantId,
            email: body.email ?? undefined,
            phone: body.phone ?? undefined,
            excludeId: id,
          })
        : null;

    let afterClient = beforeClient;
    if (hasClientChanges) {
      // Strip tagIds (not a client column) before passing data to update.
      const { tagIds: _omit, ...clientFields } = body;
      void _omit;
      afterClient = await tx.client.update({
        where: { id },
        data: {
          ...clientFields,
          dateOfBirth:
            'dateOfBirth' in clientFields
              ? clientFields.dateOfBirth
                ? new Date(clientFields.dateOfBirth)
                : null
              : undefined,
        },
        select: CLIENT_SAFE_FIELDS,
      });
    }

    let afterTagIds = beforeTagIds;
    if (hasTagIdsChange) {
      const validated = await validateTagIds(tx, {
        tenantId,
        tagIds: body.tagIds!,
      });
      await replaceClientTags(tx, { clientId: id, tagIds: validated });
      afterTagIds = validated;
    }

    const afterTags = (await loadTagsForClients(tx, [id])).get(id) ?? [];
    const after: ClientWithTags = {
      ...afterClient,
      tagIds: afterTagIds,
      tags: afterTags,
    };

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
    const beforeClient = await tx.client.findFirst({
      where: { tenantId, id },
      select: CLIENT_SAFE_FIELDS,
    });
    // Not found OR already soft-deleted → idempotent no-op (caller decides
    // whether to 404 on first case; here we just report whether we made a
    // change).
    if (!beforeClient) return { deleted: false };
    const beforeTagIds = await loadTagIds(tx, id);
    const beforeTags = (await loadTagsForClients(tx, [id])).get(id) ?? [];

    const afterClient = await tx.client.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: CLIENT_SAFE_FIELDS,
    });

    // Don't tear down client_tag_assignments rows on soft-delete: assignment
    // history is part of the audit/reporting trail.
    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'client.deleted',
      entityId: afterClient.id,
      before: { ...beforeClient, tagIds: beforeTagIds, tags: beforeTags },
      after: { ...afterClient, tagIds: beforeTagIds, tags: beforeTags },
    });

    return { deleted: true };
  });
}
