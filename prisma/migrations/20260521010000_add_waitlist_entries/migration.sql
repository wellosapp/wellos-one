-- Waitlist entries — R2 §10 (Client signup → Matching → Claim).
--
-- Captures the client's preferences (service, optional staff, date window,
-- time-of-day, contact info, SMS opt-in) when no slot fits at booking time.
-- The matching engine (services/waitlistService.findEligibleEntriesForOpening)
-- looks up rows here when an opening appears (appointment cancellation,
-- schedule change, manual staff trigger). Notification dispatch lives in
-- Epic 8 (BullMQ worker); for now the trigger hook only logs eligible matches.
--
-- Tenant scoping: every row carries tenant_id with the standard composite
-- indexes. Soft-delete is intentionally omitted — status=cancelled / expired
-- serves the same role and reporting can include both. The "no duplicate
-- active entry per (tenant, contact, service)" invariant is enforced at the
-- service layer (createWaitlistEntry upserts when it finds a match by
-- contactEmail OR contactPhone).
--
-- All time columns are TIMESTAMPTZ(3) to match Appointment + StaffScheduleBlock.

-- 1. Status enum.
CREATE TYPE "WaitlistEntryStatus" AS ENUM (
  'active',
  'offered',
  'claimed',
  'expired',
  'cancelled'
);

-- 2. Table.
CREATE TABLE "waitlist_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "staff_id" TEXT,
    "contact_name" TEXT NOT NULL,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "preferred_start" TIMESTAMPTZ(3),
    "preferred_end" TIMESTAMPTZ(3),
    "preferred_time_of_day" TEXT,
    "sms_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "status" "WaitlistEntryStatus" NOT NULL DEFAULT 'active',
    "ttl_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "offered_at" TIMESTAMPTZ(3),
    "offered_appointment_id" TEXT,
    "claimed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- 3. Indexes — drive expiration sweeps + matching engine + admin filters.
--    (tenant, status, ttl) — admin list sorted by next-to-expire active row.
--    (service, status)     — matching engine scoped to a service opening.
--    (staff, status)       — matching engine when staff_id preference matters.
CREATE INDEX "waitlist_entries_tenant_id_status_ttl_expires_at_idx"
  ON "waitlist_entries"("tenant_id", "status", "ttl_expires_at");

CREATE INDEX "waitlist_entries_service_id_status_idx"
  ON "waitlist_entries"("service_id", "status");

CREATE INDEX "waitlist_entries_staff_id_status_idx"
  ON "waitlist_entries"("staff_id", "status");

-- 4. Foreign keys.
--    Tenant / Location / Service: RESTRICT — never cascade-delete waitlist
--      audit history when an admin tries to delete the parent.
--    Staff: SET NULL — staff turnover should keep the entry routable to any
--      eligible staff for the service.
ALTER TABLE "waitlist_entries"
  ADD CONSTRAINT "waitlist_entries_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "waitlist_entries"
  ADD CONSTRAINT "waitlist_entries_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "waitlist_entries"
  ADD CONSTRAINT "waitlist_entries_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "services"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "waitlist_entries"
  ADD CONSTRAINT "waitlist_entries_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
