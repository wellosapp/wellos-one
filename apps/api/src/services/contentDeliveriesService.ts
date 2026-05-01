import { Prisma } from '@prisma/client';
import type { ServiceContentDelivery } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  CreateContentDeliveryBody,
  UpdateContentDeliveryBody,
} from '../schemas/contentDeliveries.js';

// Domain layer for ServiceContentDelivery (E3-S4e).
//
// Tenant scoping: every query passes tenantId. Soft-delete on reads is
// auto-applied via the Prisma extension; updates/creates aren't filtered
// (so a soft-deleted row can be re-created with the same key — but
// that's unlikely in practice).
//
// Unique constraint (serviceId, deliveryType, channel) raises P2002 on
// duplicate; route layer maps to 400 with field-level error so the UI
// can surface "you already have a prep+sms delivery for this service."
//
// Audit log: create/update/delete write inside the transaction.

const DELIVERY_FIELDS = {
  id: true,
  tenantId: true,
  serviceId: true,
  deliveryType: true,
  channel: true,
  scheduleOffsetMinutes: true,
  isEnabled: true,
  templateOverrideMarkdown: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.ServiceContentDeliverySelect;

export class InvalidContentDeliveryReferenceError extends Error {
  code = 'INVALID_CONTENT_DELIVERY_REFERENCE' as const;
  field: 'serviceId' | 'deliveryType' | 'channel' | 'duplicate';
  constructor(
    field: 'serviceId' | 'deliveryType' | 'channel' | 'duplicate',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidContentDeliveryReferenceError';
    this.field = field;
  }
}

async function ensureServiceForTenant(
  tx: ExtendedTransactionClient,
  args: { tenantId: string; serviceId: string },
): Promise<void> {
  const svc = await tx.service.findFirst({
    where: { id: args.serviceId, tenantId: args.tenantId },
    select: { id: true },
  });
  if (!svc) {
    throw new InvalidContentDeliveryReferenceError(
      'serviceId',
      'Unknown service for this tenant.',
    );
  }
}

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action:
      | 'service_content_delivery.created'
      | 'service_content_delivery.updated'
      | 'service_content_delivery.deleted';
    entityId: string;
    before: ServiceContentDelivery | null;
    after: ServiceContentDelivery | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: 'service_content_delivery',
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

export async function createContentDelivery(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    serviceId: string;
    body: CreateContentDeliveryBody;
  },
): Promise<{ delivery: ServiceContentDelivery }> {
  const { tenantId, actorUserId, serviceId, body } = args;

  return prisma.$transaction(async (tx) => {
    await ensureServiceForTenant(tx, { tenantId, serviceId });

    let delivery: ServiceContentDelivery;
    try {
      delivery = await tx.serviceContentDelivery.create({
        data: {
          tenantId,
          serviceId,
          deliveryType: body.deliveryType,
          channel: body.channel,
          scheduleOffsetMinutes: body.scheduleOffsetMinutes,
          isEnabled: body.isEnabled ?? true,
          templateOverrideMarkdown: body.templateOverrideMarkdown ?? null,
        },
        select: DELIVERY_FIELDS,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new InvalidContentDeliveryReferenceError(
          'duplicate',
          'A content delivery with this (deliveryType, channel) already exists for this service.',
        );
      }
      throw err;
    }

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'service_content_delivery.created',
      entityId: delivery.id,
      before: null,
      after: delivery,
    });

    return { delivery };
  });
}

export async function listContentDeliveries(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; serviceId: string },
): Promise<{ deliveries: ServiceContentDelivery[] }> {
  const { tenantId, serviceId } = args;
  const deliveries = await prisma.serviceContentDelivery.findMany({
    where: { tenantId, serviceId },
    select: DELIVERY_FIELDS,
    orderBy: [
      { deliveryType: 'asc' },
      { channel: 'asc' },
      { scheduleOffsetMinutes: 'asc' },
    ],
  });
  return { deliveries };
}

export async function getContentDeliveryById(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; serviceId: string; deliveryId: string },
): Promise<ServiceContentDelivery | null> {
  return prisma.serviceContentDelivery.findFirst({
    where: {
      tenantId: args.tenantId,
      serviceId: args.serviceId,
      id: args.deliveryId,
    },
    select: DELIVERY_FIELDS,
  });
}

export async function updateContentDelivery(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    serviceId: string;
    deliveryId: string;
    body: UpdateContentDeliveryBody;
  },
): Promise<{ delivery: ServiceContentDelivery } | null> {
  const { tenantId, actorUserId, serviceId, deliveryId, body } = args;

  const hasChanges = Object.keys(body).length > 0;

  return prisma.$transaction(async (tx) => {
    const before = await tx.serviceContentDelivery.findFirst({
      where: { tenantId, serviceId, id: deliveryId },
      select: DELIVERY_FIELDS,
    });
    if (!before) return null;
    if (!hasChanges) return { delivery: before };

    const data: Prisma.ServiceContentDeliveryUpdateInput = {};
    if (body.deliveryType !== undefined) data.deliveryType = body.deliveryType;
    if (body.channel !== undefined) data.channel = body.channel;
    if (body.scheduleOffsetMinutes !== undefined)
      data.scheduleOffsetMinutes = body.scheduleOffsetMinutes;
    if (body.isEnabled !== undefined) data.isEnabled = body.isEnabled;
    if (body.templateOverrideMarkdown !== undefined)
      data.templateOverrideMarkdown = body.templateOverrideMarkdown;

    let after: ServiceContentDelivery;
    try {
      after = await tx.serviceContentDelivery.update({
        where: { id: deliveryId },
        data,
        select: DELIVERY_FIELDS,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new InvalidContentDeliveryReferenceError(
          'duplicate',
          'A content delivery with this (deliveryType, channel) already exists for this service.',
        );
      }
      throw err;
    }

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'service_content_delivery.updated',
      entityId: deliveryId,
      before,
      after,
    });

    return { delivery: after };
  });
}

export async function softDeleteContentDelivery(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    serviceId: string;
    deliveryId: string;
  },
): Promise<{ deleted: boolean }> {
  const { tenantId, actorUserId, serviceId, deliveryId } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.serviceContentDelivery.findFirst({
      where: { tenantId, serviceId, id: deliveryId },
      select: DELIVERY_FIELDS,
    });
    if (!before) return { deleted: false };

    const after = await tx.serviceContentDelivery.update({
      where: { id: deliveryId },
      data: { deletedAt: new Date() },
      select: DELIVERY_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'service_content_delivery.deleted',
      entityId: deliveryId,
      before,
      after,
    });

    return { deleted: true };
  });
}
