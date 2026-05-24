import { Prisma } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type { BrandColor } from '../schemas/tenantBrand.js';

import { getDisplayUrl } from './mediaService.js';

// Tenant-scoped brand settings.
//   - brandColors: JSONB array of { name, hex } on tenants.brand_colors.
//     Empty array means "fall back to FALLBACK_BRAND_COLORS at the web layer."
//   - logo: nullable FK on tenants.logo_media_asset_id pointing at a
//     MediaAsset row with ownerType='tenant'. getDisplayUrl() resolves the
//     R2 signed URL on read.

export type TenantLogo = {
  id: string;
  displayUrl: string | null;
};

export type TenantBrand = {
  brandColors: BrandColor[];
  logo: TenantLogo | null;
};

export async function getTenantBrand(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string },
): Promise<TenantBrand> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: args.tenantId },
    select: {
      brandColors: true,
      logoMediaAsset: true,
    },
  });
  // Tenant must exist (request.currentUser.tenantId is always valid for an
  // authed session); cast to array safely.
  const brandColors = Array.isArray(tenant?.brandColors)
    ? (tenant.brandColors as unknown as BrandColor[])
    : [];

  let logo: TenantLogo | null = null;
  if (tenant?.logoMediaAsset) {
    // R2 URL resolution can fail if R2 isn't configured; surface null and let
    // the rail fall back to LeafIcon + 'Wellos' text instead of 500-ing.
    let displayUrl: string | null = null;
    try {
      displayUrl = await getDisplayUrl(tenant.logoMediaAsset);
    } catch {
      displayUrl = null;
    }
    logo = { id: tenant.logoMediaAsset.id, displayUrl };
  }

  return { brandColors, logo };
}

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    before: { brandColors: BrandColor[]; logoMediaAssetId: string | null };
    after: { brandColors: BrandColor[]; logoMediaAssetId: string | null };
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

export class InvalidTenantLogoError extends Error {
  code = 'INVALID_TENANT_LOGO' as const;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTenantLogoError';
  }
}

export async function updateTenantBrand(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    brandColors?: BrandColor[];
    // undefined = no change; null = clear; string = set
    logoMediaAssetId?: string | null;
  },
): Promise<TenantBrand> {
  return prisma.$transaction(async (tx) => {
    // Snapshot before
    const before = await tx.tenant.findUnique({
      where: { id: args.tenantId },
      select: { brandColors: true, logoMediaAssetId: true },
    });
    const beforeColors = Array.isArray(before?.brandColors)
      ? (before.brandColors as unknown as BrandColor[])
      : [];
    const beforeLogoId = before?.logoMediaAssetId ?? null;

    // Tenant safety check on the logo FK. If the caller is setting a non-null
    // logo id, confirm the asset:
    //   1. exists
    //   2. belongs to this tenant (tenantId match)
    //   3. has ownerType='tenant' AND tenantOwnerId matching this tenant
    // Refusing cross-tenant references is critical — otherwise a malicious
    // admin could point their tenant's logo at another tenant's MediaAsset.
    if (args.logoMediaAssetId) {
      const asset = await tx.mediaAsset.findFirst({
        where: { id: args.logoMediaAssetId, tenantId: args.tenantId },
        select: {
          id: true,
          tenantId: true,
          ownerType: true,
          tenantOwnerId: true,
        },
      });
      if (!asset) {
        throw new InvalidTenantLogoError(
          'Logo media asset not found for this tenant.',
        );
      }
      if (asset.ownerType !== 'tenant') {
        throw new InvalidTenantLogoError(
          'Logo media asset must have ownerType=tenant.',
        );
      }
      if (asset.tenantOwnerId !== args.tenantId) {
        throw new InvalidTenantLogoError(
          'Logo media asset does not belong to this tenant.',
        );
      }
    }

    const data: Prisma.TenantUpdateInput = {};
    if (args.brandColors !== undefined) {
      data.brandColors = args.brandColors as unknown as Prisma.InputJsonValue;
    }
    if (args.logoMediaAssetId !== undefined) {
      // Set or clear the FK via the relation API so Prisma's typing stays happy.
      data.logoMediaAsset =
        args.logoMediaAssetId === null
          ? { disconnect: true }
          : { connect: { id: args.logoMediaAssetId } };
    }

    await tx.tenant.update({
      where: { id: args.tenantId },
      data,
    });

    const afterColors =
      args.brandColors !== undefined ? args.brandColors : beforeColors;
    const afterLogoId =
      args.logoMediaAssetId !== undefined ? args.logoMediaAssetId : beforeLogoId;

    await writeAudit(tx, {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      before: { brandColors: beforeColors, logoMediaAssetId: beforeLogoId },
      after: { brandColors: afterColors, logoMediaAssetId: afterLogoId },
    });

    // Re-fetch via getTenantBrand to compute the fresh displayUrl after the
    // FK change. Reads stay inside the transaction.
    const reloaded = await tx.tenant.findUnique({
      where: { id: args.tenantId },
      select: { brandColors: true, logoMediaAsset: true },
    });
    const reloadedColors = Array.isArray(reloaded?.brandColors)
      ? (reloaded.brandColors as unknown as BrandColor[])
      : [];
    let logo: TenantLogo | null = null;
    if (reloaded?.logoMediaAsset) {
      let displayUrl: string | null = null;
      try {
        displayUrl = await getDisplayUrl(reloaded.logoMediaAsset);
      } catch {
        displayUrl = null;
      }
      logo = { id: reloaded.logoMediaAsset.id, displayUrl };
    }

    return { brandColors: reloadedColors, logo };
  });
}
