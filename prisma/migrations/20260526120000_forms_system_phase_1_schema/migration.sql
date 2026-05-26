-- Forms System rebuild, Phase 1 — schema-only foundation (PR 1 of 12).
-- See docs/forms-system-epic.md (the multi-PR plan in this epic).
--
-- Five changes in one file:
--   1. `intake_form_definitions` gains `form_type` + `description`, with a
--      CHECK constraint on the allowed form_type values.
--   2. `intake_form_submissions` gains 10 columns covering delivery, signature,
--      provider review. CHECK constraints on the two enum-ish text columns
--      (delivery_channel, review_status). FK from reviewed_by_staff_id to staff
--      with ON DELETE SET NULL.
--   3. New table `form_assignment_rule` — maps a Service to a form group.
--      `form_definition_group_id` intentionally NOT a FK (groupId is a
--      version-family identifier, not unique on its own).
--   4. New table `form_reminder` — scheduled reminders for unsubmitted
--      assignments. Includes a PARTIAL index for the cron hot path
--      (pending = sent_at IS NULL AND cancelled_at IS NULL).
--   5. New table `form_file_upload` — per-field file attachments referencing
--      existing MediaAsset rows. RESTRICT on media_asset_id (no cascade) so
--      submitted form audit history can't be orphaned.
--
-- Subsequent PRs (2-12) build the builder, templates, delivery, completion
-- UI, etc. Schema only here — no services, no routes, no UI.
-- No data backfill required: every new column is nullable or has a default.

-- ---------- 1. intake_form_definitions — form_type + description ----------

ALTER TABLE "intake_form_definitions"
  ADD COLUMN "form_type" TEXT DEFAULT 'intake',
  ADD COLUMN "description" TEXT;

ALTER TABLE "intake_form_definitions"
  ADD CONSTRAINT "intake_form_definitions_form_type_check"
  CHECK ("form_type" IS NULL OR "form_type" IN (
    'intake',
    'waiver',
    'consent',
    'medical_history',
    'soap_intake',
    'service_specific',
    'membership_agreement',
    'cancellation_ack',
    'fitness_readiness',
    'custom'
  ));

-- ---------- 2. intake_form_submissions — delivery / signature / review ----------

ALTER TABLE "intake_form_submissions"
  ADD COLUMN "opened_at" TIMESTAMP(3),
  ADD COLUMN "started_at" TIMESTAMP(3),
  ADD COLUMN "expires_at" TIMESTAMP(3),
  ADD COLUMN "delivery_channel" TEXT,
  ADD COLUMN "signature_data" JSONB,
  ADD COLUMN "review_status" TEXT,
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_by_staff_id" TEXT,
  ADD COLUMN "review_notes" TEXT;

ALTER TABLE "intake_form_submissions"
  ADD CONSTRAINT "intake_form_submissions_delivery_channel_check"
  CHECK ("delivery_channel" IS NULL OR "delivery_channel" IN (
    'email', 'sms', 'both', 'kiosk', 'inline_booking', 'admin_only'
  ));

ALTER TABLE "intake_form_submissions"
  ADD CONSTRAINT "intake_form_submissions_review_status_check"
  CHECK ("review_status" IS NULL OR "review_status" IN (
    'unreviewed', 'reviewed', 'requires_follow_up', 'approved', 'denied'
  ));

ALTER TABLE "intake_form_submissions"
  ADD CONSTRAINT "intake_form_submissions_reviewed_by_staff_id_fkey"
  FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL;

-- ---------- 3. form_assignment_rule ----------

CREATE TABLE "form_assignment_rule" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  -- References the form's groupId (the version family), not a specific version.
  -- Resolution happens at runtime: "latest published version where groupId
  -- matches and tenantId matches." Intentionally NOT a FK — groupId is not
  -- unique on intake_form_definitions.
  "form_definition_group_id" TEXT NOT NULL,
  "required_level" TEXT NOT NULL DEFAULT 'optional',
  "timing" TEXT NOT NULL DEFAULT 'before_appointment',
  "send_automatically_after_booking" BOOLEAN NOT NULL DEFAULT true,
  "require_provider_review" BOOLEAN NOT NULL DEFAULT false,
  -- Submission expires N days after send. NULL = never expires.
  "expires_after_days" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "form_assignment_rule_pkey" PRIMARY KEY ("id")
);

-- One rule per (service, form-group) pair. Tenant scoping enforced via service FK.
CREATE UNIQUE INDEX "form_assignment_rule_service_id_form_definition_group_id_key"
  ON "form_assignment_rule"("service_id", "form_definition_group_id");

CREATE INDEX "form_assignment_rule_tenant_id_idx"
  ON "form_assignment_rule"("tenant_id");

CREATE INDEX "form_assignment_rule_service_id_idx"
  ON "form_assignment_rule"("service_id");

ALTER TABLE "form_assignment_rule"
  ADD CONSTRAINT "form_assignment_rule_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "form_assignment_rule"
  ADD CONSTRAINT "form_assignment_rule_service_id_fkey"
  FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE;

ALTER TABLE "form_assignment_rule"
  ADD CONSTRAINT "form_assignment_rule_required_level_check"
  CHECK ("required_level" IN ('optional', 'soft_required', 'hard_required'));

ALTER TABLE "form_assignment_rule"
  ADD CONSTRAINT "form_assignment_rule_timing_check"
  CHECK ("timing" IN ('before_booking', 'before_appointment', 'optional'));

ALTER TABLE "form_assignment_rule"
  ADD CONSTRAINT "form_assignment_rule_expires_after_days_range"
  CHECK ("expires_after_days" IS NULL OR ("expires_after_days" > 0 AND "expires_after_days" <= 365));

-- ---------- 4. form_reminder ----------

CREATE TABLE "form_reminder" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "submission_id" TEXT NOT NULL,
  "scheduled_for" TIMESTAMP(3) NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "sent_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "form_reminder_pkey" PRIMARY KEY ("id")
);

-- Partial index for the cron hot path: "all reminders due before NOW that
-- haven't fired yet and haven't been cancelled." Prisma's @@index can't carry
-- a WHERE clause — declared in raw SQL here. The schema also declares a plain
-- @@index([scheduledFor]) but Prisma's diff treats the names as separate; if
-- diff churn appears, drop the plain Prisma index and keep only this one.
CREATE INDEX "form_reminder_scheduled_for_pending_idx"
  ON "form_reminder"("scheduled_for")
  WHERE "sent_at" IS NULL AND "cancelled_at" IS NULL;

CREATE INDEX "form_reminder_submission_id_idx"
  ON "form_reminder"("submission_id");

CREATE INDEX "form_reminder_tenant_id_idx"
  ON "form_reminder"("tenant_id");

ALTER TABLE "form_reminder"
  ADD CONSTRAINT "form_reminder_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;

ALTER TABLE "form_reminder"
  ADD CONSTRAINT "form_reminder_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "intake_form_submissions"("id") ON DELETE CASCADE;

ALTER TABLE "form_reminder"
  ADD CONSTRAINT "form_reminder_channel_check"
  CHECK ("channel" IN ('email', 'sms', 'both'));

-- ---------- 5. form_file_upload ----------

CREATE TABLE "form_file_upload" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "submission_id" TEXT NOT NULL,
  -- Which field in the form schema this file belongs to.
  "field_key" TEXT NOT NULL,
  -- Points at an existing MediaAsset row (already-uploaded to R2).
  "media_asset_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "form_file_upload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "form_file_upload_submission_id_idx"
  ON "form_file_upload"("submission_id");

CREATE INDEX "form_file_upload_tenant_id_idx"
  ON "form_file_upload"("tenant_id");

ALTER TABLE "form_file_upload"
  ADD CONSTRAINT "form_file_upload_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;

ALTER TABLE "form_file_upload"
  ADD CONSTRAINT "form_file_upload_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "intake_form_submissions"("id") ON DELETE CASCADE;

-- RESTRICT (not CASCADE) on media_asset_id — deleting a MediaAsset out from
-- under a submitted form would orphan the form's audit history. The app
-- layer should soft-delete files instead.
ALTER TABLE "form_file_upload"
  ADD CONSTRAINT "form_file_upload_media_asset_id_fkey"
  FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT;
