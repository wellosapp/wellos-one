import 'server-only';

import { getTenantBrand } from '@/lib/api/tenant-brand';

import { FALLBACK_BRAND_COLORS, type BrandColor } from './colors';

// Resolves the active brand-color palette for the current tenant.
//
// Returns tenant.brandColors when the array is non-empty; otherwise falls
// back to FALLBACK_BRAND_COLORS. Safe to call from server components —
// catches API errors and falls back rather than throwing.
//
// Lives in its own module (instead of colors.ts) because the API client
// transitively imports `server-only` via @clerk/nextjs; co-locating with
// the picker constants would poison the client bundle. The picker accepts
// a `presets` prop that takes the result.
export async function loadTenantBrandColors(): Promise<BrandColor[]> {
  try {
    const { brandColors } = await getTenantBrand();
    return brandColors.length > 0 ? brandColors : [...FALLBACK_BRAND_COLORS];
  } catch {
    return [...FALLBACK_BRAND_COLORS];
  }
}
