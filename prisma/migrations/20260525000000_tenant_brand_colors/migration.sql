-- Phase 1 of the Brand Settings epic: tenant-scoped brand color palette.
-- JSONB array of { name, hex } objects. Empty by default → application
-- layer falls back to FALLBACK_BRAND_COLORS (the 8 Wellos defaults).
-- Phase 2+ adds logo, fonts, and full theme tokens.

ALTER TABLE "tenants"
  ADD COLUMN "brand_colors" jsonb NOT NULL DEFAULT '[]'::jsonb;
