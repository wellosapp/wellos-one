-- gist EXCLUDE constraints below need the btree_gist extension for the
-- equality-on-staff_id half. Idempotent: CREATE EXTENSION IF NOT EXISTS.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show');

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "buffer_after_minutes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "scheduled_start_at" TIMESTAMPTZ(3) NOT NULL,
    "scheduled_end_at" TIMESTAMPTZ(3) NOT NULL,
    "state" "AppointmentStatus" NOT NULL DEFAULT 'confirmed',
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_user_id" TEXT,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_tenant_id_scheduled_start_at_idx" ON "appointments"("tenant_id", "scheduled_start_at");

-- CreateIndex
CREATE INDEX "appointments_staff_id_scheduled_start_at_idx" ON "appointments"("staff_id", "scheduled_start_at");

-- CreateIndex
CREATE INDEX "appointments_client_id_idx" ON "appointments"("client_id");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_deleted_at_idx" ON "appointments"("tenant_id", "deleted_at");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_state_scheduled_start_at_idx" ON "appointments"("tenant_id", "state", "scheduled_start_at");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ExcludeConstraint (added by hand — Prisma 5 cannot express EXCLUDE).
-- Prevents two appointments for the same staff member from overlapping in
-- time. Partial filter ignores soft-deleted rows and rows in terminal-and-
-- doesn't-occupy-the-slot states (cancelled / no_show).
--
-- '[)' = inclusive start, exclusive end. Two appointments touching at a
-- single instant (one ends 10:00, next starts 10:00) do NOT collide.
--
-- Constraint name `appointments_no_overlap_per_staff` is matched by the
-- service layer's error mapper to surface a 409 with a useful payload.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap_per_staff"
  EXCLUDE USING gist (
    "staff_id" WITH =,
    tstzrange("scheduled_start_at", "scheduled_end_at", '[)') WITH &&
  )
  WHERE (
    "deleted_at" IS NULL
    AND "state" NOT IN ('cancelled', 'no_show')
  );
