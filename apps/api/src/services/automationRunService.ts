// Read-only service backing the admin run-history viewer at
// /admin/automation-runs. PR 5 of the Automation System epic — the first
// admin surface for the engine. List + detail; no actions (retry / cancel
// land in Phase F).
//
// Two entry points:
//   - listAutomationRuns: tenant-scoped paginated list. Filter by status +
//     workflowId + date range. Cursor pagination on (createdAt, id) DESC.
//   - getAutomationRunDetail: full run + all AutomationNodeRun rows + the
//     workflow definition. Resolves node labels from workflow_json so the
//     UI shows "Send SMS" rather than "node-7".
//
// Tenant scoping: every query filters by tenantId from the caller. The
// route layer reads tenantId from request.currentUser.

import { Prisma } from '@prisma/client';

import type { ExtendedPrismaClient } from '../db/client.js';
import { parseWorkflowJson } from '../lib/automationWorkflowTypes.js';
import type {
  ActionNodeData,
  AiNodeData,
  DelayNodeData,
  TriggerNodeData,
  WorkflowNode,
} from '../lib/automationWorkflowTypes.js';

// ----- Public DTOs -----

export type AutomationRunStatusFilter =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'all';

export interface AutomationRunListItem {
  id: string;
  workflowId: string;
  workflowName: string;
  triggerEvent: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  // Pulled from context_json for the list view.
  clientId: string | null;
  clientName: string | null;
  appointmentId: string | null;
  createdAt: string;
}

export interface ListAutomationRunsArgs {
  tenantId: string;
  status?: AutomationRunStatusFilter;
  workflowId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  take?: number;
}

export interface ListAutomationRunsResult {
  runs: AutomationRunListItem[];
  cursor: string | null;
}

export interface AutomationNodeRunDto {
  id: string;
  nodeId: string;
  nodeType: string;
  status: string;
  inputJson: unknown;
  outputJson: unknown;
  errorMessage: string | null;
  retryCount: number;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  /** Resolved from the workflow_json for display. Falls back to null when the
   * node is missing from the graph or workflow_json fails to parse — the UI
   * then shows the raw nodeId. */
  nodeLabel: string | null;
}

export interface AutomationRunDetail {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowDescription: string | null;
  triggerEvent: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  contextJson: unknown;
  createdAt: string;
  nodeRuns: AutomationNodeRunDto[];
}

// ----- Errors -----

export class AutomationRunNotFoundError extends Error {
  readonly code = 'AUTOMATION_RUN_NOT_FOUND' as const;
  constructor(public runId: string) {
    super(`AutomationRun ${runId} not found`);
    this.name = 'AutomationRunNotFoundError';
  }
}

// ----- Helpers -----

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

interface CursorPayload {
  id: string;
  createdAt: string;
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { id: string; createdAt: Date } | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<CursorPayload>;
    if (typeof parsed.id !== 'string' || typeof parsed.createdAt !== 'string') {
      return null;
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { id: parsed.id, createdAt };
  } catch {
    return null;
  }
}

function computeDurationMs(
  start: Date | null,
  end: Date | null,
): number | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  return ms < 0 ? null : ms;
}

// context_json is opaque to the engine but rich for the list view — pull
// client / appointment hints out for the table cells. Defensive: any shape
// mismatch returns nulls rather than throwing, because runs can carry
// partial contexts (enricher fallback path).
function extractListContext(contextJson: unknown): {
  clientId: string | null;
  clientName: string | null;
  appointmentId: string | null;
} {
  if (!contextJson || typeof contextJson !== 'object') {
    return { clientId: null, clientName: null, appointmentId: null };
  }
  const ctx = contextJson as Record<string, unknown>;
  const client =
    ctx.client && typeof ctx.client === 'object'
      ? (ctx.client as Record<string, unknown>)
      : null;
  const appointment =
    ctx.appointment && typeof ctx.appointment === 'object'
      ? (ctx.appointment as Record<string, unknown>)
      : null;

  const clientId =
    client && typeof client.id === 'string' ? client.id : null;
  const firstName =
    client && typeof client.firstName === 'string' ? client.firstName : null;
  const lastName =
    client && typeof client.lastName === 'string' ? client.lastName : null;
  const clientName =
    [firstName, lastName].filter((p): p is string => !!p).join(' ') || null;
  const appointmentId =
    appointment && typeof appointment.id === 'string' ? appointment.id : null;

  return { clientId, clientName, appointmentId };
}

// ----- listAutomationRuns -----

export async function listAutomationRuns(
  prisma: ExtendedPrismaClient,
  args: ListAutomationRunsArgs,
): Promise<ListAutomationRunsResult> {
  const take = Math.min(MAX_TAKE, Math.max(1, args.take ?? DEFAULT_TAKE));

  const where: Prisma.AutomationRunWhereInput = {
    tenantId: args.tenantId,
  };
  if (args.status && args.status !== 'all') {
    where.status = args.status;
  }
  if (args.workflowId) {
    where.workflowId = args.workflowId;
  }
  if (args.from || args.to) {
    where.createdAt = {};
    if (args.from) where.createdAt.gte = args.from;
    if (args.to) where.createdAt.lte = args.to;
  }

  // Cursor on (createdAt, id) DESC — strict-less-than so we don't re-emit
  // the cursor row.
  if (args.cursor) {
    const decoded = decodeCursor(args.cursor);
    if (decoded) {
      where.OR = [
        { createdAt: { lt: decoded.createdAt } },
        {
          createdAt: decoded.createdAt,
          id: { lt: decoded.id },
        },
      ];
    }
  }

  const rows = await prisma.automationRun.findMany({
    where,
    take: take + 1, // peek one extra to know if a next page exists
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      workflowId: true,
      triggerEvent: true,
      status: true,
      startedAt: true,
      completedAt: true,
      errorMessage: true,
      contextJson: true,
      createdAt: true,
      workflow: { select: { name: true } },
    },
  });

  const hasNext = rows.length > take;
  const sliced = hasNext ? rows.slice(0, take) : rows;
  const last = sliced[sliced.length - 1];

  const runs: AutomationRunListItem[] = sliced.map((r) => {
    const ctx = extractListContext(r.contextJson);
    return {
      id: r.id,
      workflowId: r.workflowId,
      workflowName: r.workflow.name,
      triggerEvent: r.triggerEvent,
      status: r.status,
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      errorMessage: r.errorMessage,
      durationMs: computeDurationMs(r.startedAt, r.completedAt),
      clientId: ctx.clientId,
      clientName: ctx.clientName,
      appointmentId: ctx.appointmentId,
      createdAt: r.createdAt.toISOString(),
    };
  });

  const cursor =
    hasNext && last
      ? encodeCursor({ id: last.id, createdAt: last.createdAt.toISOString() })
      : null;

  return { runs, cursor };
}

// ----- getAutomationRunDetail -----

/**
 * Builds a `nodeId → label` map from a parsed workflow. The label rules:
 *   - trigger     → "Trigger: <event type>"
 *   - action      → "Action: <actionType>"
 *   - delay       → "Delay (<kind>)"
 *   - condition   → "Condition"
 *   - branch      → "Branch"
 *   - filter      → "Filter"
 *   - webhook     → "Webhook"
 *   - ai          → "AI: <kind>"
 *
 * If the workflow_json fails to parse, the map is empty and callers fall
 * back to the raw nodeId.
 */
function buildNodeLabelMap(workflowJson: unknown): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const parsed = parseWorkflowJson(workflowJson);
    for (const node of parsed.nodes as WorkflowNode[]) {
      map.set(node.id, nodeLabel(node));
    }
  } catch {
    // Parse failure → empty map, UI falls back to nodeId.
  }
  return map;
}

function nodeLabel(node: WorkflowNode): string {
  switch (node.type) {
    case 'trigger': {
      const data = (node.data ?? {}) as Partial<TriggerNodeData>;
      return data.triggerType
        ? `Trigger: ${data.triggerType}`
        : 'Trigger';
    }
    case 'action': {
      const data = (node.data ?? {}) as Partial<ActionNodeData>;
      return data.actionType ? `Action: ${data.actionType}` : 'Action';
    }
    case 'delay': {
      const data = (node.data ?? {}) as Partial<DelayNodeData>;
      return data.kind ? `Delay (${data.kind})` : 'Delay';
    }
    case 'condition':
      return 'Condition';
    case 'branch':
      return 'Branch';
    case 'filter':
      return 'Filter';
    case 'webhook':
      return 'Webhook';
    case 'ai': {
      const data = (node.data ?? {}) as Partial<AiNodeData>;
      return data.kind ? `AI: ${data.kind}` : 'AI';
    }
    default:
      return node.type;
  }
}

export async function getAutomationRunDetail(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; runId: string },
): Promise<AutomationRunDetail> {
  const run = await prisma.automationRun.findFirst({
    where: { id: args.runId, tenantId: args.tenantId },
    include: {
      workflow: {
        select: {
          id: true,
          name: true,
          description: true,
          workflowJson: true,
        },
      },
      nodeRuns: {
        orderBy: [{ startedAt: 'asc' }],
      },
    },
  });

  if (!run) {
    throw new AutomationRunNotFoundError(args.runId);
  }

  const labelMap = buildNodeLabelMap(run.workflow.workflowJson);

  const nodeRuns: AutomationNodeRunDto[] = run.nodeRuns.map((n) => ({
    id: n.id,
    nodeId: n.nodeId,
    nodeType: n.nodeType,
    status: n.status,
    inputJson: n.inputJson,
    outputJson: n.outputJson,
    errorMessage: n.errorMessage,
    retryCount: n.retryCount,
    startedAt: n.startedAt?.toISOString() ?? null,
    completedAt: n.completedAt?.toISOString() ?? null,
    durationMs: computeDurationMs(n.startedAt, n.completedAt),
    nodeLabel: labelMap.get(n.nodeId) ?? null,
  }));

  return {
    id: run.id,
    workflowId: run.workflowId,
    workflowName: run.workflow.name,
    workflowDescription: run.workflow.description ?? null,
    triggerEvent: run.triggerEvent,
    status: run.status,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    durationMs: computeDurationMs(run.startedAt, run.completedAt),
    errorMessage: run.errorMessage,
    contextJson: run.contextJson,
    createdAt: run.createdAt.toISOString(),
    nodeRuns,
  };
}
