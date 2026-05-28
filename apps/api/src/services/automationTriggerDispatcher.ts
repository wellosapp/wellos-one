// Automation trigger dispatcher — subscribes to the in-process automation
// event bus, finds active workflows matching each event's trigger_type,
// builds rich context, creates AutomationRun rows, kicks off engine.startRun.
//
// PR 3 of the Automation System epic. See docs/specs/automation-system-epic.md.
//
// Architectural decisions:
//   - SINGLE subscriber mounted once at app boot. The bus is in-process;
//     internally we branch on event.type via the enricher.
//   - Per-event we find ALL active workflows for (tenantId, trigger_type)
//     and loop. Each workflow gets its own AutomationRun. Per-workflow
//     failures are caught + logged but never propagate — one bad workflow
//     must not halt the others (or the publisher's flow).
//   - Idempotency: dedupe by (tenantId, workflowId, event.eventId). The
//     check reads automation_runs.context_json->'event'->>'eventId'. No
//     functional index in PR 3 — the runs table is small + the dispatcher
//     path runs O(active workflows) per event (small N). Revisit if metrics
//     show pressure.
//   - Engine kickoff is awaited (so the synchronous portion of the run
//     completes — until the first delay sentinel — before we move on),
//     but the bus's publish() already uses Promise.allSettled per
//     handler so the publisher itself doesn't block.
//   - No retry at this layer. If startRun throws OR returns failed, we
//     log + move on. The engine + Phase F own retry.
//   - Trigger pre-filter (optional ConditionGroup on the trigger node) is
//     evaluated against the ENRICHED context so rules can reference
//     'client.tags' etc. Falsy → skip without creating a run.

import type { FastifyBaseLogger } from 'fastify';

import type { ExtendedPrismaClient } from '../db/client.js';
import { evaluateConditionGroup } from '../lib/automationConditionEval.js';
import {
  automationEventBus,
  type AutomationEvent,
} from '../lib/automationEventBus.js';
import {
  parseWorkflowJson,
  type TriggerNodeData,
  type WorkflowJson,
  type WorkflowNode,
} from '../lib/automationWorkflowTypes.js';
import { enrichEventContext } from './automationContextEnricher.js';
import { persistDelayedNode } from './automationDelayedNodeService.js';
import { startRun } from './automationEngineService.js';

// ----- Public API -----

interface DispatcherConfig {
  prisma: ExtendedPrismaClient;
  log: FastifyBaseLogger;
}

export interface DispatchCounts {
  workflowsMatched: number;
  runsCreated: number;
  runsSkippedAsDuplicate: number;
}

/**
 * Mounts the trigger dispatcher onto the global automationEventBus. Call
 * once at app boot. Returns an unsubscribe function — useful for tests
 * and graceful shutdown.
 */
export function mountAutomationTriggerDispatcher(
  config: DispatcherConfig,
): () => void {
  // Wire the bus's logger so PR 1's per-handler failure path uses Pino.
  automationEventBus.setLogger(config.log);

  const unsubscribe = automationEventBus.subscribe(async (event) => {
    try {
      const counts = await handleAutomationEvent(config, event);
      if (counts.workflowsMatched > 0) {
        config.log.info(
          {
            eventType: event.type,
            eventId: event.eventId,
            tenantId: event.tenantId,
            ...counts,
          },
          'Automation trigger dispatched',
        );
      }
    } catch (err) {
      // Defense-in-depth — handleAutomationEvent already catches per-workflow,
      // but anything that escapes (top-level workflow lookup throwing, etc.)
      // lands here so it doesn't propagate back to the publisher.
      config.log.error(
        {
          err,
          eventType: event.type,
          eventId: event.eventId,
          tenantId: event.tenantId,
        },
        'Automation trigger dispatcher crashed',
      );
    }
  });

  config.log.info(
    { subscriberCount: automationEventBus.subscriberCount },
    'Automation trigger dispatcher mounted',
  );

  return unsubscribe;
}

// ----- Per-event handler (exported for testing) -----

/**
 * The per-event branch. Find matching workflows → for each: pre-filter,
 * idempotency check, context enrichment, AutomationRun insert, engine kickoff.
 *
 * Best-effort across the workflow loop — per-workflow failures are caught,
 * logged, and incremented as runsCreated=0. The function ONLY throws if the
 * outer workflow lookup itself fails (e.g. DB unreachable), in which case
 * the mount-level catch handles it.
 */
export async function handleAutomationEvent(
  config: DispatcherConfig,
  event: AutomationEvent,
): Promise<DispatchCounts> {
  const { prisma, log } = config;

  // Hot path: (tenant_id, trigger_type, status) covering index from PR 1.
  const workflows = await prisma.automationWorkflow.findMany({
    where: {
      tenantId: event.tenantId,
      triggerType: event.type,
      status: 'active',
    },
  });

  let runsCreated = 0;
  let runsSkippedAsDuplicate = 0;

  for (const workflow of workflows) {
    try {
      // 1. Parse workflow JSON. Bad JSON → skip this workflow (an admin will
      //    see status='error' in PR 5's UI once schema validation lands).
      let parsed: WorkflowJson;
      try {
        parsed = parseWorkflowJson(workflow.workflowJson);
      } catch (parseErr) {
        log.warn(
          {
            err: parseErr,
            workflowId: workflow.id,
            tenantId: event.tenantId,
            eventType: event.type,
          },
          'Automation dispatcher: workflow_json invalid — skipping',
        );
        continue;
      }

      // 2. Find the trigger node so we can read its optional pre-filter.
      const triggerNode = findTriggerNode(parsed);
      if (!triggerNode) {
        log.warn(
          { workflowId: workflow.id, tenantId: event.tenantId },
          'Automation dispatcher: trigger node missing — skipping',
        );
        continue;
      }

      const triggerData = (triggerNode.data ?? {}) as Partial<TriggerNodeData>;

      // 3. Idempotency check BEFORE enrichment (cheap query first).
      //    Postgres JSONB path: context_json->'event'->>'eventId' = event.eventId.
      //    Uses Prisma's typed JSON filter for safety.
      const duplicate = await prisma.automationRun.findFirst({
        where: {
          tenantId: event.tenantId,
          workflowId: workflow.id,
          contextJson: {
            path: ['event', 'eventId'],
            equals: event.eventId,
          },
        },
        select: { id: true },
      });
      if (duplicate) {
        runsSkippedAsDuplicate += 1;
        log.info(
          {
            workflowId: workflow.id,
            existingRunId: duplicate.id,
            eventId: event.eventId,
            tenantId: event.tenantId,
          },
          'Automation dispatcher: duplicate event — skipping',
        );
        continue;
      }

      // 4. Enrich context. Best-effort — enrichEventContext catches its own
      //    missing-FK cases and returns nulls; we don't re-wrap in try here
      //    because enricher is already defensive (and we want a top-level
      //    failure to surface as the workflow-level error log below).
      let enrichedContext: Record<string, unknown>;
      try {
        enrichedContext = await enrichEventContext(prisma, event, workflow);
      } catch (enrichErr) {
        log.error(
          {
            err: enrichErr,
            workflowId: workflow.id,
            tenantId: event.tenantId,
            eventType: event.type,
          },
          'Automation dispatcher: context enrichment failed — skipping workflow',
        );
        continue;
      }

      // 5. Optional trigger pre-filter. Evaluated against the ENRICHED context
      //    so rules can reference 'client.tags', 'appointment.serviceId', etc.
      if (triggerData.filter) {
        const passed = evaluateConditionGroup(
          triggerData.filter,
          enrichedContext,
          log,
        );
        if (!passed) {
          log.info(
            {
              workflowId: workflow.id,
              eventId: event.eventId,
              tenantId: event.tenantId,
            },
            'Automation dispatcher: trigger pre-filter failed — skipping',
          );
          continue;
        }
      }

      // 6. Create the AutomationRun row in pending. The engine will flip to
      //    running on entry.
      const run = await prisma.automationRun.create({
        data: {
          tenantId: event.tenantId,
          workflowId: workflow.id,
          triggerEvent: event.type,
          contextJson: enrichedContext as never,
          status: 'pending',
        },
        select: { id: true },
      });

      runsCreated += 1;

      // 7. Kick off the engine. Await so the synchronous portion of the run
      //    completes before we move to the next workflow. Engine errors are
      //    swallowed at this layer — engine already persists 'failed' status.
      //
      //    If the engine returns 'delayed', persist a row in
      //    automation_delayed_nodes so PR 4's cron resumer can pick it up.
      try {
        const result = await startRun({
          prisma,
          log,
          runId: run.id,
        });

        if (result.kind === 'delayed') {
          await persistDelayedNode(prisma, {
            tenantId: event.tenantId,
            runId: run.id,
            pausedAtNodeId: result.pausedAtNodeId,
            resumeAt: result.resumeAt,
          });
          log.info(
            {
              runId: run.id,
              workflowId: workflow.id,
              tenantId: event.tenantId,
              resumeAt: result.resumeAt.toISOString(),
              pausedAtNodeId: result.pausedAtNodeId,
            },
            'Automation dispatcher: run paused on delay node',
          );
        } else if (result.status === 'failed') {
          log.warn(
            {
              runId: run.id,
              workflowId: workflow.id,
              tenantId: event.tenantId,
              reason: result.reason ?? null,
            },
            'Automation dispatcher: run completed with status=failed',
          );
        }
      } catch (engineErr) {
        // Engine threw OUTSIDE its own failure persistence path (e.g.
        // a max-iterations throw). The engine already wrote markRunFailed
        // before re-throwing in that case, so we just log here.
        log.error(
          {
            err: engineErr,
            runId: run.id,
            workflowId: workflow.id,
            tenantId: event.tenantId,
          },
          'Automation dispatcher: engine threw — continuing to next workflow',
        );
      }
    } catch (workflowErr) {
      // Catch-all for the per-workflow loop body. Keeps us moving to the
      // next workflow rather than aborting the whole event.
      log.error(
        {
          err: workflowErr,
          workflowId: workflow.id,
          tenantId: event.tenantId,
          eventType: event.type,
        },
        'Automation dispatcher: workflow processing failed — continuing',
      );
    }
  }

  return {
    workflowsMatched: workflows.length,
    runsCreated,
    runsSkippedAsDuplicate,
  };
}

// ----- Helpers -----

function findTriggerNode(workflow: WorkflowJson): WorkflowNode | null {
  // Primary lookup: by the workflow's declared triggerNodeId. Fall back to
  // first node with type='trigger' if the id reference is stale — defense
  // against an admin re-uploading workflow_json with a different trigger id.
  const byId = workflow.nodes.find((n) => n.id === workflow.triggerNodeId);
  if (byId && byId.type === 'trigger') return byId;
  return workflow.nodes.find((n) => n.type === 'trigger') ?? null;
}
