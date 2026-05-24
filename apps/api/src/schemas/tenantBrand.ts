import { z } from 'zod';

// Tenant brand validation. JSONB column on tenants.brand_colors stores an
// array of { name, hex }. tenants.logo_media_asset_id is a nullable FK to
// MediaAsset for the tenant logo (Phase 2).

// Hex color: # + exactly 6 hex digits (case-insensitive).
const HEX_COLOR = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a 6-digit hex like #5D7C66')
  .transform((s) => s.toUpperCase());

export const BrandColorSchema = z.object({
  name: z.string().trim().min(1).max(50),
  hex: HEX_COLOR,
});

// Update body — at least one field required. Both optional individually:
//   - brandColors omitted = no palette change
//   - logoMediaAssetId omitted = no logo change
//   - logoMediaAssetId null   = clear the logo
//   - logoMediaAssetId string = set/replace the logo
export const UpdateTenantBrandBodySchema = z
  .object({
    brandColors: z.array(BrandColorSchema).max(24).optional(),
    logoMediaAssetId: z.union([z.string().min(1), z.null()]).optional(),
  })
  .refine(
    (b) => b.brandColors !== undefined || b.logoMediaAssetId !== undefined,
    { message: 'At least one of brandColors or logoMediaAssetId is required.' },
  );

export type BrandColor = z.infer<typeof BrandColorSchema>;
export type UpdateTenantBrandBody = z.infer<typeof UpdateTenantBrandBodySchema>;
