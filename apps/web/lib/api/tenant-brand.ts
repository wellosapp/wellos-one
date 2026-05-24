// Type-safe wrappers for /admin/tenant/brand. Mirrors the Zod schemas
// in apps/api/src/schemas/tenantBrand.ts. Kept in sync by hand at MVP.

import { apiFetch } from './client';

export type BrandColor = { name: string; hex: string };

export async function getTenantBrand(): Promise<{ brandColors: BrandColor[] }> {
  return apiFetch<{ brandColors: BrandColor[] }>('/admin/tenant/brand');
}

export async function updateTenantBrand(body: {
  brandColors: BrandColor[];
}): Promise<{ brandColors: BrandColor[] }> {
  return apiFetch<{ brandColors: BrandColor[] }>('/admin/tenant/brand', {
    method: 'PATCH',
    body,
  });
}
