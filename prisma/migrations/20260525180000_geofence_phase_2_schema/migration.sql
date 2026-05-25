-- Geofence Auto Check-in epic, Phase 2 — schema-only migration.
-- See docs/specs/geofence-check-in-epic.md § Phase 2.
--
-- Three changes in one file:
--   1. New table `location_geofence` — one geofence per Location (unique on location_id).
--   2. `class_bookings` gains 4 columns recording the GPS payload from a geofence check-in.
--      `check_in_method` is already a String? — 'geofence' is just a new accepted value.
--   3. New table `class_check_in_attempt` — append-only audit log for every check-in attempt
--      (success or failure). 90-day retention is a future cron concern, not in this PR.
--
-- Services, routes, UI: all deferred to PRs 6-10 of this epic.

-- ---------- 1. location_geofence ----------

CREATE TABLE "location_geofence" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "location_id" TEXT NOT NULL,
  "center_lat" DECIMAL(11, 8) NOT NULL,
  "center_lng" DECIMAL(11, 8) NOT NULL,
  "radius_meters" INTEGER NOT NULL DEFAULT 50,
  "check_in_window_before_minutes" INTEGER NOT NULL DEFAULT 15,
  "check_in_window_after_minutes" INTEGER NOT NULL DEFAULT 5,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "location_geofence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "location_geofence_location_id_key" ON "location_geofence"("location_id");
CREATE INDEX "location_geofence_tenant_id_idx" ON "location_geofence"("tenant_id");

ALTER TABLE "location_geofence"
  ADD CONSTRAINT "location_geofence_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "location_geofence"
  ADD CONSTRAINT "location_geofence_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE;

-- Sanity caps so tenants can't store nonsense.
ALTER TABLE "location_geofence"
  ADD CONSTRAINT "location_geofence_radius_range"
  CHECK ("radius_meters" >= 25 AND "radius_meters" <= 200);

ALTER TABLE "location_geofence"
  ADD CONSTRAINT "location_geofence_window_before_range"
  CHECK ("check_in_window_before_minutes" >= 0 AND "check_in_window_before_minutes" <= 60);

ALTER TABLE "location_geofence"
  ADD CONSTRAINT "location_geofence_window_after_range"
  CHECK ("check_in_window_after_minutes" >= 0 AND "check_in_window_after_minutes" <= 30);

ALTER TABLE "location_geofence"
  ADD CONSTRAINT "location_geofence_lat_range"
  CHECK ("center_lat" >= -90 AND "center_lat" <= 90);

ALTER TABLE "location_geofence"
  ADD CONSTRAINT "location_geofence_lng_range"
  CHECK ("center_lng" >= -180 AND "center_lng" <= 180);

-- ---------- 2. class_bookings — GPS payload on geofence check-in ----------

ALTER TABLE "class_bookings"
  ADD COLUMN "check_in_lat" DECIMAL(11, 8),
  ADD COLUMN "check_in_lng" DECIMAL(11, 8),
  ADD COLUMN "check_in_accuracy_meters" INTEGER,
  ADD COLUMN "check_in_attempts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "class_bookings"
  ADD CONSTRAINT "class_bookings_check_in_lat_range"
  CHECK ("check_in_lat" IS NULL OR ("check_in_lat" >= -90 AND "check_in_lat" <= 90));

ALTER TABLE "class_bookings"
  ADD CONSTRAINT "class_bookings_check_in_lng_range"
  CHECK ("check_in_lng" IS NULL OR ("check_in_lng" >= -180 AND "check_in_lng" <= 180));

ALTER TABLE "class_bookings"
  ADD CONSTRAINT "class_bookings_check_in_accuracy_nonneg"
  CHECK ("check_in_accuracy_meters" IS NULL OR "check_in_accuracy_meters" >= 0);

-- ---------- 3. class_check_in_attempt — append-only audit log ----------

CREATE TABLE "class_check_in_attempt" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "class_booking_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "method" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "submitted_lat" DECIMAL(11, 8),
  "submitted_lng" DECIMAL(11, 8),
  "submitted_accuracy_meters" INTEGER,
  "distance_from_geofence_meters" DECIMAL(10, 2),
  "user_agent" TEXT,
  "ip_address" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "class_check_in_attempt_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "class_check_in_attempt"
  ADD CONSTRAINT "class_check_in_attempt_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "class_check_in_attempt"
  ADD CONSTRAINT "class_check_in_attempt_class_booking_id_fkey"
  FOREIGN KEY ("class_booking_id") REFERENCES "class_bookings"("id") ON DELETE CASCADE;

ALTER TABLE "class_check_in_attempt"
  ADD CONSTRAINT "class_check_in_attempt_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;

-- Indexes for the queries PR 8 will run (rate limit lookups, anti-spoof
-- pattern checks, per-booking audit drill-down).
CREATE INDEX "class_check_in_attempt_tenant_id_attempted_at_idx"
  ON "class_check_in_attempt"("tenant_id", "attempted_at");

CREATE INDEX "class_check_in_attempt_class_booking_id_attempted_at_idx"
  ON "class_check_in_attempt"("class_booking_id", "attempted_at");

CREATE INDEX "class_check_in_attempt_client_id_attempted_at_idx"
  ON "class_check_in_attempt"("client_id", "attempted_at");

-- Sanity caps on the enum-ish string columns.
ALTER TABLE "class_check_in_attempt"
  ADD CONSTRAINT "class_check_in_attempt_method_check"
  CHECK ("method" IN ('geofence', 'manual'));

ALTER TABLE "class_check_in_attempt"
  ADD CONSTRAINT "class_check_in_attempt_result_check"
  CHECK ("result" IN ('success', 'out_of_range', 'out_of_window', 'low_accuracy', 'suspicious_pattern', 'rate_limited', 'error'));
