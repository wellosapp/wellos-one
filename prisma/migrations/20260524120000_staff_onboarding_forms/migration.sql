-- Staff onboarding forms (W9, license, certifications) — mirrors the IntakeForm
-- shape but keyed by staff_id, with no appointment scope and no nullable
-- client/appointment FKs. Append-only audit captures created/updated/submitted/
-- voided actions.

CREATE TYPE "StaffOnboardingFormDefinitionStatus" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "StaffOnboardingFormSubmissionStatus" AS ENUM ('draft', 'submitted');
CREATE TYPE "StaffOnboardingFormSubmissionAuditAction" AS ENUM ('created', 'submitted', 'updated', 'voided');

CREATE TABLE "staff_onboarding_form_definitions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "StaffOnboardingFormDefinitionStatus" NOT NULL DEFAULT 'draft',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_onboarding_form_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_onboarding_form_submissions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "definition_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "status" "StaffOnboardingFormSubmissionStatus" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_onboarding_form_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_onboarding_form_submission_audits" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "action" "StaffOnboardingFormSubmissionAuditAction" NOT NULL,
    "definition_id" TEXT NOT NULL,
    "definition_version" INTEGER NOT NULL,
    "schema_snapshot" JSONB NOT NULL,
    "answers_snapshot" JSONB NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_onboarding_form_submission_audits_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "staff_onboarding_form_definitions"
  ADD CONSTRAINT "staff_onboarding_form_definitions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_onboarding_form_submissions"
  ADD CONSTRAINT "staff_onboarding_form_submissions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_onboarding_form_submissions"
  ADD CONSTRAINT "staff_onboarding_form_submissions_definition_id_fkey"
  FOREIGN KEY ("definition_id") REFERENCES "staff_onboarding_form_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_onboarding_form_submissions"
  ADD CONSTRAINT "staff_onboarding_form_submissions_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_onboarding_form_submission_audits"
  ADD CONSTRAINT "staff_onboarding_form_submission_audits_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_onboarding_form_submission_audits"
  ADD CONSTRAINT "staff_onboarding_form_submission_audits_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "staff_onboarding_form_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "staff_onboarding_form_definitions_tenant_id_group_id_version_key"
  ON "staff_onboarding_form_definitions"("tenant_id", "group_id", "version");

CREATE INDEX "staff_onboarding_form_definitions_tenant_id_idx" ON "staff_onboarding_form_definitions"("tenant_id");
CREATE INDEX "staff_onboarding_form_definitions_tenant_id_group_id_idx" ON "staff_onboarding_form_definitions"("tenant_id", "group_id");
CREATE INDEX "staff_onboarding_form_definitions_tenant_id_status_idx" ON "staff_onboarding_form_definitions"("tenant_id", "status");

CREATE INDEX "staff_onboarding_form_submissions_tenant_id_idx" ON "staff_onboarding_form_submissions"("tenant_id");
CREATE INDEX "staff_onboarding_form_submissions_tenant_id_staff_id_idx" ON "staff_onboarding_form_submissions"("tenant_id", "staff_id");
CREATE INDEX "staff_onboarding_form_submissions_tenant_id_definition_id_idx" ON "staff_onboarding_form_submissions"("tenant_id", "definition_id");

CREATE INDEX "staff_onboarding_form_submission_audits_tenant_id_idx" ON "staff_onboarding_form_submission_audits"("tenant_id");
CREATE INDEX "staff_onboarding_form_submission_audits_submission_id_created_at_idx"
  ON "staff_onboarding_form_submission_audits"("submission_id", "created_at");

-- W9 seed — one published v1 definition per existing tenant. Form group id is
-- stable across tenants so future tenant provisioning can backfill the same key.
INSERT INTO "staff_onboarding_form_definitions" (
  "id", "tenant_id", "group_id", "title", "schema", "version", "status", "is_active",
  "created_at", "updated_at"
)
SELECT
  'sofd_w9_' || t."id",
  t."id",
  'w9-2018-rev-october',
  'W-9 (Request for Taxpayer Identification Number and Certification)',
  '{
    "fields": [
      { "key": "name", "type": "text", "label": "Name (as shown on your income tax return)", "required": true },
      { "key": "businessName", "type": "text", "label": "Business name / disregarded entity name (if different from above)" },
      { "key": "federalTaxClassification", "type": "multi_select", "label": "Federal tax classification", "required": true, "options": ["Individual / sole proprietor", "C Corporation", "S Corporation", "Partnership", "Trust / estate", "LLC", "Other"] },
      { "key": "addressLine1", "type": "text", "label": "Address (street + number)", "required": true },
      { "key": "addressLine2", "type": "text", "label": "Apt / suite / unit (optional)" },
      { "key": "city", "type": "text", "label": "City", "required": true },
      { "key": "state", "type": "text", "label": "State (2-letter code)", "required": true },
      { "key": "zipCode", "type": "text", "label": "ZIP code", "required": true },
      { "key": "tinType", "type": "multi_select", "label": "TIN type", "required": true, "options": ["SSN", "EIN"] },
      { "key": "tin", "type": "text", "label": "Taxpayer Identification Number (SSN or EIN)", "required": true },
      { "key": "signatureName", "type": "signature", "label": "Signature — type your full legal name", "required": true },
      { "key": "signatureDate", "type": "date", "label": "Date", "required": true }
    ]
  }'::jsonb,
  1,
  'published',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" t
WHERE t."deleted_at" IS NULL;
