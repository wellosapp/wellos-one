-- Forms System rebuild, Phase 6 — submission lifecycle expansion + magic-link
-- form_submission purpose. See docs/forms-system-epic.md PR 6.
--
-- Three pieces:
--   1. Add 6 new values to the IntakeFormSubmissionStatus Postgres enum:
--      assigned | sent | opened | in_progress | expired | cancelled.
--      Existing values (draft, submitted) untouched. No renames — Postgres
--      ENUM renames are surgery; additions are cheap.
--      Final 8 values: draft, assigned, sent, opened, in_progress, submitted,
--      expired, cancelled. Review-status track (reviewed/approved/denied)
--      lives on the separate `review_status` text column from PR 1.
--
--   2. Add 'form_submission' to magic_link_token.purpose CHECK. Mirrors the
--      MagicLinkPurpose TS union in services/magicLinkService.ts.
--
--   3. Add optional intake_form_submission_id scope column to magic_link_token,
--      with FK + partial index. Expand the scope CHECK so this new column
--      satisfies the "at least one scope set" invariant alongside the
--      existing three (client_id, class_booking_id, appointment_id).
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block in Postgres.
-- Prisma migrate deploy executes each migration file in a single implicit
-- transaction. The standard workaround is IF NOT EXISTS on each ADD VALUE,
-- which Postgres treats as a no-op when the value already exists. If a future
-- Postgres release tightens this, this migration may need to split into
-- separate files (one ALTER TYPE per file). For now IF NOT EXISTS suffices.

-- ---- IntakeFormSubmissionStatus enum additions ----
ALTER TYPE "IntakeFormSubmissionStatus" ADD VALUE IF NOT EXISTS 'assigned';
ALTER TYPE "IntakeFormSubmissionStatus" ADD VALUE IF NOT EXISTS 'sent';
ALTER TYPE "IntakeFormSubmissionStatus" ADD VALUE IF NOT EXISTS 'opened';
ALTER TYPE "IntakeFormSubmissionStatus" ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE "IntakeFormSubmissionStatus" ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE "IntakeFormSubmissionStatus" ADD VALUE IF NOT EXISTS 'cancelled';

-- NOTE: IntakeFormSubmissionAuditAction enum additions live in the
-- follow-up 20260526210000_forms_audit_action_expansion migration —
-- they were overlooked here and had to be added after this file was
-- already applied to the dev/prod DB. See that file for details.

-- ---- magic_link_token.purpose: add 'form_submission' ----
ALTER TABLE "magic_link_token"
  DROP CONSTRAINT "magic_link_token_purpose_check";

ALTER TABLE "magic_link_token"
  ADD CONSTRAINT "magic_link_token_purpose_check"
  CHECK ("purpose" IN ('geofence_check_in', 'manage_booking', 'form_submission'));

-- ---- magic_link_token: new optional intake_form_submission_id scope ----
ALTER TABLE "magic_link_token"
  ADD COLUMN "intake_form_submission_id" TEXT;

-- Partial index — the column is only populated for form_submission purpose
-- tokens, which will be a minority of total rows. Partial index keeps the
-- index small.
CREATE INDEX "magic_link_token_intake_form_submission_id_idx"
  ON "magic_link_token"("intake_form_submission_id")
  WHERE "intake_form_submission_id" IS NOT NULL;

ALTER TABLE "magic_link_token"
  ADD CONSTRAINT "magic_link_token_intake_form_submission_id_fkey"
  FOREIGN KEY ("intake_form_submission_id")
  REFERENCES "intake_form_submissions"("id")
  ON DELETE CASCADE;

-- Expand the scope CHECK so the new column satisfies "at least one scope set".
-- Form-submission tokens always set intake_form_submission_id and typically
-- client_id too; the OR list lets either one satisfy the invariant.
ALTER TABLE "magic_link_token"
  DROP CONSTRAINT "magic_link_token_scope_check";

ALTER TABLE "magic_link_token"
  ADD CONSTRAINT "magic_link_token_scope_check"
  CHECK (
    "client_id" IS NOT NULL OR
    "class_booking_id" IS NOT NULL OR
    "appointment_id" IS NOT NULL OR
    "intake_form_submission_id" IS NOT NULL
  );
