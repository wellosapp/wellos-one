-- Epic 5 MVP: versioned intake form definitions, submissions, append-only submit audit.

CREATE TYPE "IntakeFormDefinitionStatus" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "IntakeFormSubmissionStatus" AS ENUM ('draft', 'submitted');
CREATE TYPE "IntakeFormSubmissionAuditAction" AS ENUM ('submitted');

CREATE TABLE "intake_form_definitions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "IntakeFormDefinitionStatus" NOT NULL DEFAULT 'draft',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_form_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "intake_form_submissions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "definition_id" TEXT NOT NULL,
    "client_id" TEXT,
    "appointment_id" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "status" "IntakeFormSubmissionStatus" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_form_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "intake_form_submission_audits" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "action" "IntakeFormSubmissionAuditAction" NOT NULL,
    "definition_id" TEXT NOT NULL,
    "definition_version" INTEGER NOT NULL,
    "schema_snapshot" JSONB NOT NULL,
    "answers_snapshot" JSONB NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_form_submission_audits_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "intake_form_definitions"
  ADD CONSTRAINT "intake_form_definitions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "intake_form_submissions"
  ADD CONSTRAINT "intake_form_submissions_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "intake_form_submissions"
  ADD CONSTRAINT "intake_form_submissions_definition_id_fkey"
  FOREIGN KEY ("definition_id") REFERENCES "intake_form_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "intake_form_submissions"
  ADD CONSTRAINT "intake_form_submissions_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "intake_form_submissions"
  ADD CONSTRAINT "intake_form_submissions_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "intake_form_submission_audits"
  ADD CONSTRAINT "intake_form_submission_audits_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "intake_form_submission_audits"
  ADD CONSTRAINT "intake_form_submission_audits_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "intake_form_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "intake_form_definitions_tenant_id_group_id_version_key"
  ON "intake_form_definitions"("tenant_id", "group_id", "version");

CREATE INDEX "intake_form_definitions_tenant_id_idx" ON "intake_form_definitions"("tenant_id");
CREATE INDEX "intake_form_definitions_tenant_id_group_id_idx" ON "intake_form_definitions"("tenant_id", "group_id");
CREATE INDEX "intake_form_definitions_tenant_id_status_idx" ON "intake_form_definitions"("tenant_id", "status");

CREATE INDEX "intake_form_submissions_tenant_id_idx" ON "intake_form_submissions"("tenant_id");
CREATE INDEX "intake_form_submissions_tenant_id_client_id_idx" ON "intake_form_submissions"("tenant_id", "client_id");
CREATE INDEX "intake_form_submissions_tenant_id_definition_id_idx" ON "intake_form_submissions"("tenant_id", "definition_id");
CREATE INDEX "intake_form_submissions_appointment_id_idx" ON "intake_form_submissions"("appointment_id");

CREATE INDEX "intake_form_submission_audits_tenant_id_idx" ON "intake_form_submission_audits"("tenant_id");
CREATE INDEX "intake_form_submission_audits_submission_id_created_at_idx"
  ON "intake_form_submission_audits"("submission_id", "created_at");
