import { Prisma } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type { BrandColor } from '../schemas/tenantBrand.js';

// Tenant-scoped brand color palette (Phase 1 of Brand Settings).
// JSONB array of { name, hex } on tenants.brand_colors. Empty array means
// "fall back to FALLBACK_BRAND_COLORS at the web layer." Audit on writes.

export type TenantBrand = {
  brandColors: BrandColor[];
};

export async function getTenantBrand(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string },
): Promise<TenantBrand> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: args.tenantId },
    select: { brandColors: true },
  });
  // Tenant must exist (request.currentUser.tenantId is always valid for an
  // authed session); cast to array safely.
  const brandColors = Array.isArray(tenant?.brandColors)
    ? (tenant.brandColors as unknown as BrandColor[])
    : [];
  return { brandColors };
}

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    before: TenantBrand;
    after: TenantBrand;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: 'tenant.brand_updated',
      entityType: 'tenant',
      entityId: args.tenantId,
      before: args.before as unknown as Prisma.InputJsonValue,
      after: args.after as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function updateTenantBrand(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    brandColors: BrandColor[];
  },
): Promise<TenantBrand> {
  return prisma.$transaction(async (tx) => {
    // Snapshot before
    const before = await tx.tenant.findUnique({
      where: { id: args.tenantId },
      select: { brandColors: true },
    });
    const beforeColors = Array.isArray(before?.brandColors)
      ? (before.brandColors as unknown as BrandColor[])
      : [];

    await tx.tenant.update({
      where: { id: args.tenantId },
      data: {
        brandColors: args.brandColors as unknown as Prisma.InputJsonValue,
      },
    });

    await writeAudit(tx, {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      before: { brandColors: beforeColors },
      after: { brandColors: args.brandColors },
    });

    return { brandColors: args.brandColors };
  });
}
