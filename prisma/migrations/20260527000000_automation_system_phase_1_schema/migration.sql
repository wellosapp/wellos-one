-- Automation System rebuild, Phase A PR 1 — schema foundation (5 new tables).
-- See docs/specs/automation-system-epic.md.
--
-- Five new tables, no edits to existing tables, no enum types (everything
-- enum-ish lives in TEXT + CHECK so adding a value later doesn't require a
-- non-transactional `ALTER TYPE` dance):
--
--   1. automation_workflows         — workflow definition (React Flow JSON +
--                                     trigger type + status). One row per
--                                     workflow per tenant.
--   2. automation_runs              — per-trigger execution record. Immutable
--                                     once terminal (succeeded/failed/cancelled).
--   3. automation_node_runs         — per-node execution within a run. Tracks
--                                     status, input/output JSON, retry count.
--   4. automation_templates         — system-owned starter library (no
--                                     tenant_id, same shape as form_template).
--                                     Seeds land in PR 17.
--   5. automation_webhook_deliveries — webhook-action dispatch log with retry
--                                      schedule. Exercised by PR 16.
--
-- Subsequent PRs (2-20) build the engine, dispatcher, canvas, internal
-- actions, templates, safety. Schema only here — no services, no routes,
-- no UI, no seeds.
--
-- Partial indexes (status-scoped) are declared in raw SQL because Prisma 5
-- cannot express `@@index(..., where: ...)`. The Prisma schema declares
-- plain @@index entries for diff hygiene; the partial covers the hot-path
-- subset. Same pattern as form_reminder_scheduled_for_pending_idx from the
-- Forms System Phase 1 migration.

-- ---------- 1. automation_workflows ----------

CREATE TABLE "automation_workflows" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "trigger_type" TEXT NOT NULL,
  -- React Flow shape extended with per-node config:
  -- { nodes: Array<{ id, type, position, data: {...} }>,
  --   edges: Array<{ id, source, target, sourceHandle?, targetHandle?, label? }> }
  "workflow_json" JSONB NOT NULL,
  "created_by_user_id" TEXT,
  "updated_by_user_id" TEXT,
  -- Most recent run summary for the dashboard list (denormalized — engine
  -- updates these on terminal transition in PR 2).
  "last_run_status" TEXT,
  "last_run_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_workflows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "automation_workflows_tenant_id_idx"
  ON "automation_workflows"("tenant_id");

-- Hot path: "find active workflows matching this trigger" — the dispatcher
-- (PR 3) uses this every event.
CREATE INDEX "automation_workflows_tenant_trigger_status_idx"
  ON "automation_workflows"("tenant_id", "trigger_type", "status");

CREATE INDEX "automation_workflows_tenant_status_idx"
  ON "automation_workflows"("tenant_id", "status");

ALTER TABLE "automation_workflows"
  ADD CONSTRAINT "automation_workflows_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "automation_workflows"
  ADD CONSTRAINT "automation_workflows_status_check"
  CHECK ("status" IN ('draft', 'active', 'paused', 'archived', 'error'));

-- ---------- 2. automation_runs ----------

CREATE TABLE "automation_runs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "trigger_event" TEXT NOT NULL,
  -- The event payload that triggered the run + any context the engine
  -- accumulates as it walks the graph (resolved client, appointment, etc.)
  "context_json" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "automation_runs_tenant_id_status_idx"
  ON "automation_runs"("tenant_id", "status");

CREATE INDEX "automation_runs_workflow_id_created_at_idx"
  ON "automation_runs"("workflow_id", "created_at" DESC);

-- Hot path: pending/running runs that the engine needs to resume after
-- restart. Partial index keeps the index small — once a run is terminal
-- (succeeded/failed/cancelled) it's no longer interesting to the engine.
CREATE INDEX "automation_runs_pending_idx"
  ON "automation_runs"("status", "created_at")
  WHERE "status" IN ('pending', 'running');

ALTER TABLE "automation_runs"
  ADD CONSTRAINT "automation_runs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;

ALTER TABLE "automation_runs"
  ADD CONSTRAINT "automation_runs_workflow_id_fkey"
  FOREIGN KEY ("workflow_id") REFERENCES "automation_workflows"("id") ON DELETE CASCADE;

ALTER TABLE "automation_runs"
  ADD CONSTRAINT "automation_runs_status_check"
  CHECK ("status" IN ('pending', 'running', 'succeeded', 'failed', 'cancelled'));

-- ---------- 3. automation_node_runs ----------

CREATE TABLE "automation_node_runs" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  -- Matches a node.id in workflow_json.nodes[].id.
  "node_id" TEXT NOT NULL,
  -- 'trigger' | 'action' | 'condition' | 'delay' | 'branch' | 'filter' |
  -- 'webhook' | 'ai' (CHECK below).
  "node_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "input_json" JSONB,
  "output_json" JSONB,
  "error_message" TEXT,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "automation_node_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "automation_node_runs_run_id_started_at_idx"
  ON "automation_node_runs"("run_id", "started_at");

CREATE INDEX "automation_node_runs_run_id_status_idx"
  ON "automation_node_runs"("run_id", "status");

ALTER TABLE "automation_node_runs"
  ADD CONSTRAINT "automation_node_runs_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "automation_runs"("id") ON DELETE CASCADE;

ALTER TABLE "automation_node_runs"
  ADD CONSTRAINT "automation_node_runs_status_check"
  CHECK ("status" IN ('pending', 'running', 'succeeded', 'failed', 'skipped', 'retrying'));

ALTER TABLE "automation_node_runs"
  ADD CONSTRAINT "automation_node_runs_node_type_check"
  CHECK ("node_type" IN ('trigger', 'action', 'condition', 'delay', 'branch', 'filter', 'webhook', 'ai'));

-- ---------- 4. automation_templates ----------
--
-- System-owned (no tenant_id) — same pattern as form_template. Seeds land
-- in PR 17. Slug is the stable seed-upsert key.

CREATE TABLE "automation_templates" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "trigger_type" TEXT NOT NULL,
  "workflow_json" JSONB NOT NULL,
  "icon_name" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "automation_templates_slug_key"
  ON "automation_templates"("slug");

CREATE INDEX "automation_templates_category_idx"
  ON "automation_templates"("category");

CREATE INDEX "automation_templates_trigger_type_idx"
  ON "automation_templates"("trigger_type");

CREATE INDEX "automation_templates_is_active_idx"
  ON "automation_templates"("is_active");

-- Loose category constraint — adjust as templates are seeded in PR 17.
ALTER TABLE "automation_templates"
  ADD CONSTRAINT "automation_templates_category_check"
  CHECK ("category" IN (
    'booking', 'client', 'forms', 'payment', 'membership',
    'communication', 'staff', 'clinical', 'general'
  ));

-- ---------- 5. automation_webhook_deliveries ----------

CREATE TABLE "automation_webhook_deliveries" (
  "id" TEXT NOT NULL,
  "workflow_id" TEXT NOT NULL,
  "run_id" TEXT,
  "target_url" TEXT NOT NULL,
  "payload_json" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "response_status_code" INTEGER,
  "response_body" TEXT,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- Hot path: the cron picks up pending/sending rows with next_retry_at <= NOW.
-- Partial index keeps it small — most deliveries terminal (succeeded/failed)
-- shortly after creation.
CREATE INDEX "automation_webhook_deliveries_pending_retries_idx"
  ON "automation_webhook_deliveries"("status", "next_retry_at")
  WHERE "status" IN ('pending', 'sending') AND "next_retry_at" IS NOT NULL;

CREATE INDEX "automation_webhook_deliveries_workflow_id_idx"
  ON "automation_webhook_deliveries"("workflow_id");

CREATE INDEX "automation_webhook_deliveries_run_id_idx"
  ON "automation_webhook_deliveries"("run_id");

ALTER TABLE "automation_webhook_deliveries"
  ADD CONSTRAINT "automation_webhook_deliveries_workflow_id_fkey"
  FOREIGN KEY ("workflow_id") REFERENCES "automation_workflows"("id") ON DELETE CASCADE;

-- ON DELETE SET NULL on run_id — a webhook delivery can outlive its run
-- (e.g. the run gets pruned by a future retention policy) and we still want
-- the delivery record for audit/retry reconciliation.
ALTER TABLE "automation_webhook_deliveries"
  ADD CONSTRAINT "automation_webhook_deliveries_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "automation_runs"("id") ON DELETE SET NULL;

ALTER TABLE "automation_webhook_deliveries"
  ADD CONSTRAINT "automation_webhook_deliveries_status_check"
  CHECK ("status" IN ('pending', 'sending', 'succeeded', 'failed'));
