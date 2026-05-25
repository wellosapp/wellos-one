-- Phase 2b of the Classes epic: recurrence rules for class instances.
-- The cron that auto-generates instances weekly is deferred to Epic 8
-- (BullMQ infrastructure not yet wired). This migration ships the rule
-- table + FK constraint so the manual "Generate next 12 weeks" endpoint
-- can operate idempotently; Epic 8 just adds a scheduled job that calls
-- the same endpoint.

CREATE TABLE "recurrence_rules" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "class_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "location_id" TEXT NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "byday" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "start_time" TEXT NOT NULL,
  "duration_minutes" INTEGER NOT NULL,
  "timezone" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "recurrence_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "recurrence_rules_class_id_fkey" FOREIGN KEY ("class_id")
    REFERENCES "classes"("id") ON DELETE CASCADE,
  CONSTRAINT "recurrence_rules_staff_id_fkey" FOREIGN KEY ("staff_id")
    REFERENCES "staff"("id") ON DELETE RESTRICT,
  CONSTRAINT "recurrence_rules_location_id_fkey" FOREIGN KEY ("location_id")
    REFERENCES "locations"("id") ON DELETE RESTRICT
);

CREATE INDEX "recurrence_rules_tenant_id_idx" ON "recurrence_rules" ("tenant_id");
CREATE INDEX "recurrence_rules_class_id_idx" ON "recurrence_rules" ("class_id");
CREATE INDEX "recurrence_rules_tenant_id_active_idx" ON "recurrence_rules" ("tenant_id", "active");

-- Wire ClassInstance.recurrence_rule_id (column added in Phase 2a, nullable)
-- to the new recurrence_rules table.
ALTER TABLE "class_instances"
  ADD CONSTRAINT "class_instances_recurrence_rule_id_fkey"
  FOREIGN KEY ("recurrence_rule_id")
  REFERENCES "recurrence_rules"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "class_instances_recurrence_rule_id_idx"
  ON "class_instances" ("recurrence_rule_id");
