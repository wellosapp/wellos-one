import { Prisma } from '@prisma/client';
import type { StaffScheduleBlock } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  CreateStaffScheduleBlockBody,
  ListStaffScheduleBlocksQuery,
  UpdateStaffScheduleBlockBody,
} from '../schemas/staffScheduleBlock.js';

const BLOCK_SAFE_FIELDS = {
  id: true,
  tenantId: true,
  staffId: true,
  locationId: true,
  title: true,
  category: true,
  startsAt: true,
  endsAt: true,
  visibility: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.StaffScheduleBlockSelect;

export type CreateStaffScheduleBlockResult = { block: StaffScheduleBlock };
export type UpdateStaffScheduleBlockResult = { block: StaffScheduleBlock };

export class InvalidStaffScheduleBlockReferenceError extends Error {
  code = 'INVALID_STAFF_SCHEDULE_BLOCK_REFERENCE' as const;
  field: 'staffId' | 'locationId';
  constructor(field: 'staffId' | 'locationId', message: string) {
    super(message);
    this.name = 'InvalidStaffScheduleBlockReferenceError';
    this.field = field;
  }
}

export class StaffScheduleBlockNotFoundError extends Error {
  code = 'STAFF_SCHEDULE_BLOCK_NOT_FOUND' as const;
  constructor(message = 'Schedule block not found.') {
    super(message);
    this.name = 'StaffScheduleBlockNotFoundError';
  }
}

export class StaffScheduleBlockInvalidRangeError extends Error {
  code = 'STAFF_SCHEDULE_BLOCK_INVALID_RANGE' as const;
  constructor(message = 'endsAt must be after startsAt.') {
    super(message);
    this.name = 'StaffScheduleBlockInvalidRangeError';
  }
}

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action:
      | 'staff_schedule_block.created'
      | 'staff_schedule_block.updated'
      | 'staff_schedule_block.deleted';
    entityId: string;
    before: StaffScheduleBlock | null;
    after: StaffScheduleBlock | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: 'staff_schedule_block',
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

async function validateStaffAndLocation(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    staffId: string;
    locationId: string | null | undefined;
  },
): Promise<void> {
  const staff = await tx.staff.findFirst({
    where: { id: args.staffId, tenantId: args.tenantId },
    select: { id: true },
  });
  if (!staff) {
    throw new InvalidStaffScheduleBlockReferenceError(
      'staffId',
      'Unknown staff for this tenant.',
    );
  }
  if (args.locationId != null && args.locationId !== '') {
    const loc = await tx.location.findFirst({
      where: { id: args.locationId, tenantId: args.tenantId },
      select: { id: true },
    });
    if (!loc) {
      throw new InvalidStaffScheduleBlockReferenceError(
        'locationId',
        'Unknown location for this tenant.',
      );
    }
  }
}

export async function listStaffScheduleBlocks(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    query: ListStaffScheduleBlocksQuery;
  },
): Promise<{ blocks: StaffScheduleBlock[] }> {
  const { tenantId, query } = args;
  const from = new Date(query.from);
  const to = new Date(query.to);

  const blocks = await prisma.staffScheduleBlock.findMany({
    where: {
      tenantId,
      staffId: query.staffId,
      deletedAt: null,
      AND: [{ startsAt: { lt: to } }, { endsAt: { gt: from } }],
    },
    orderBy: { startsAt: 'asc' },
    select: BLOCK_SAFE_FIELDS,
  });

  return { blocks };
}

export async function createStaffScheduleBlock(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    body: CreateStaffScheduleBlockBody;
  },
): Promise<CreateStaffScheduleBlockResult> {
  const { tenantId, actorUserId, body } = args;
  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  const locationId =
    body.locationId === undefined || body.locationId === null || body.locationId === ''
      ? null
      : body.locationId;

  return prisma.$transaction(async (tx) => {
    await validateStaffAndLocation(tx, {
      tenantId,
      staffId: body.staffId,
      locationId,
    });

    const block = await tx.staffScheduleBlock.create({
      data: {
        tenantId,
        staffId: body.staffId,
        locationId,
        title: body.title,
        category: body.category,
        startsAt,
        endsAt,
        visibility: body.visibility ?? 'internal',
      },
      select: BLOCK_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'staff_schedule_block.created',
      entityId: block.id,
      before: null,
      after: block,
    });

    return { block };
  });
}

export async function updateStaffScheduleBlock(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    blockId: string;
    body: UpdateStaffScheduleBlockBody;
  },
): Promise<UpdateStaffScheduleBlockResult> {
  const { tenantId, actorUserId, blockId, body } = args;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.staffScheduleBlock.findFirst({
      where: { id: blockId, tenantId, deletedAt: null },
      select: BLOCK_SAFE_FIELDS,
    });
    if (!existing) {
      throw new Error('NOT_FOUND');
    }

    const nextStarts =
      body.startsAt !== undefined ? new Date(body.startsAt) : existing.startsAt;
    const nextEnds =
      body.endsAt !== undefined ? new Date(body.endsAt) : existing.endsAt;
    if (!(nextEnds > nextStarts)) {
      throw new Error('INVALID_BLOCK_RANGE');
    }

    let locationId = existing.locationId;
    if (body.locationId !== undefined) {
      locationId = body.locationId;
    }

    await validateStaffAndLocation(tx, {
      tenantId,
      staffId: existing.staffId,
      locationId,
    });

    const block = await tx.staffScheduleBlock.update({
      where: { id: blockId },
      data: {
        ...(body.locationId !== undefined ? { locationId: body.locationId } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.startsAt !== undefined
          ? { startsAt: new Date(body.startsAt) }
          : {}),
        ...(body.endsAt !== undefined ? { endsAt: new Date(body.endsAt) } : {}),
        ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
      },
      select: BLOCK_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'staff_schedule_block.updated',
      entityId: block.id,
      before: existing,
      after: block,
    });

    return { block };
  });
}

export async function softDeleteStaffScheduleBlock(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    blockId: string;
  },
): Promise<{ ok: true }> {
  const { tenantId, actorUserId, blockId } = args;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.staffScheduleBlock.findFirst({
      where: { id: blockId, tenantId, deletedAt: null },
      select: BLOCK_SAFE_FIELDS,
    });
    if (!existing) {
      throw new StaffScheduleBlockNotFoundError();
    }

    const deletedAt = new Date();
    const block = await tx.staffScheduleBlock.update({
      where: { id: blockId },
      data: { deletedAt },
      select: BLOCK_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'staff_schedule_block.deleted',
      entityId: blockId,
      before: existing,
      after: block,
    });

    return { ok: true };
  });
}
