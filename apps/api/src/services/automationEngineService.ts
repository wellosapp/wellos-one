// Automation workflow engine.
//
// PR 2 of the Automation System epic. Walks a workflow_json graph starting
// from its triggerNodeId, dispatches each node, persists AutomationNodeRun
// rows as it goes, and returns either a terminal status or a delay sentinel
// the caller can re-enqueue.
//
// Layered above:
//   - `automationEventBus.ts` (PR 1) — feeds events upstream
//   - `automationWorkflowTypes.ts` (this PR) — workflow_json shape + Zod
//   - `automationConditionEval.ts` (this PR) — boolean expression eval
//   - `automationActionRegistry.ts` (this PR) — action handler dispatch
//
// Layered below (consumes this service):
//   - PR 3: trigger dispatcher (creates AutomationRun, calls startRun)
//   - PR 4: delay queue (calls resumeRun after the delay window)
//   - PR 10: dry-run test mode (passes dryRun: true)
//
// Architectural notes:
//   - Single-node-step at a time. The driver loop in startRun walks the
//     graph; executeNode handles one node. This decouples engine state from
//     queue infrastructure — PR 4's delay queue picks up where a delay
//     sentinel left off without the engine knowing about queues at all.
//   - No retry in PR 2. Action throws → run fails. PR 20 wires retry.
//   - No throttling / loop prevention in PR 2 except a max-iterations
//     safety net (default 100). Phase F (PR 19) ships real loop prevention.
//   - No transaction across the full run. Each node's status update is its
//     own write so the run-history viewer (PR 5) sees progress incrementally.
//     Action handlers manage their own atomicity per Phase D.
//   - Multi-walker fan-out (branch nodes evaluating multiple branches) is
//     punted to Phase F. PR 2 follows the FIRST matching branch and logs a
//     warning if more than one would have matched.

import { Prisma } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import type { ExtendedPrismaClient } from '../db/client.js';
import {
  automationActionRegistry,
  type ActionExecutionContext,
} from '../lib/automationActionRegistry.js';
import {
  evaluateConditionGroup,
} from '../lib/automationConditionEval.js';
import {
  parseWorkflowJson,
  type ActionNodeData,
  type AiNodeData,
  type BranchNodeData,
  type ConditionGroup,
  type ConditionNodeData,
  type DelayNodeData,
  type FilterNodeData,
  type WebhookNodeData,
  type WorkflowJson,
  type WorkflowNode,
} from '../lib/automationWorkflowTypes.js';

// ----- Tunables -----

/**
 * Cap on total nodes a single run can walk before we declare it a loop and
 * abort. Real workflows top out around 20-30 nodes; 100 is generous and
 * catches malformed graphs that cycle. Phase F (PR 19) can raise or replace
 * this with cycle detection on the edge list.
 */
const MAX_ITERATIONS = 100;

// ----- Errors -----

export class WorkflowJsonInvalidError extends Error {
  code = 'WORKFLOW_JSON_INVALID' as const;
  constructor(reason: string) {
    super(`Workflow JSON invalid: ${reason}`);
    this.name = 'WorkflowJsonInvalidError';
  }
}

export class WorkflowRunNotFoundError extends Error {
  code = 'WORKFLOW_RUN_NOT_FOUND' as const;
  constructor(runId: string) {
    super(`AutomationRun ${runId} not found`);
    this.name = 'WorkflowRunNotFoundError';
  }
}

export class WorkflowMaxIterationsError extends Error {
  code = 'WORKFLOW_MAX_ITERATIONS_EXCEEDED' as const;
  iterations: number;
  constructor(iterations: number) {
    super(`Workflow exceeded ${iterations} node iterations — likely a loop`);
    this.name = 'WorkflowMaxIterationsError';
    this.iterations = iterations;
  }
}

// ----- Public surface -----

export interface StartRunArgs {
  prisma: ExtendedPrismaClient;
  log: FastifyBaseLogger;
  runId: string;
  /**
   * When true, action handlers are SKIPPED — the node-run row is written
   * with status='skipped' and `{ reason: 'dry_run' }` output. Engine
   * internals (conditions / branches / filters / delays) still execute so
   * the path matches what production would do. PR 10's test surface
   * passes true.
   */
  dryRun?: boolean;
}

export interface ResumeRunArgs extends StartRunArgs {
  /**
   * The node id we paused AT (the delay node). The engine resumes from the
   * node that delay points to next.
   */
  resumeAfterNodeId: string;
}

export type StartRunResult =
  | {
      kind: 'completed';
      status: 'succeeded' | 'failed' | 'cancelled';
      reason?: string;
    }
  | {
      kind: 'delayed';
      resumeAt: Date;
      pausedAtNodeId: string;
    };

/**
 * Engine-internal next-node descriptor. Exported because executeNode is
 * exported for unit testing.
 */
export type NextNode =
  | { kind: 'next'; nodeId: string }
  | { kind: 'branch'; nodeIds: string[] } // multi-walker hook — Phase F honors all; PR 2 takes [0]
  | {
      kind: 'end';
      reason: 'completed' | 'filtered' | 'failed';
      errorMessage?: string;
    }
  | { kind: 'delayed'; resumeAt: Date };

// ----- startRun -----

/**
 * Starts a workflow run from its trigger node. The CALLER (PR 3's dispatcher)
 * is responsible for creating the AutomationRun row first — this function
 * looks it up, flips to running, walks the graph, and writes a terminal
 * status (or returns a delay sentinel).
 *
 * Idempotent at the run-status level: if the run is already terminal, we
 * return a no-op `completed` result with the existing status. If it's
 * already `running`, we proceed (a previous call crashed mid-walk; we
 * don't try to detect that here — Phase F may add a heartbeat).
 */
export async function startRun(args: StartRunArgs): Promise<StartRunResult> {
  return executeRunFromNode({
    ...args,
    startAfterNodeId: null, // null = start from the trigger
  });
}

/**
 * Resumes a paused (delayed) run after the delay window. PR 4's delay queue
 * calls this. Engine semantics are identical to startRun, except the walk
 * picks up from the node FOLLOWING `resumeAfterNodeId` rather than the
 * trigger.
 */
export async function resumeRun(args: ResumeRunArgs): Promise<StartRunResult> {
  return executeRunFromNode({
    ...args,
    startAfterNodeId: args.resumeAfterNodeId,
  });
}

// ----- Shared driver -----

interface ExecuteRunArgs extends StartRunArgs {
  /** When null, walk from the trigger. When set, walk from the node AFTER this. */
  startAfterNodeId: string | null;
}

async function executeRunFromNode(
  args: ExecuteRunArgs,
): Promise<StartRunResult> {
  const { prisma, log, runId } = args;
  const dryRun = args.dryRun === true;

  // Load the run row + the workflow definition.
  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    include: { workflow: true },
  });
  if (!run) {
    throw new WorkflowRunNotFoundError(runId);
  }

  // Idempotency: if the run is already terminal, return its existing status
  // as a no-op rather than re-running. Same approach as the booking state
  // machine — terminal rows are immutable once reached.
  if (
    run.status === 'succeeded' ||
    run.status === 'failed' ||
    run.status === 'cancelled'
  ) {
    log.warn(
      { runId, status: run.status },
      'automation engine: startRun called on terminal run — no-op',
    );
    return {
      kind: 'completed',
      status: run.status,
      reason: 'already_terminal',
    };
  }

  // Flip to running + stamp startedAt if this is the first call. Re-entry
  // (resume after delay) leaves startedAt where it was.
  await prisma.automationRun.update({
    where: { id: runId },
    data: {
      status: 'running',
      startedAt: run.startedAt ?? new Date(),
    },
  });

  // Parse the workflow JSON. Failure here marks the run failed + writes a
  // synthetic node-run for visibility in the audit viewer (PR 5).
  let workflow: WorkflowJson;
  try {
    workflow = parseWorkflowJson(run.workflow.workflowJson);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'parse failed';
    log.error(
      { err, runId, workflowId: run.workflowId },
      'automation engine: workflow_json invalid',
    );
    await markRunFailed(prisma, runId, 'invalid_workflow_json');
    return {
      kind: 'completed',
      status: 'failed',
      reason: `invalid_workflow_json: ${reason}`,
    };
  }

  // Build the run context. PR 3's dispatcher writes a typed payload into
  // context_json (trigger event + resolved entities). The engine treats this
  // as opaque-but-record-like: condition eval uses dotted-path resolution.
  const runContext = coerceRunContext(run.contextJson);

  // Determine the entry point.
  //   - startAfterNodeId === null  → walk from the first node after the trigger
  //   - startAfterNodeId set       → walk from the first node after that one
  //     (used by resumeRun: the delay node is the pause point, we want what
  //     comes next).
  const entryNodeId = args.startAfterNodeId === null
    ? findFirstNodeAfter(workflow, workflow.triggerNodeId, undefined, log)
    : findFirstNodeAfter(workflow, args.startAfterNodeId, undefined, log);

  if (!entryNodeId) {
    // No outgoing edge from the trigger (or resume point) → empty workflow.
    // That's a valid terminal state — the trigger fired but nothing to do.
    log.info(
      { runId, workflowId: run.workflowId, from: args.startAfterNodeId ?? workflow.triggerNodeId },
      'automation engine: no outgoing edges, completing immediately',
    );
    await markRunSucceeded(prisma, runId);
    return { kind: 'completed', status: 'succeeded', reason: 'no_outgoing_edges' };
  }

  // Walk the graph one node at a time.
  let currentNodeId: string | null = entryNodeId;
  let iterations = 0;

  while (currentNodeId !== null) {
    iterations += 1;
    if (iterations > MAX_ITERATIONS) {
      const err = new WorkflowMaxIterationsError(iterations);
      log.error(
        { runId, iterations, workflowId: run.workflowId },
        'automation engine: max-iterations safety net tripped',
      );
      await markRunFailed(prisma, runId, err.message);
      throw err;
    }

    const node = workflow.nodes.find((n) => n.id === currentNodeId);
    if (!node) {
      // Edge points at a missing node — defensive. Treat as failure.
      log.error(
        { runId, nodeId: currentNodeId, workflowId: run.workflowId },
        'automation engine: edge target node missing',
      );
      await markRunFailed(
        prisma,
        runId,
        `node_not_found: ${currentNodeId}`,
      );
      return {
        kind: 'completed',
        status: 'failed',
        reason: `node_not_found: ${currentNodeId}`,
      };
    }

    let result: NextNode;
    try {
      result = await executeNode({
        prisma,
        log,
        runId,
        workflow,
        runContext,
        nodeId: node.id,
        dryRun,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'engine error';
      log.error(
        { err, runId, nodeId: node.id, workflowId: run.workflowId },
        'automation engine: executeNode threw — marking run failed',
      );
      await markRunFailed(prisma, runId, reason);
      return { kind: 'completed', status: 'failed', reason };
    }

    if (result.kind === 'next') {
      currentNodeId = result.nodeId;
      continue;
    }

    if (result.kind === 'branch') {
      // Multi-walker fan-out is Phase F. PR 2 follows the first matching
      // branch. If more than one would match, executeNode already logged
      // a warning at that point.
      const first = result.nodeIds[0];
      if (first === undefined) {
        // No matching branch + no default → terminate.
        await markRunSucceeded(prisma, runId);
        return {
          kind: 'completed',
          status: 'succeeded',
          reason: 'no_matching_branch',
        };
      }
      currentNodeId = first;
      continue;
    }

    if (result.kind === 'delayed') {
      // Don't mark the run terminal. Caller (PR 4) persists the resume state.
      // Leave status='running' so the run-history viewer (PR 5) shows it
      // visibly in-flight. // TODO(PR 4): consider a 'paused' status if
      // the UI needs to distinguish in-flight vs delay-pending.
      log.info(
        { runId, nodeId: node.id, resumeAt: result.resumeAt.toISOString() },
        'automation engine: paused on delay node',
      );
      return {
        kind: 'delayed',
        resumeAt: result.resumeAt,
        pausedAtNodeId: node.id,
      };
    }

    // result.kind === 'end'
    if (result.reason === 'failed') {
      await markRunFailed(prisma, runId, result.errorMessage ?? 'node failed');
      return {
        kind: 'completed',
        status: 'failed',
        reason: result.errorMessage ?? 'node_failed',
      };
    }
    // 'completed' or 'filtered' both terminate as succeeded — filtering is
    // a valid terminal state per spec.
    await markRunSucceeded(prisma, runId);
    return {
      kind: 'completed',
      status: 'succeeded',
      reason: result.reason,
    };
  }

  // Shouldn't reach here — loop exits via result.kind === 'end' or 'delayed'.
  // Defense: mark succeeded.
  await markRunSucceeded(prisma, runId);
  return { kind: 'completed', status: 'succeeded' };
}

// ----- executeNode -----

export interface ExecuteNodeArgs {
  prisma: ExtendedPrismaClient;
  log: FastifyBaseLogger;
  runId: string;
  workflow: WorkflowJson;
  runContext: Record<string, unknown>;
  nodeId: string;
  dryRun: boolean;
}

/**
 * Executes ONE node. Writes its AutomationNodeRun row (regardless of
 * outcome). Returns the next-node descriptor for the driver to act on.
 *
 * Exported for unit testing — production code goes through startRun /
 * resumeRun.
 */
export async function executeNode(args: ExecuteNodeArgs): Promise<NextNode> {
  const { prisma, log, runId, workflow, runContext, nodeId, dryRun } = args;
  const node = workflow.nodes.find((n) => n.id === nodeId);
  if (!node) {
    return {
      kind: 'end',
      reason: 'failed',
      errorMessage: `node_not_found: ${nodeId}`,
    };
  }

  const startedAt = new Date();

  switch (node.type) {
    case 'trigger': {
      // Defense-in-depth: shouldn't be hit during normal execution because
      // the driver starts AFTER the trigger. If somehow called (e.g. a
      // workflow points an edge back at the trigger), treat as a pass-
      // through to the trigger's first outgoing edge.
      log.warn(
        { runId, nodeId },
        'automation engine: trigger node executed mid-walk — passing through',
      );
      await writeNodeRun(prisma, {
        runId,
        nodeId,
        nodeType: 'trigger',
        status: 'succeeded',
        startedAt,
        completedAt: new Date(),
        outputJson: { reason: 'trigger_passthrough' },
      });
      const next = findFirstNodeAfter(workflow, nodeId, undefined, log);
      if (!next) return { kind: 'end', reason: 'completed' };
      return { kind: 'next', nodeId: next };
    }

    case 'action':
      return executeActionNode({
        prisma,
        log,
        runId,
        workflow,
        runContext,
        node,
        dryRun,
        startedAt,
      });

    case 'condition':
      return executeConditionNode({
        prisma,
        log,
        runId,
        workflow,
        runContext,
        node,
        startedAt,
      });

    case 'branch':
      return executeBranchNode({
        prisma,
        log,
        runId,
        workflow,
        runContext,
        node,
        startedAt,
      });

    case 'filter':
      return executeFilterNode({
        prisma,
        log,
        runId,
        workflow,
        runContext,
        node,
        startedAt,
      });

    case 'delay':
      return executeDelayNode({
        prisma,
        log,
        runId,
        runContext,
        node,
        startedAt,
      });

    case 'webhook':
      // Treat like an action node — register a 'webhook' handler in PR 16.
      // Until then it falls through the "no handler registered" path.
      return executeWebhookNode({
        prisma,
        log,
        runId,
        workflow,
        runContext,
        node,
        dryRun,
        startedAt,
      });

    case 'ai':
      return executeAiNode({ prisma, log, runId, workflow, node, startedAt });

    default: {
      // Unknown node type — write a skipped row + try to continue.
      const unknownType: string = node.type;
      log.warn(
        { runId, nodeId, nodeType: unknownType },
        'automation engine: unknown node type, marking skipped',
      );
      await writeNodeRun(prisma, {
        runId,
        nodeId,
        nodeType: unknownType,
        status: 'skipped',
        startedAt,
        completedAt: new Date(),
        outputJson: { reason: 'unknown_node_type', nodeType: unknownType },
      });
      const next = findFirstNodeAfter(workflow, nodeId, undefined, log);
      if (!next) return { kind: 'end', reason: 'completed' };
      return { kind: 'next', nodeId: next };
    }
  }
}

// ----- Node-type dispatchers -----

interface NodeDispatchBase {
  prisma: ExtendedPrismaClient;
  log: FastifyBaseLogger;
  runId: string;
  workflow: WorkflowJson;
  node: WorkflowNode;
  startedAt: Date;
}

async function executeActionNode(
  args: NodeDispatchBase & {
    runContext: Record<string, unknown>;
    dryRun: boolean;
  },
): Promise<NextNode> {
  const { prisma, log, runId, workflow, runContext, node, dryRun, startedAt } = args;
  const data = node.data as ActionNodeData;
  const actionType = typeof data?.actionType === 'string' ? data.actionType : '';
  const config: Record<string, unknown> =
    data?.config && typeof data.config === 'object' ? data.config : {};

  if (!actionType) {
    await writeNodeRun(prisma, {
      runId,
      nodeId: node.id,
      nodeType: 'action',
      status: 'failed',
      startedAt,
      completedAt: new Date(),
      errorMessage: 'action_type_missing',
    });
    return {
      kind: 'end',
      reason: 'failed',
      errorMessage: `action_type_missing on node ${node.id}`,
    };
  }

  // Dry-run mode skips the handler entirely — records the path but no side
  // effects. PR 10 test viewer consumes this.
  if (dryRun) {
    await writeNodeRun(prisma, {
      runId,
      nodeId: node.id,
      nodeType: 'action',
      status: 'skipped',
      startedAt,
      completedAt: new Date(),
      outputJson: { reason: 'dry_run', actionType },
    });
    const next = findFirstNodeAfter(workflow, node.id, undefined, log);
    if (!next) return { kind: 'end', reason: 'completed' };
    return { kind: 'next', nodeId: next };
  }

  const handler = automationActionRegistry.get(actionType);
  if (!handler) {
    // Forward-compat — PR 2 ships the registry empty. Action nodes write
    // `skipped` with reason='handler_not_registered' until Phase D PRs
    // register real handlers.
    log.info(
      { runId, nodeId: node.id, actionType },
      'automation engine: no handler registered for action — skipping',
    );
    await writeNodeRun(prisma, {
      runId,
      nodeId: node.id,
      nodeType: 'action',
      status: 'skipped',
      startedAt,
      completedAt: new Date(),
      outputJson: { reason: 'handler_not_registered', actionType },
    });
    const next = findFirstNodeAfter(workflow, node.id, undefined, log);
    if (!next) return { kind: 'end', reason: 'completed' };
    return { kind: 'next', nodeId: next };
  }

  // Load tenantId from the run for handler context.
  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    select: { tenantId: true },
  });
  if (!run) {
    return {
      kind: 'end',
      reason: 'failed',
      errorMessage: 'run_disappeared_mid_execution',
    };
  }

  const ctx: ActionExecutionContext = {
    prisma,
    log,
    runId,
    nodeId: node.id,
    tenantId: run.tenantId,
    runContext,
    dryRun,
  };

  try {
    const result = await handler(ctx, config);
    await writeNodeRun(prisma, {
      runId,
      nodeId: node.id,
      nodeType: 'action',
      status: 'succeeded',
      startedAt,
      completedAt: new Date(),
      outputJson: result.output,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error(
      { err, runId, nodeId: node.id, actionType },
      'automation engine: action handler threw',
    );
    await writeNodeRun(prisma, {
      runId,
      nodeId: node.id,
      nodeType: 'action',
      status: 'failed',
      startedAt,
      completedAt: new Date(),
      errorMessage,
    });
    return { kind: 'end', reason: 'failed', errorMessage };
  }

  const next = findFirstNodeAfter(workflow, node.id, undefined, log);
  if (!next) return { kind: 'end', reason: 'completed' };
  return { kind: 'next', nodeId: next };
}

async function executeConditionNode(
  args: NodeDispatchBase & { runContext: Record<string, unknown> },
): Promise<NextNode> {
  const { prisma, log, runId, workflow, runContext, node, startedAt } = args;
  const data = node.data as ConditionNodeData;
  const group: ConditionGroup | undefined = data?.condition;
  if (!group) {
    await writeNodeRun(prisma, {
      runId,
      nodeId: node.id,
      nodeType: 'condition',
      status: 'failed',
      startedAt,
      completedAt: new Date(),
      errorMessage: 'condition_group_missing',
    });
    return {
      kind: 'end',
      reason: 'failed',
      errorMessage: `condition_group_missing on node ${node.id}`,
    };
  }

  const passed = evaluateConditionGroup(group, runContext, log);
  const branchHandle = passed ? 'true' : 'false';

  await writeNodeRun(prisma, {
    runId,
    nodeId: node.id,
    nodeType: 'condition',
    status: 'succeeded',
    startedAt,
    completedAt: new Date(),
    outputJson: { branch: branchHandle, passed },
  });

  // Look for the named handle; fall back to the first outgoing edge if the
  // workflow only defined one path (e.g. a "continue when true" condition).
  const next =
    findFirstNodeAfter(workflow, node.id, branchHandle, log) ??
    findFirstNodeAfter(workflow, node.id, undefined, log);
  if (!next) return { kind: 'end', reason: 'completed' };
  return { kind: 'next', nodeId: next };
}

async function executeBranchNode(
  args: NodeDispatchBase & { runContext: Record<string, unknown> },
): Promise<NextNode> {
  const { prisma, log, runId, workflow, runContext, node, startedAt } = args;
  const data = node.data as BranchNodeData;
  const branches = Array.isArray(data?.branches) ? data.branches : [];

  // Evaluate every branch (not just first-match) so we can WARN when the
  // workflow's logic relies on >1 matching path. PR 2 still only follows
  // the first match; Phase F may switch to multi-walker.
  const matched: Array<{ label: string }> = [];
  for (const branch of branches) {
    if (!branch || !branch.condition) continue;
    const ok = evaluateConditionGroup(branch.condition, runContext, log);
    if (ok) matched.push({ label: branch.label });
  }

  let chosenHandle: string | null = null;
  if (matched.length > 0) {
    const first = matched[0];
    if (first) chosenHandle = first.label;
    if (matched.length > 1) {
      log.warn(
        {
          runId,
          nodeId: node.id,
          matchedLabels: matched.map((m) => m.label),
        },
        'automation engine: branch had multiple matches — following first (multi-walker is Phase F)',
      );
    }
  } else if (data?.hasDefault) {
    chosenHandle = 'default';
  }

  await writeNodeRun(prisma, {
    runId,
    nodeId: node.id,
    nodeType: 'branch',
    status: 'succeeded',
    startedAt,
    completedAt: new Date(),
    outputJson: {
      matchedLabels: matched.map((m) => m.label),
      chosen: chosenHandle,
    },
  });

  if (chosenHandle === null) {
    return { kind: 'end', reason: 'completed' };
  }

  const next = findFirstNodeAfter(workflow, node.id, chosenHandle, log);
  if (!next) return { kind: 'end', reason: 'completed' };
  return { kind: 'next', nodeId: next };
}

async function executeFilterNode(
  args: NodeDispatchBase & { runContext: Record<string, unknown> },
): Promise<NextNode> {
  const { prisma, log, runId, workflow, runContext, node, startedAt } = args;
  const data = node.data as FilterNodeData;
  const group: ConditionGroup | undefined = data?.condition;

  if (!group) {
    await writeNodeRun(prisma, {
      runId,
      nodeId: node.id,
      nodeType: 'filter',
      status: 'failed',
      startedAt,
      completedAt: new Date(),
      errorMessage: 'filter_group_missing',
    });
    return {
      kind: 'end',
      reason: 'failed',
      errorMessage: `filter_group_missing on node ${node.id}`,
    };
  }

  const passed = evaluateConditionGroup(group, runContext, log);

  await writeNodeRun(prisma, {
    runId,
    nodeId: node.id,
    nodeType: 'filter',
    status: 'succeeded',
    startedAt,
    completedAt: new Date(),
    outputJson: { passed, filtered: !passed },
  });

  if (!passed) {
    log.info({ runId, nodeId: node.id }, 'automation engine: filtered out');
    return { kind: 'end', reason: 'filtered' };
  }

  const next = findFirstNodeAfter(workflow, node.id, undefined, log);
  if (!next) return { kind: 'end', reason: 'completed' };
  return { kind: 'next', nodeId: next };
}

async function executeDelayNode(args: {
  prisma: ExtendedPrismaClient;
  log: FastifyBaseLogger;
  runId: string;
  runContext: Record<string, unknown>;
  node: WorkflowNode;
  startedAt: Date;
}): Promise<NextNode> {
  const { prisma, log, runId, runContext, node, startedAt } = args;
  const data = node.data as DelayNodeData;
  const resumeAt = computeDelayResumeAt(data, runContext, new Date(), log);

  if (!resumeAt) {
    await writeNodeRun(prisma, {
      runId,
      nodeId: node.id,
      nodeType: 'delay',
      status: 'failed',
      startedAt,
      completedAt: new Date(),
      errorMessage: 'delay_compute_failed',
    });
    return {
      kind: 'end',
      reason: 'failed',
      errorMessage: `delay_compute_failed on node ${node.id}`,
    };
  }

  // Status='running' while paused — PR 4's queue persists the resume row,
  // PR 5's UI may show this distinctly. Don't write completedAt — the row
  // gets a follow-up row in PR 4 when the delay fires.
  await writeNodeRun(prisma, {
    runId,
    nodeId: node.id,
    nodeType: 'delay',
    status: 'running',
    startedAt,
    completedAt: null,
    outputJson: {
      resumeAt: resumeAt.toISOString(),
      kind: data?.kind ?? 'unknown',
    },
  });

  return { kind: 'delayed', resumeAt };
}

async function executeWebhookNode(
  args: NodeDispatchBase & {
    runContext: Record<string, unknown>;
    dryRun: boolean;
  },
): Promise<NextNode> {
  const { prisma, log, runId, workflow, runContext, node, dryRun, startedAt } = args;
  const data = node.data as WebhookNodeData;

  // PR 16 (Phase D) registers a real 'webhook' handler. Until then, treat
  // exactly like an action node — handler lookup + skipped path. The
  // registered handler will consume `data.targetUrl` / `payload` / `headers`
  // via the config-shaped pass below.
  const handler = automationActionRegistry.get('webhook');
  if (!handler || dryRun) {
    const reason = dryRun ? 'dry_run' : 'handler_not_registered';
    await writeNodeRun(prisma, {
      runId,
      nodeId: node.id,
      nodeType: 'webhook',
      status: 'skipped',
      startedAt,
      completedAt: new Date(),
      outputJson: { reason, targetUrl: data?.targetUrl ?? null },
    });
    const next = findFirstNodeAfter(workflow, node.id, undefined, log);
    if (!next) return { kind: 'end', reason: 'completed' };
    return { kind: 'next', nodeId: next };
  }

  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    select: { tenantId: true },
  });
  if (!run) {
    return {
      kind: 'end',
      reason: 'failed',
      errorMessage: 'run_disappeared_mid_execution',
    };
  }

  const ctx: ActionExecutionContext = {
    prisma,
    log,
    runId,
    nodeId: node.id,
    tenantId: run.tenantId,
    runContext,
    dryRun,
  };

  try {
    const result = await handler(ctx, {
      targetUrl: data?.targetUrl,
      payload: data?.payload,
      headers: data?.headers,
    });
    await writeNodeRun(prisma, {
      runId,
      nodeId: node.id,
      nodeType: 'webhook',
      status: 'succeeded',
      startedAt,
      completedAt: new Date(),
      outputJson: result.output,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error(
      { err, runId, nodeId: node.id },
      'automation engine: webhook handler threw',
    );
    await writeNodeRun(prisma, {
      runId,
      nodeId: node.id,
      nodeType: 'webhook',
      status: 'failed',
      startedAt,
      completedAt: new Date(),
      errorMessage,
    });
    return { kind: 'end', reason: 'failed', errorMessage };
  }

  const next = findFirstNodeAfter(workflow, node.id, undefined, log);
  if (!next) return { kind: 'end', reason: 'completed' };
  return { kind: 'next', nodeId: next };
}

async function executeAiNode(args: {
  prisma: ExtendedPrismaClient;
  log: FastifyBaseLogger;
  runId: string;
  workflow: WorkflowJson;
  node: WorkflowNode;
  startedAt: Date;
}): Promise<NextNode> {
  const { prisma, log, runId, workflow, node, startedAt } = args;
  const data = node.data as AiNodeData;
  await writeNodeRun(prisma, {
    runId,
    nodeId: node.id,
    nodeType: 'ai',
    status: 'skipped',
    startedAt,
    completedAt: new Date(),
    outputJson: {
      reason: 'ai_not_implemented',
      kind: data?.kind ?? 'unknown',
    },
  });

  const next = findFirstNodeAfter(workflow, node.id, undefined, log);
  if (!next) return { kind: 'end', reason: 'completed' };
  return { kind: 'next', nodeId: next };
}

// ----- Helpers -----

/**
 * Finds the target node id following a given source node, optionally via a
 * specific sourceHandle. Returns null if no edge matches. When sourceHandle
 * is undefined, picks the first edge regardless of handle (used by nodes
 * that have only one outgoing path).
 */
function findFirstNodeAfter(
  workflow: WorkflowJson,
  sourceNodeId: string,
  sourceHandle: string | undefined,
  log?: FastifyBaseLogger,
): string | null {
  const edges = workflow.edges.filter((e) => e.source === sourceNodeId);
  if (edges.length === 0) return null;

  if (sourceHandle !== undefined) {
    const matching = edges.find((e) => e.sourceHandle === sourceHandle);
    if (matching) return matching.target;
    // Specific handle requested but no edge with that label — return null.
    // The caller decides whether to fall back to "any outgoing edge".
    log?.info(
      { sourceNodeId, sourceHandle },
      'automation engine: no outgoing edge for sourceHandle',
    );
    return null;
  }

  // No handle requested — return the first edge's target. Stable because we
  // iterate the edges array in insertion order.
  const first = edges[0];
  return first ? first.target : null;
}

function coerceRunContext(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/**
 * Compute resumeAt for a delay node. Returns null if the config is invalid
 * (missing fields for the chosen kind). PR 2 supports:
 *   - relative: NOW + delayMs
 *   - until_appointment: appointment.scheduledStartAt + appointmentOffsetMs
 *   - until_date: untilDateIso parsed as Date
 *   - until_client_birthday: client.dateOfBirth's next anniversary at midnight UTC
 *
 * The birthday computation here is intentionally simple — tenant-timezone-
 * aware delays are a Phase F polish. The delay queue (PR 4) calls
 * `resumeRun` when the clock catches up, so any timezone fuzz becomes a
 * cron-tick-resolution issue rather than a correctness one.
 */
function computeDelayResumeAt(
  data: DelayNodeData,
  runContext: Record<string, unknown>,
  now: Date,
  log: FastifyBaseLogger,
): Date | null {
  if (!data || typeof data !== 'object') return null;

  switch (data.kind) {
    case 'relative': {
      const ms = typeof data.delayMs === 'number' ? data.delayMs : NaN;
      if (!Number.isFinite(ms) || ms < 0) return null;
      return new Date(now.getTime() + ms);
    }

    case 'until_appointment': {
      const appt = runContext.appointment as
        | { scheduledStartAt?: unknown }
        | undefined;
      const start =
        appt && typeof appt.scheduledStartAt !== 'undefined'
          ? parseMaybeDate(appt.scheduledStartAt)
          : null;
      if (!start) return null;
      const offset =
        typeof data.appointmentOffsetMs === 'number'
          ? data.appointmentOffsetMs
          : 0;
      const resumeAt = new Date(start.getTime() + offset);
      // If the resume time is already past (e.g. for an appointment that
      // already happened), schedule it for NOW + a small epsilon so the
      // delay queue processes it on the next tick.
      if (resumeAt.getTime() <= now.getTime()) {
        return new Date(now.getTime() + 1000);
      }
      return resumeAt;
    }

    case 'until_date': {
      if (typeof data.untilDateIso !== 'string') return null;
      const d = new Date(data.untilDateIso);
      if (Number.isNaN(d.getTime())) return null;
      // Past-dated dates fire immediately on next tick.
      if (d.getTime() <= now.getTime()) {
        return new Date(now.getTime() + 1000);
      }
      return d;
    }

    case 'until_client_birthday': {
      const client = runContext.client as { dateOfBirth?: unknown } | undefined;
      const dob =
        client && typeof client.dateOfBirth !== 'undefined'
          ? parseMaybeDate(client.dateOfBirth)
          : null;
      if (!dob) return null;
      // Next anniversary of (month, day) at 09:00 UTC. PR 13 (birthday
      // cron) ships richer per-tenant timezone handling; for explicit
      // birthday delays inside a running workflow, midnight-UTC is fine.
      const candidate = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          dob.getUTCMonth(),
          dob.getUTCDate(),
          9,
          0,
          0,
        ),
      );
      if (candidate.getTime() <= now.getTime()) {
        candidate.setUTCFullYear(candidate.getUTCFullYear() + 1);
      }
      return candidate;
    }

    default: {
      const unknownKind: string = (data as { kind?: string }).kind ?? 'unknown';
      log.warn(
        { kind: unknownKind },
        'automation engine: unknown delay kind, treating as compute-failed',
      );
      return null;
    }
  }
}

function parseMaybeDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ----- Persistence helpers -----

interface NodeRunWrite {
  runId: string;
  nodeId: string;
  nodeType: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'retrying';
  startedAt: Date;
  completedAt: Date | null;
  inputJson?: Record<string, unknown> | null;
  outputJson?: Record<string, unknown> | null;
  errorMessage?: string;
}

async function writeNodeRun(
  prisma: ExtendedPrismaClient,
  args: NodeRunWrite,
): Promise<void> {
  // Prisma Json columns reject literal null in the input type — pass
  // Prisma.JsonNull to write a JSON null, or Prisma.DbNull to leave the
  // column NULL. We use DbNull (column-NULL) for "no input/output captured".
  const inputJson =
    args.inputJson === undefined || args.inputJson === null
      ? Prisma.DbNull
      : (args.inputJson as Prisma.InputJsonValue);
  const outputJson =
    args.outputJson === undefined || args.outputJson === null
      ? Prisma.DbNull
      : (args.outputJson as Prisma.InputJsonValue);

  await prisma.automationNodeRun.create({
    data: {
      runId: args.runId,
      nodeId: args.nodeId,
      nodeType: args.nodeType,
      status: args.status,
      startedAt: args.startedAt,
      completedAt: args.completedAt,
      inputJson,
      outputJson,
      errorMessage: args.errorMessage ?? null,
    },
  });
}

async function markRunSucceeded(
  prisma: ExtendedPrismaClient,
  runId: string,
): Promise<void> {
  const now = new Date();
  await prisma.automationRun.update({
    where: { id: runId },
    data: {
      status: 'succeeded',
      completedAt: now,
      errorMessage: null,
    },
  });
  // Denormalize last-run-* onto the workflow for the dashboard list (PR 5).
  await syncWorkflowLastRun(prisma, runId, 'succeeded', now);
}

async function markRunFailed(
  prisma: ExtendedPrismaClient,
  runId: string,
  errorMessage: string,
): Promise<void> {
  const now = new Date();
  await prisma.automationRun.update({
    where: { id: runId },
    data: {
      status: 'failed',
      completedAt: now,
      errorMessage,
    },
  });
  await syncWorkflowLastRun(prisma, runId, 'failed', now);
}

async function syncWorkflowLastRun(
  prisma: ExtendedPrismaClient,
  runId: string,
  status: 'succeeded' | 'failed',
  at: Date,
): Promise<void> {
  // Read workflowId off the run; cheap because runId is indexed.
  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    select: { workflowId: true },
  });
  if (!run) return;
  await prisma.automationWorkflow.update({
    where: { id: run.workflowId },
    data: {
      lastRunStatus: status,
      lastRunAt: at,
    },
  });
}
