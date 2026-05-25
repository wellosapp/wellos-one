-- Phase 4 of the Classes epic: track "late arrival" for class bookings.
-- Visual indicator only per spec — no policy enforcement.
-- Cron-based state transitions deferred to Epic 8.

ALTER TABLE "class_bookings"
  ADD COLUMN "late" BOOLEAN NOT NULL DEFAULT false;
