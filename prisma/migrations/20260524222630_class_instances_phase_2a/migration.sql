-- Phase 2a of the Classes epic: per-occurrence rows for manual scheduling.
-- recurrence_rule_id stays nullable here — Phase 2b adds the RecurrenceRule
-- table and the cron that populates it.

CREATE TABLE "class_instances" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "class_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "location_id" TEXT NOT NULL,
  "scheduled_start_at" TIMESTAMPTZ NOT NULL,
  "scheduled_end_at" TIMESTAMPTZ NOT NULL,
  "capacity_override" INTEGER,
  "waitlist_override" INTEGER,
  "state" TEXT NOT NULL DEFAULT 'scheduled',
  "cancelled_reason" TEXT,
  "cancelled_at" TIMESTAMPTZ,
  "recurrence_rule_id" TEXT,  -- nullable; Phase 2b populates
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "class_instances_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_instances_class_id_fkey" FOREIGN KEY ("class_id")
    REFERENCES "classes"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_instances_staff_id_fkey" FOREIGN KEY ("staff_id")
    REFERENCES "staff"("id") ON DELETE RESTRICT,
  CONSTRAINT "class_instances_location_id_fkey" FOREIGN KEY ("location_id")
    REFERENCES "locations"("id") ON DELETE RESTRICT
);

CREATE INDEX "class_instances_tenant_id_idx" ON "class_instances" ("tenant_id");
CREATE INDEX "class_instances_tenant_id_scheduled_start_at_idx" ON "class_instances" ("tenant_id", "scheduled_start_at");
CREATE INDEX "class_instances_class_id_idx" ON "class_instances" ("class_id");
CREATE INDEX "class_instances_staff_id_scheduled_start_at_idx" ON "class_instances" ("staff_id", "scheduled_start_at");
CREATE INDEX "class_instances_state_idx" ON "class_instances" ("state");
