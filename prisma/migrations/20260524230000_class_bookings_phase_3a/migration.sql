-- Phase 3a of the Classes epic: bookings + waitlist (admin-side).
-- Public /book Classes tab is Phase 3b. Auto-promote is Phase 3c.
-- Payment processing deferred to Epic 6 — payment_id ships nullable.

CREATE TABLE "class_bookings" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "class_instance_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "booked_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "payment_id" TEXT,
  "state" TEXT NOT NULL DEFAULT 'confirmed',
  "check_in_method" TEXT,
  "checked_in_at" TIMESTAMPTZ,
  "checked_in_by_staff_id" TEXT,
  "cancellation_reason" TEXT,
  "cancellation_initiated_by" TEXT,
  "cancelled_at" TIMESTAMPTZ,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "class_bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_bookings_class_instance_id_fkey" FOREIGN KEY ("class_instance_id")
    REFERENCES "class_instances"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_bookings_client_id_fkey" FOREIGN KEY ("client_id")
    REFERENCES "clients"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_bookings_checked_in_by_staff_id_fkey" FOREIGN KEY ("checked_in_by_staff_id")
    REFERENCES "staff"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "class_bookings_tenant_id_idempotency_key_key"
  ON "class_bookings" ("tenant_id", "idempotency_key");
CREATE INDEX "class_bookings_class_instance_id_state_idx"
  ON "class_bookings" ("class_instance_id", "state");
CREATE INDEX "class_bookings_client_id_idx" ON "class_bookings" ("client_id");
CREATE INDEX "class_bookings_state_idx" ON "class_bookings" ("state");

-- Prevent the same client from being actively booked into the same instance twice.
-- Cancelled/no-show rows don't block re-booking.
CREATE UNIQUE INDEX "class_bookings_active_client_instance_key"
  ON "class_bookings" ("class_instance_id", "client_id")
  WHERE "state" IN ('confirmed', 'checked_in');

CREATE TABLE "class_waitlist_entries" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "class_instance_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "joined_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "promoted_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ,
  "state" TEXT NOT NULL DEFAULT 'waiting',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "class_waitlist_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_waitlist_entries_class_instance_id_fkey" FOREIGN KEY ("class_instance_id")
    REFERENCES "class_instances"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_waitlist_entries_client_id_fkey" FOREIGN KEY ("client_id")
    REFERENCES "clients"("id") ON DELETE RESTRICT
);

CREATE INDEX "class_waitlist_entries_class_instance_id_state_position_idx"
  ON "class_waitlist_entries" ("class_instance_id", "state", "position");
CREATE INDEX "class_waitlist_entries_client_id_idx" ON "class_waitlist_entries" ("client_id");

CREATE UNIQUE INDEX "class_waitlist_entries_active_client_instance_key"
  ON "class_waitlist_entries" ("class_instance_id", "client_id")
  WHERE "state" IN ('waiting', 'promoted');
