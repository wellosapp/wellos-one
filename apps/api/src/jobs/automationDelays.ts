// Automation System Phase A PR 4 — delay queue cron processor.
//
// Pure async function: no scheduler binding here. The admin trigger route
// (routes/admin/jobs.ts) exposes this as POST /admin/jobs/automations/cron
// so a real scheduler (Railway cron / GitHub Actions schedule / BullMQ) can
// hit it in Epic 8. Until then admins can hit it manually for smoke-testing.
//
// Mirrors the Forms PR 11 pattern (jobs/formReminders.ts) — find due rows,
// atomic-claim per row via updateMany, do the work, log + count.
//
// What we do per due row:
//   1. Atomic claim via updateMany(WHERE id AND resumed_at IS NULL AND
//      cancelled_at IS NULL → SET resumed_at=NOW). count===0 means another
//      runner won the race; skip.
//   2. Pre-check the AutomationRun status. If it's already terminal
//      (succeeded/failed/cancelled), DON'T fire engine.resumeRun. Roll the
//      row to cancelled_at=NOW (we never actually resumed) and increment
//      skippedCancelled. The distinction between resumed_at and cancelled_at
//      matters for the audit trail — resumed_at means "we called resumeRun";
//      cancelled_at means "this delay never executed."
//   3. Call engine.resumeRun. Result kinds:
//      - 'completed' — run finished (succeeded or failed). Done.
//      - 'delayed' — workflow had another delay node. persistDelayedNode
//        inserts a new row; next cron tick picks it up. We do NOT loop
//        within a single tick.
//   4. Per-row failures (DB errors, engine exceptions) caught + logged;
//      increment failed counter; continue the batch. processDelayedNodes
//      itself only throws if something catastrophic escapes the row loop
//      (e.g. the outer findMany blows up).

import type { FastifyBaseLogger } from 'fastify';

import type { ExtendedPrismaClient } from '../db/client.js';
import { resumeRun } from '../services/automationEngineService.js';
import { persistDelayedNode } from '../services/automationDelayedNodeService.js';

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export interface ProcessDelayedNodesResult {
  /** Rows we touched (claim + branch decided), regardless of outcome. */
  processed: number;
  /** Resume calls that completed the run (succeeded/failed terminal). */
  resumed: number;
  /** Resume calls that returned another 'delayed' — newly persisted. */
  reDelayed: number;
  /** Resume calls or pre-checks that errored — caught + logged. */
  failed: number;
  /** Rows skipped because the parent run was already terminal. */
  skippedCancelled: number;
}

/**
 * Find AutomationDelayedNode rows with resume_at <= NOW and not yet
 * resumed/cancelled. Atomic-claim per row, then call engine.resumeRun.
 * Re-persist new delay sentinels for multi-step workflows.
 *
 * Best-effort — per-row failures caught + logged, don't halt the batch.
 * Returns counts for observability.
 */
export async function processDelayedNodes(
  prisma: ExtendedPrismaClient,
  args?: { log?: FastifyBaseLogger; batchSize?: number },
): Promise<ProcessDelayedNodesResult> {
  const log = args?.log;
  const batchSize = args?.batchSize ?? 100;
  const now = new Date();

  const due = await prisma.automationDelayedNode.findMany({
    where: {
      resumeAt: { lte: now },
      resumedAt: null,
      cancelledAt: null,
    },
    take: batchSize,
    orderBy: { resumeAt: 'asc' },
  });

  let processed = 0;
  let resumed = 0;
  let reDelayed = 0;
  let failed = 0;
  let skippedCancelled = 0;

  for (const row of due) {
    try {
      // Pre-check parent run status. If terminal, we never fire resumeRun;
      // the delayed-node row is marked cancelled (not resumed) so the audit
      // trail is honest about whether engine code ran.
      const run = await prisma.automationRun.findUnique({
        where: { id: row.runId },
        select: { id: true, tenantId: true, status: true },
      });

      if (!run || TERMINAL_RUN_STATUSES.has(run.status)) {
        const claimed = await prisma.automationDelayedNode.updateMany({
          where: {
            id: row.id,
            resumedAt: null,
            cancelledAt: null,
          },
          data: { cancelledAt: new Date() },
        });
        if (claimed.count > 0) {
          processed += 1;
          skippedCancelled += 1;
          log?.info(
            {
              delayedNodeId: row.id,
              runId: row.runId,
              tenantId: row.tenantId,
              runStatus: run?.status ?? 'missing',
            },
            'automation delay cron: run already terminal — skipping resume',
          );
        }
        continue;
      }

      // Atomic claim — only proceed if we won the race against another runner.
      const claimed = await prisma.automationDelayedNode.updateMany({
        where: {
          id: row.id,
          resumedAt: null,
          cancelledAt: null,
        },
        data: { resumedAt: new Date() },
      });
      if (claimed.count === 0) {
        continue;
      }

      processed += 1;

      // Fire the engine. resumeRun handles its own status persistence (incl.
      // markRunFailed on engine exceptions); our try/catch is defense against
      // anything escaping that.
      const result = await resumeRun({
        prisma,
        log: log ?? (console as unknown as FastifyBaseLogger),
        runId: row.runId,
        resumeAfterNodeId: row.pausedAtNodeId,
      });

      if (result.kind === 'delayed') {
        await persistDelayedNode(prisma, {
          tenantId: row.tenantId,
          runId: row.runId,
          pausedAtNodeId: result.pausedAtNodeId,
          resumeAt: result.resumeAt,
        });
        reDelayed += 1;
        log?.info(
          {
            delayedNodeId: row.id,
            runId: row.runId,
            tenantId: row.tenantId,
            nextPausedAtNodeId: result.pausedAtNodeId,
            nextResumeAt: result.resumeAt.toISOString(),
          },
          'automation delay cron: run paused again at next delay node',
        );
      } else {
        resumed += 1;
        log?.info(
          {
            delayedNodeId: row.id,
            runId: row.runId,
            tenantId: row.tenantId,
            terminalStatus: result.status,
            reason: result.reason ?? null,
          },
          'automation delay cron: run resumed to terminal',
        );
      }
    } catch (err) {
      failed += 1;
      log?.error(
        {
          err: err instanceof Error ? err.message : String(err),
          delayedNodeId: row.id,
          runId: row.runId,
          tenantId: row.tenantId,
        },
        'automation delay cron: per-row failure — continuing batch',
      );
    }
  }

  return { processed, resumed, reDelayed, failed, skippedCancelled };
}
