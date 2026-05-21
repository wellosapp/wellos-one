-- Recurring appointment series (Tier B — wellos_booking_coverage_matrix §3).
-- Adds:
--   * SeriesCadence enum (weekly / biweekly / monthly)
--   * AppointmentSeriesStatus enum (active / cancelled / completed)
--   * appointment_series table — template for a recurring series
--   * appointments.series_id (nullable FK, SetNull on series delete)
--   * appointments_series_id_idx for the cancel-future sweep query

-- CreateEnum
CREATE TYPE "SeriesCadence" AS ENUM ('weekly', 'biweekly', 'monthly');

-- CreateEnum
CREATE TYPE "AppointmentSeriesStatus" AS ENUM ('active', 'cancelled', 'completed');

-- CreateTable
CREATE TABLE "appointment_series" (
    "id"                         TEXT                      NOT NULL,
    "tenant_id"                  TEXT                      NOT NULL,
    "client_id"                  TEXT                      NOT NULL,
    "staff_id"                   TEXT                      NOT NULL,
    "service_id"                 TEXT                      NOT NULL,
    "location_id"                TEXT                      NOT NULL,
    "cadence"                    "SeriesCadence"           NOT NULL,
    "days_of_week"               INTEGER[]                 NOT NULL,
    "time_of_day"                TEXT                      NOT NULL,
    "duration_minutes_snapshot"  INTEGER                   NOT NULL,
    "price_cents_snapshot"       INTEGER                   NOT NULL,
    "anchor_date"                DATE                      NOT NULL,
    "occurrence_count"           INTEGER,
    "ends_on"                    DATE,
    "status"                     "AppointmentSeriesStatus" NOT NULL DEFAULT 'active',
    "created_by_user_id"         TEXT,
    "cancelled_at"               TIMESTAMPTZ(3),
    "cancelled_by_user_id"       TEXT,
    "cancel_reason"              TEXT,
    "created_at"                 TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                 TIMESTAMP(3)              NOT NULL,
    "deleted_at"                 TIMESTAMP(3),

    CONSTRAINT "appointment_series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_series_tenant_id_idx" ON "appointment_series"("tenant_id");

-- CreateIndex
CREATE INDEX "appointment_series_tenant_id_client_id_idx" ON "appointment_series"("tenant_id", "client_id");

-- CreateIndex
CREATE INDEX "appointment_series_tenant_id_staff_id_idx" ON "appointment_series"("tenant_id", "staff_id");

-- CreateIndex
CREATE INDEX "appointment_series_tenant_id_status_idx" ON "appointment_series"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "appointment_series_tenant_id_deleted_at_idx" ON "appointment_series"("tenant_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "appointment_series"
  ADD CONSTRAINT "appointment_series_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_series"
  ADD CONSTRAINT "appointment_series_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_series"
  ADD CONSTRAINT "appointment_series_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_series"
  ADD CONSTRAINT "appointment_series_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_series"
  ADD CONSTRAINT "appointment_series_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "series_id" TEXT;

-- AddForeignKey
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_series_id_fkey"
  FOREIGN KEY ("series_id") REFERENCES "appointment_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex (cancel-future-occurrences sweep query)
CREATE INDEX "appointments_series_id_idx" ON "appointments"("series_id");
