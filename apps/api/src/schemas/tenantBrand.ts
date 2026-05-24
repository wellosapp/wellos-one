import { z } from 'zod';

// Tenant brand-color palette validation (Phase 1 of Brand Settings).
// JSONB column on tenants.brand_colors stores an array of { name, hex }.
// Empty array means "fall back to FALLBACK_BRAND_COLORS at the web layer."

// Hex color: # + exactly 6 hex digits (case-insensitive).
const HEX_COLOR = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a 6-digit hex like #5D7C66')
  .transform((s) => s.toUpperCase());

export const BrandColorSchema = z.object({
  name: z.string().trim().min(1).max(50),
  hex: HEX_COLOR,
});

// Max 24 colors per tenant (sanity cap). Empty allowed.
export const UpdateBrandColorsBodySchema = z.object({
  brandColors: z.array(BrandColorSchema).max(24),
});

export type BrandColor = z.infer<typeof BrandColorSchema>;
export type UpdateBrandColorsBody = z.infer<typeof UpdateBrandColorsBodySchema>;
