-- Phase 2 of the Brand Settings epic: tenant logo.
-- Nullable FK to MediaAsset. ON DELETE SET NULL — if the media asset
-- gets deleted, the tenant just loses its logo (no cascade).

ALTER TABLE "tenants"
  ADD COLUMN "logo_media_asset_id" text;

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_logo_media_asset_id_fkey"
  FOREIGN KEY ("logo_media_asset_id")
  REFERENCES "media_assets"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "tenants_logo_media_asset_id_idx" ON "tenants" ("logo_media_asset_id");
