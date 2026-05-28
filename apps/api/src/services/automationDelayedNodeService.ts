// Automation System Phase A PR 4 — delay queue persistence helpers.
//
// One row per paused workflow run lives in `automation_delayed_nodes`.
// Two callers write into the table:
//   - trigger dispatcher (PR 3) — when engine.startRun returns 'delayed'
//   - cron resumer (this PR, apps/api/src/jobs/automationDelays.ts) — when
//     engine.resumeRun returns 'delayed' again (multi-step delays).
//
// Both go through persistDelayedNode so the insert shape stays in one place.
//
// cancelDelayedNodesForRun is a forward-compat helper for the Phase F
// "cancel a run from the admin UI" flow. PR 4 ships it but has no caller
// yet — the cron uses a different cancel path (it cancels the specific
// row it just inspected, not all rows for the run).
//
// Both helpers accept either the full PrismaClient or an active transaction
// client so future callers can wire them into multi-step writes.

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';

/**
 * Insert one delayed-node sentinel. Returns the new row's id so callers can
 * log/reference it.
 */
export async function persistDelayedNode(
  client: ExtendedPrismaClient | ExtendedTransactionClient,
  args: {
    tenantId: string;
    runId: string;
    pausedAtNodeId: string;
    resumeAt: Date;
  },
): Promise<{ delayedNodeId: string }> {
  const row = await client.automationDelayedNode.create({
    data: {
      tenantId: args.tenantId,
      runId: args.runId,
      pausedAtNodeId: args.pausedAtNodeId,
      resumeAt: args.resumeAt,
    },
    select: { id: true },
  });
  return { delayedNodeId: row.id };
}

/**
 * Cancel every pending delayed node for the given run. Idempotent — the
 * WHERE clause filters out already-resumed and already-cancelled rows so
 * re-runs are no-ops.
 *
 * Used by the future "cancel a run" admin flow (Phase F). PR 4 exports
 * this helper without a caller; PR-F code drops its own one-line invocation
 * inside the cancel transaction.
 */
export async function cancelDelayedNodesForRun(
  client: ExtendedPrismaClient | ExtendedTransactionClient,
  args: { tenantId: string; runId: string },
): Promise<{ cancelled: number }> {
  const result = await client.automationDelayedNode.updateMany({
    where: {
      tenantId: args.tenantId,
      runId: args.runId,
      resumedAt: null,
      cancelledAt: null,
    },
    data: { cancelledAt: new Date() },
  });
  return { cancelled: result.count };
}
