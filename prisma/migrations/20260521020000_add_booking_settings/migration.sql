-- Booking settings — R2 §12 (Two-tier settings resolution).
-- Adds tenant-wide booking knobs to `tenants` and per-staff override fields to `staff`.
--
-- Resolution order at runtime (see bookingSettingsService.resolveBookingSetting):
--   appointment override → staff field if non-null → tenant field → hardcoded default.
--
-- All columns NOT NULL with defaults matching R2 §12.1 so existing rows fill
-- automatically. No backfill step required.

-- AlterTable: tenants — tenant-level booking defaults
ALTER TABLE "tenants"
  ADD COLUMN "booking_deposits_enabled"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "booking_deposit_amount_cents"     INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN "booking_cancellation_window_hours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "booking_cancellation_fee_cents"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "booking_no_show_fee_cents"        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "booking_min_notice_hours"         INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "booking_max_window_days"          INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN "booking_default_buffer_minutes"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "booking_walk_ins_allowed"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "booking_tips_enabled"             BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "booking_client_recognition_mode"  TEXT    NOT NULL DEFAULT 'email_phone',
  ADD COLUMN "booking_override_roles"           TEXT    NOT NULL DEFAULT 'admin,manager';

-- AlterTable: staff — per-staff overrides (nullable so they fall through to tenant default)
ALTER TABLE "staff"
  ADD COLUMN "booking_buffer_minutes_override"   INTEGER,
  ADD COLUMN "booking_min_notice_hours_override" INTEGER,
  ADD COLUMN "booking_calendar_sync_opted_in"    BOOLEAN NOT NULL DEFAULT false;
