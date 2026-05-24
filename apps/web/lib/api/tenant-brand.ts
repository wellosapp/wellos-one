// Type-safe wrappers for /admin/tenant/brand. Mirrors the Zod schemas
// in apps/api/src/schemas/tenantBrand.ts. Kept in sync by hand at MVP.

import { apiFetch } from './client';

export type BrandColor = { name: string; hex: string };

export type TenantLogo = { id: string; displayUrl: string | null };

export type TenantBrand = {
  brandColors: BrandColor[];
  logo: TenantLogo | null;
};

export async function getTenantBrand(): Promise<TenantBrand> {
  return apiFetch<TenantBrand>('/admin/tenant/brand');
}

// At least one of brandColors / logoMediaAssetId must be present:
//   - brandColors omitted = no palette change
//   - logoMediaAssetId omitted = no logo change
//   - logoMediaAssetId null   = clear the logo
//   - logoMediaAssetId string = set/replace the logo
export async function updateTenantBrand(body: {
  brandColors?: BrandColor[];
  logoMediaAssetId?: string | null;
}): Promise<TenantBrand> {
  return apiFetch<TenantBrand>('/admin/tenant/brand', {
    method: 'PATCH',
    body,
  });
}
