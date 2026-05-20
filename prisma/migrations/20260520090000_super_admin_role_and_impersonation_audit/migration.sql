-- Super-admin role + audit-log impersonation tracking (Phase 1 of the
-- "Sign in as" feature requested 2026-05-20). Pure additive — does not
-- change existing data or break existing audit-log writes.
--
-- Three things this migration does:
--   1. Insert the `super_admin` role row (idempotent via ON CONFLICT).
--   2. Add `subject_user_id` to `audit_log` — filled only when an action
--      was performed under super-admin impersonation (NULL otherwise).
--   3. Add the matching FK + index.

-- 1. Insert super_admin role if it doesn't already exist.
INSERT INTO "roles" ("id", "name", "description", "created_at", "updated_at")
SELECT
  'role_super_admin',
  'super_admin',
  'Platform-wide super administrator. Can impersonate other users for support workflows. Provisioned manually via scripts/bootstrap-admin.ts --super.',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "roles" WHERE "name" = 'super_admin'
);

-- 2. Audit log gains subject_user_id. Nullable — only filled during
--    super-admin impersonation. `actor_user_id` stays the real human.
ALTER TABLE "audit_log" ADD COLUMN "subject_user_id" TEXT;

-- 3. FK to users; on user delete we set to NULL so the audit row
--    survives (audit_log is append-only and never cascades).
ALTER TABLE "audit_log"
  ADD CONSTRAINT "audit_log_subject_user_id_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "audit_log_subject_user_id_idx"
  ON "audit_log"("subject_user_id");
