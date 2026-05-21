-- Slot holds for the public booking flow (R2 §9). Short-lived reservations
-- that block a (staff, time) tuple while a client works through the booking
-- flow. Default TTL is 7 minutes (enforced in services/slotHoldService.ts).
--
-- Conflict semantics mirror Appointment overlap (half-open ranges) but live
-- in a separate table so expired/released holds can be ignored cheaply and
-- never need GC out of `appointments`. Cleanup of expired rows happens via
-- a future BullMQ worker; for now `expireStaleHolds()` runs on demand.

-- 1. Status enum.
CREATE TYPE "SlotHoldStatus" AS ENUM ('active', 'consumed', 'expired', 'released');

-- 2. Table. All time columns are TIMESTAMPTZ(3) to match Appointment.
CREATE TABLE "slot_holds" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "resource_id" TEXT,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "SlotHoldStatus" NOT NULL DEFAULT 'active',
    "idempotency_key" TEXT,
    "created_by_fingerprint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slot_holds_pkey" PRIMARY KEY ("id")
);

-- 3. Indexes — drive expiration sweeps and the (staff, time) overlap probe
--    used by availabilityService.excludeActiveHolds.
CREATE INDEX "slot_holds_tenant_id_status_expires_at_idx"
  ON "slot_holds"("tenant_id", "status", "expires_at");

CREATE INDEX "slot_holds_staff_id_starts_at_ends_at_status_idx"
  ON "slot_holds"("staff_id", "starts_at", "ends_at", "status");

-- 4. Foreign keys. RESTRICT on every reference: a hold pins live state and
--    we never want a tenant/location/service/staff delete to cascade into
--    booking flow audit (hard-delete the holds first, then the parent).
ALTER TABLE "slot_holds"
  ADD CONSTRAINT "slot_holds_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "slot_holds"
  ADD CONSTRAINT "slot_holds_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "slot_holds"
  ADD CONSTRAINT "slot_holds_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "services"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "slot_holds"
  ADD CONSTRAINT "slot_holds_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
