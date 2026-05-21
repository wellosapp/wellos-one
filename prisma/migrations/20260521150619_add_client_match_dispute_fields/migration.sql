-- Returning-client recognition (docs/04-booking-flow.md §B). Adds:
--   * ClientMatchStrength enum — strength tier set by ClientMatchResolver.
--   * appointments.match_strength (nullable) — null for staff-created rows.
--   * appointments.client_match_disputed (default false) — flipped to true
--     when the client taps "This isn't me" on the confirmation card.
--   * tenants.booking_client_recognition_mode default bumped to
--     'email_phone_or_name' — the spec's hybrid default. Existing rows
--     keep their current value; only new tenants pick up the new default.

-- CreateEnum
CREATE TYPE "ClientMatchStrength" AS ENUM ('strong', 'weak', 'name_only', 'ambiguous');

-- AlterTable
ALTER TABLE "appointments"
  ADD COLUMN "match_strength" "ClientMatchStrength",
  ADD COLUMN "client_match_disputed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tenants" ALTER COLUMN "booking_client_recognition_mode" SET DEFAULT 'email_phone_or_name';
