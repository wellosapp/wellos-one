/*
  Warnings:

  - You are about to drop the column `aftercare_markdown` on the `services` table. All the data in the column will be lost.
  - You are about to drop the column `prep_instructions_markdown` on the `services` table. All the data in the column will be lost.
  - You are about to drop the column `what_to_expect_markdown` on the `services` table. All the data in the column will be lost.
  - You are about to drop the `client_files` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "MediaAssetVisibility" AS ENUM ('location', 'provider_only', 'admin_only');

-- CreateEnum
CREATE TYPE "MediaAccessClass" AS ENUM ('public_booking', 'tenant_staff', 'client_owned', 'protected_medspa', 'generated');

-- CreateEnum
CREATE TYPE "MediaOwnerType" AS ENUM ('tenant', 'location', 'service', 'staff', 'client', 'appointment', 'campaign');

-- DropForeignKey
ALTER TABLE "client_files" DROP CONSTRAINT "client_files_appointment_id_fkey";

-- DropForeignKey
ALTER TABLE "client_files" DROP CONSTRAINT "client_files_client_id_fkey";

-- DropForeignKey
ALTER TABLE "client_files" DROP CONSTRAINT "client_files_note_id_fkey";

-- DropForeignKey
ALTER TABLE "client_files" DROP CONSTRAINT "client_files_service_id_fkey";

-- DropForeignKey
ALTER TABLE "client_files" DROP CONSTRAINT "client_files_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "client_files" DROP CONSTRAINT "client_files_uploaded_by_staff_id_fkey";

-- NOTE: Prisma generated `ALTER TABLE "client_notes" ALTER COLUMN
-- "alert_triggers" DROP DEFAULT;` here because the schema didn't yet have
-- @default([]). Hand-removed and the schema now declares @default([]) so
-- the DB DEFAULT stays. Without the default, any insert that omits the
-- column hits NOT NULL violation.

-- AlterTable
ALTER TABLE "services" DROP COLUMN "aftercare_markdown",
DROP COLUMN "prep_instructions_markdown",
DROP COLUMN "what_to_expect_markdown";

-- DropTable
DROP TABLE "client_files";

-- DropEnum
DROP TYPE "ClientFileVisibility";

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "access_class" "MediaAccessClass" NOT NULL,
    "owner_type" "MediaOwnerType" NOT NULL,
    "tenant_owner_id" TEXT,
    "location_owner_id" TEXT,
    "service_owner_id" TEXT,
    "staff_owner_id" TEXT,
    "client_owner_id" TEXT,
    "appointment_owner_id" TEXT,
    "campaign_owner_id" TEXT,
    "note_id" TEXT,
    "folder" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration_seconds" INTEGER,
    "alt_text" TEXT,
    "caption" TEXT,
    "variants" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "visibility" "MediaAssetVisibility" NOT NULL DEFAULT 'location',
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by_user_id" TEXT,
    "uploaded_by_staff_id" TEXT,
    "uploaded_by_client" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_media_roots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "public_bucket" TEXT NOT NULL,
    "private_bucket" TEXT NOT NULL,
    "protected_bucket" TEXT,
    "root_prefix" TEXT NOT NULL,
    "cdn_base_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_media_roots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_folder_templates" (
    "id" TEXT NOT NULL,
    "product_scope" TEXT NOT NULL,
    "owner_type" "MediaOwnerType" NOT NULL,
    "folder_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "default_access_class" "MediaAccessClass" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "media_folder_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_assets_tenant_id_idx" ON "media_assets"("tenant_id");

-- CreateIndex
CREATE INDEX "media_assets_tenant_id_deleted_at_idx" ON "media_assets"("tenant_id", "deleted_at");

-- CreateIndex
CREATE INDEX "media_assets_tenant_id_owner_type_idx" ON "media_assets"("tenant_id", "owner_type");

-- CreateIndex
CREATE INDEX "media_assets_tenant_owner_id_idx" ON "media_assets"("tenant_owner_id");

-- CreateIndex
CREATE INDEX "media_assets_location_owner_id_idx" ON "media_assets"("location_owner_id");

-- CreateIndex
CREATE INDEX "media_assets_service_owner_id_idx" ON "media_assets"("service_owner_id");

-- CreateIndex
CREATE INDEX "media_assets_staff_owner_id_idx" ON "media_assets"("staff_owner_id");

-- CreateIndex
CREATE INDEX "media_assets_client_owner_id_idx" ON "media_assets"("client_owner_id");

-- CreateIndex
CREATE INDEX "media_assets_appointment_owner_id_idx" ON "media_assets"("appointment_owner_id");

-- CreateIndex
CREATE INDEX "media_assets_campaign_owner_id_idx" ON "media_assets"("campaign_owner_id");

-- CreateIndex
CREATE INDEX "media_assets_note_id_idx" ON "media_assets"("note_id");

-- CreateIndex
CREATE INDEX "media_assets_tenant_id_archived_at_idx" ON "media_assets"("tenant_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_bucket_object_key_key" ON "media_assets"("bucket", "object_key");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_media_roots_tenant_id_key" ON "tenant_media_roots"("tenant_id");

-- CreateIndex
CREATE INDEX "media_folder_templates_owner_type_display_order_idx" ON "media_folder_templates"("owner_type", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "media_folder_templates_owner_type_folder_key_key" ON "media_folder_templates"("owner_type", "folder_key");

-- NOTE: Prisma re-emitted CREATE INDEX statements for client_notes
-- (client_id, category) and (client_id, priority) here because the
-- partial indexes in the prior migration don't match the @@index()
-- declaration shape that Prisma can express. Hand-removed — the partial
-- indexes from the prior migration stay as-is. If we ever add @@index
-- changes to client_notes that genuinely need a re-index, generate a
-- DROP INDEX + CREATE INDEX (partial) pair by hand.

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_tenant_owner_fkey" FOREIGN KEY ("tenant_owner_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_location_owner_id_fkey" FOREIGN KEY ("location_owner_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_service_owner_id_fkey" FOREIGN KEY ("service_owner_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_staff_owner_id_fkey" FOREIGN KEY ("staff_owner_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_client_owner_id_fkey" FOREIGN KEY ("client_owner_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_appointment_owner_id_fkey" FOREIGN KEY ("appointment_owner_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "client_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_staff_id_fkey" FOREIGN KEY ("uploaded_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_media_roots" ADD CONSTRAINT "tenant_media_roots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
