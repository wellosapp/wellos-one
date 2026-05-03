-- Staff schedule blocks (breaks, PTO, meetings, closures). calendar-area-features §9.
CREATE TYPE "StaffScheduleBlockCategory" AS ENUM (
  'break',
  'lunch',
  'pto',
  'meeting',
  'training',
  'maintenance',
  'closure',
  'custom'
);

CREATE TYPE "ScheduleBlockVisibility" AS ENUM ('internal', 'public_busy');

CREATE TABLE "staff_schedule_blocks" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "location_id" TEXT,
  "title" TEXT NOT NULL,
  "category" "StaffScheduleBlockCategory" NOT NULL,
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "visibility" "ScheduleBlockVisibility" NOT NULL DEFAULT 'internal',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(3),

  CONSTRAINT "staff_schedule_blocks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "staff_schedule_blocks"
  ADD CONSTRAINT "staff_schedule_blocks_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_schedule_blocks"
  ADD CONSTRAINT "staff_schedule_blocks_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_schedule_blocks"
  ADD CONSTRAINT "staff_schedule_blocks_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "staff_schedule_blocks_tenant_id_staff_id_starts_at_idx"
  ON "staff_schedule_blocks"("tenant_id", "staff_id", "starts_at");

CREATE INDEX "staff_schedule_blocks_staff_id_starts_at_ends_at_idx"
  ON "staff_schedule_blocks"("staff_id", "starts_at", "ends_at");

CREATE INDEX "staff_schedule_blocks_tenant_id_deleted_at_idx"
  ON "staff_schedule_blocks"("tenant_id", "deleted_at");
