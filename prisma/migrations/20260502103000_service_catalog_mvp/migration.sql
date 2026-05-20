-- CreateEnum
CREATE TYPE "ServicePriceDisplayMode" AS ENUM ('fixed', 'starting_at', 'range', 'hidden', 'consultation');

-- CreateTable
CREATE TABLE "service_categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_tenant_id_name_key" ON "service_categories"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "service_categories_tenant_id_idx" ON "service_categories"("tenant_id");

-- CreateIndex
CREATE INDEX "service_categories_tenant_id_deleted_at_idx" ON "service_categories"("tenant_id", "deleted_at");

-- CreateIndex
CREATE INDEX "service_categories_tenant_id_display_order_idx" ON "service_categories"("tenant_id", "display_order");

-- AddForeignKey
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "category_id" TEXT,
ADD COLUMN     "description_short" TEXT,
ADD COLUMN     "price_display_mode" "ServicePriceDisplayMode" NOT NULL DEFAULT 'fixed',
ADD COLUMN     "display_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "public_visible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "buffer_before_minutes" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "services_tenant_id_category_id_idx" ON "services"("tenant_id", "category_id");

-- CreateIndex
CREATE INDEX "services_tenant_id_public_visible_idx" ON "services"("tenant_id", "public_visible");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
