-- Automation System Phase A PR 4 — delay queue persistence table.
-- See docs/specs/automation-system-epic.md.
--
-- One row per paused workflow run. The engine (PR 2) returns a 'delayed'
-- sentinel when it hits a delay node; the trigger dispatcher (PR 3) and the
-- cron resumer (this PR) both write into this table via the shared helper
-- in services/automationDelayedNodeService.ts.
--
-- Lifecycle:
--   resumed_at IS NULL AND cancelled_at IS NULL  → pending (cron picks up)
--   resumed_at NOT NULL                          → engine.resumeRun was called
--   cancelled_at NOT NULL                        → either the run was cancelled
--                                                  (cascade from Phase F) or the
--                                                  pre-resume run-status check
--                                                  found the run terminal already
--
-- Partial index keeps the pending-lookup index small in steady state — same
-- pattern as form_reminder_scheduled_for_pending_idx + automation_runs_pending_idx.

-- ---------- automation_delayed_nodes ----------

CREATE TABLE "automation_delayed_nodes" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  -- The delay node id within the workflow_json that paused this run.
  "paused_at_node_id" TEXT NOT NULL,
  "resume_at" TIMESTAMP(3) NOT NULL,
  "resumed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_delayed_nodes_pkey" PRIMARY KEY ("id")
);

-- Cron picks up due, not-yet-resumed, not-cancelled rows. Partial index
-- keeps the index small in steady state.
CREATE INDEX "automation_delayed_nodes_pending_idx"
  ON "automation_delayed_nodes"("resume_at")
  WHERE "resumed_at" IS NULL AND "cancelled_at" IS NULL;

CREATE INDEX "automation_delayed_nodes_resume_at_idx"
  ON "automation_delayed_nodes"("resume_at");

CREATE INDEX "automation_delayed_nodes_run_id_idx"
  ON "automation_delayed_nodes"("run_id");

CREATE INDEX "automation_delayed_nodes_tenant_id_idx"
  ON "automation_delayed_nodes"("tenant_id");

ALTER TABLE "automation_delayed_nodes"
  ADD CONSTRAINT "automation_delayed_nodes_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;

ALTER TABLE "automation_delayed_nodes"
  ADD CONSTRAINT "automation_delayed_nodes_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "automation_runs"("id") ON DELETE CASCADE;
