-- Booking policies — R2 §11 (Instant / Request approval / Staff-only).
-- Adds:
--   * BookingPolicy enum
--   * services.booking_policy column (default 'instant' — keeps existing rows behavior)
--   * AppointmentStatus.requested value (created by public booking when policy
--     is request_approval; transitions requested → confirmed or cancelled)
--
-- The existing appointments_no_overlap_per_staff EXCLUDE constraint filters on
-- `state NOT IN ('cancelled', 'no_show')`, so `requested` rows occupy the slot
-- and prevent double-booking the same time on the same staff member.

-- CreateEnum
CREATE TYPE "BookingPolicy" AS ENUM ('instant', 'request_approval', 'staff_only');

-- AlterEnum
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'requested';

-- AlterTable
ALTER TABLE "services"
  ADD COLUMN "booking_policy" "BookingPolicy" NOT NULL DEFAULT 'instant';
