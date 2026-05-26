-- Forms System rebuild, Phase 4 — global FormTemplate library (PR 4 of 12).
-- See docs/forms-system-epic.md.
--
-- Templates are GLOBAL (no tenant_id) — every tenant sees the same library.
-- Cloning a template copies its schema into a fresh, tenant-scoped
-- IntakeFormDefinition (with field/section IDs regenerated). Templates
-- themselves are read-only from the admin UI; only the seed script writes
-- to this table.
--
-- Slug is the stable identifier the seed upserts against — re-running the
-- seed updates schemas without renumbering ids.

CREATE TABLE "form_template" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  -- Same enum as intake_form_definitions.form_type — keep CHECK lists in sync.
  "form_type" TEXT NOT NULL,
  -- Coarse category for filtering in the UI: massage | medspa | fitness |
  -- wellness | general | salon | studio. Loose by design — this is just for
  -- filtering, not authorization.
  "category" TEXT,
  "schema" JSONB NOT NULL,
  "icon_name" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "form_template_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "form_template_slug_key" ON "form_template"("slug");
CREATE INDEX "form_template_form_type_idx" ON "form_template"("form_type");
CREATE INDEX "form_template_category_idx" ON "form_template"("category");
CREATE INDEX "form_template_is_active_idx" ON "form_template"("is_active");

-- Same value set as intake_form_definitions_form_type_check.
ALTER TABLE "form_template"
  ADD CONSTRAINT "form_template_form_type_check"
  CHECK ("form_type" IN (
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

ALTER TABLE "form_template"
  ADD CONSTRAINT "form_template_category_check"
  CHECK ("category" IS NULL OR "category" IN (
    'general', 'massage', 'medspa', 'fitness', 'wellness',
    'salon', 'studio'
  ));
