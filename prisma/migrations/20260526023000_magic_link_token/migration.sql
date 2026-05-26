-- Magic Link Token foundation — PR 8a of the Geofence Auto Check-in epic.
-- See docs/specs/geofence-check-in-epic.md § Server-side validation.
--
-- This table backs unauthenticated client surfaces that need a bearer
-- token instead of a Clerk session. PR 8b uses it for the geofence
-- check-in flow (purpose='geofence_check_in'). The 'manage_booking'
-- purpose is reserved for a future manage-flow revival and is enforced
-- at the DB layer so the column never accepts garbage values.
--
-- Conventions:
--   - Raw token NEVER persisted. Only a SHA-256 hex digest of the raw
--     token lives in `token_hash`. Verification recomputes the hash from
--     the inbound Authorization header.
--   - At least ONE scope FK must be set. Geofence callers will set both
--     client_id + class_booking_id; future manage-booking callers will
--     set appointment_id (and typically client_id).
--   - Lifecycle is `revoked_at` + `expires_at`. We do NOT soft-delete
--     (no deleted_at column). The cron purges rows that have been
--     expired for >30 days — purpose-built cleanup, not soft-delete.

CREATE TABLE "magic_link_token" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "client_id" TEXT,
  "class_booking_id" TEXT,
  "appointment_id" TEXT,
  "token_hash" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "last_used_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "use_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "magic_link_token_pkey" PRIMARY KEY ("id")
);

-- Token verification path — hash lookup must be O(1).
CREATE UNIQUE INDEX "magic_link_token_token_hash_key"
  ON "magic_link_token"("token_hash");

-- Cleanup cron will scan by expires_at.
CREATE INDEX "magic_link_token_expires_at_idx"
  ON "magic_link_token"("expires_at");

-- Multi-tenant scoping.
CREATE INDEX "magic_link_token_tenant_id_idx"
  ON "magic_link_token"("tenant_id");

-- Partial index for client-scoped queries (PR 8b's eligibility endpoint).
CREATE INDEX "magic_link_token_client_id_idx"
  ON "magic_link_token"("client_id") WHERE "client_id" IS NOT NULL;

-- FKs — cascade on tenant/scope deletion so we never leave orphan tokens.
ALTER TABLE "magic_link_token"
  ADD CONSTRAINT "magic_link_token_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;

ALTER TABLE "magic_link_token"
  ADD CONSTRAINT "magic_link_token_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;

ALTER TABLE "magic_link_token"
  ADD CONSTRAINT "magic_link_token_class_booking_id_fkey"
  FOREIGN KEY ("class_booking_id") REFERENCES "class_bookings"("id") ON DELETE CASCADE;

ALTER TABLE "magic_link_token"
  ADD CONSTRAINT "magic_link_token_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE;

-- At least ONE scope must be set — guarantees verifyToken always has a
-- concrete entity to load. Geofence callers set client_id + class_booking_id;
-- future manage-booking callers set appointment_id.
ALTER TABLE "magic_link_token"
  ADD CONSTRAINT "magic_link_token_scope_check"
  CHECK (
    "client_id" IS NOT NULL OR
    "class_booking_id" IS NOT NULL OR
    "appointment_id" IS NOT NULL
  );

-- Purpose enum enforced at column level — TEXT column for Prisma
-- compatibility, CHECK constraint for safety. Allowed values must stay in
-- sync with MagicLinkPurpose in services/magicLinkService.ts.
ALTER TABLE "magic_link_token"
  ADD CONSTRAINT "magic_link_token_purpose_check"
  CHECK ("purpose" IN ('geofence_check_in', 'manage_booking'));
