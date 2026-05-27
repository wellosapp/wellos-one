// Automation workflow JSON shape — the LIVING spec for what a workflow stored
// in AutomationWorkflow.workflow_json looks like.
//
// PR 2 of the Automation System epic. The shape extends React Flow's node /
// edge model with per-node config payloads. The engine (this PR) walks these
// nodes; the visual canvas (Phase B, PRs 6-10) reads/writes them; PR 17 seeds
// templates against this schema.
//
// Zod validation here is intentionally loose — we validate the OUTER shape
// (nodes/edges arrays exist, node ids are non-empty, types are recognized)
// but leave `node.data` as `z.unknown()`. Per-type config gets validated at
// HANDLER-invocation time, where the action / condition / branch logic knows
// what it actually needs. This way:
//   - Templates with forward-compatible action types (e.g. a 'send_sms' node
//     that PR 21 will register) don't fail to load before their handler ships
//   - Adding a new node-type later doesn't require touching this file
//   - Engine internal logic (condition/branch/filter/delay) parses its own
//     data slice at execution time using the per-type interfaces below
//
// Keep this file pure types + a single `parseWorkflowJson` validator — no DB
// access, no Prisma imports.

import { z } from 'zod';

import type { AutomationEventType } from './automationEventBus.js';

// ----- Condition shape -----
//
// A boolean expression tree. Used by:
//   - condition nodes (the whole node IS a ConditionGroup eval)
//   - branch nodes (one ConditionGroup per labeled output)
//   - filter nodes (truthy = continue, falsy = stop the run)
//   - trigger pre-filters (only fire workflow on matching events)
//
// Operator semantics live in `automationConditionEval.ts`. The TYPE here just
// enumerates what the canvas + engine agree on.

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'is_truthy'
  | 'is_falsy'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'
  | 'in'
  | 'not_in'
  | 'starts_with'
  | 'ends_with';

export interface ConditionRule {
  /**
   * Dotted-path field reference into the run's context. Examples:
   *   - 'client.tags'
   *   - 'appointment.serviceId'
   *   - 'context.formAnswers.allergies'
   */
  field: string;
  operator: ConditionOperator;
  /** Operator-dependent. `is_truthy` / `is_falsy` ignore this. */
  value?: unknown;
}

export interface ConditionGroup {
  combinator: 'AND' | 'OR';
  rules: Array<ConditionRule | ConditionGroup>;
}

// ----- Per-node data shapes -----
//
// `node.data` shape varies by node.type. The engine narrows at execution
// time by inspecting node.type. Canvas (PR 8) edits these via the right-
// sidebar drawer.

export interface TriggerNodeData {
  triggerType: AutomationEventType;
  /**
   * Optional pre-filter — only fire this workflow on events matching the
   * condition. The dispatcher (PR 3) MAY use this to short-circuit before
   * even creating an AutomationRun; otherwise the engine evaluates it as
   * an implicit filter step after the trigger.
   */
  filter?: ConditionGroup;
}

export interface ActionNodeData {
  /**
   * Identifier for an `ActionHandler` registered against
   * `automationActionRegistry`. PR 2 ships the registry empty;
   * Phase D PRs (14-16) register real handlers.
   */
  actionType: string;
  /** Handler-specific config. Validated at handler invocation, not here. */
  config: Record<string, unknown>;
}

export interface ConditionNodeData {
  condition: ConditionGroup;
}

export interface BranchNodeData {
  /**
   * Each branch has a human label + a ConditionGroup. The engine evaluates
   * in order and follows the first matching branch's outgoing edge
   * (sourceHandle === branch.label). Multi-walker fan-out is a Phase F
   * polish — PR 2 picks the first match and logs a warning if more than
   * one would match.
   */
  branches: Array<{ label: string; condition: ConditionGroup }>;
  /**
   * If true, an edge with sourceHandle === 'default' is followed when no
   * branch matches. If false and nothing matches, the run terminates.
   */
  hasDefault: boolean;
}

export interface FilterNodeData {
  /**
   * If condition evaluates truthy, the run continues. If falsy, the run
   * terminates with status='succeeded' and a note 'filtered out' — filtering
   * out IS a valid terminal state, not a failure.
   */
  condition: ConditionGroup;
}

export interface DelayNodeData {
  kind: 'relative' | 'until_appointment' | 'until_date' | 'until_client_birthday';
  /** For kind='relative'. Milliseconds offset from NOW. */
  delayMs?: number;
  /**
   * For kind='until_appointment'. Milliseconds offset relative to
   * appointment.scheduledStartAt. Negative = before; positive = after.
   */
  appointmentOffsetMs?: number;
  /** For kind='until_date'. ISO 8601 datetime string. */
  untilDateIso?: string;
}

export interface WebhookNodeData {
  targetUrl: string;
  payload?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface AiNodeData {
  /**
   * Forward-compat placeholder. PR 2 records skipped status for these — a
   * future AI epic registers the real handlers.
   */
  kind: 'client_summary' | 'provider_prep' | 'soap_draft' | 'risk_identification';
}

export type NodeData =
  | TriggerNodeData
  | ActionNodeData
  | ConditionNodeData
  | BranchNodeData
  | FilterNodeData
  | DelayNodeData
  | WebhookNodeData
  | AiNodeData
  | Record<string, unknown>; // permissive escape hatch — engine narrows by node.type

// ----- React Flow node + edge -----

export type WorkflowNodeType =
  | 'trigger'
  | 'action'
  | 'condition'
  | 'delay'
  | 'branch'
  | 'filter'
  | 'webhook'
  | 'ai';

export interface WorkflowNode {
  /** Unique within the workflow. React Flow requires string ids. */
  id: string;
  type: WorkflowNodeType;
  /** Canvas coordinates — used by React Flow renderer only, engine ignores. */
  position: { x: number; y: number };
  /** Per-type config; engine narrows at execution time. */
  data: NodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /**
   * For nodes with multiple output handles (condition: 'true'/'false';
   * branch: per-label + optional 'default'; action with success/fail). Plain
   * action / delay / filter nodes have a single outgoing edge and omit this.
   */
  sourceHandle?: string;
  /** Canvas-rendered edge label. Engine doesn't read this. */
  label?: string;
}

export interface WorkflowJson {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /** Starting point — the trigger node id. The engine begins walking from here. */
  triggerNodeId: string;
}

// ----- Zod validator -----

const NODE_TYPES: readonly WorkflowNodeType[] = [
  'trigger',
  'action',
  'condition',
  'delay',
  'branch',
  'filter',
  'webhook',
  'ai',
] as const;

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(NODE_TYPES as unknown as [WorkflowNodeType, ...WorkflowNodeType[]]),
  position: positionSchema,
  // Loose — per-type validation happens at handler-invocation time.
  data: z.unknown().transform((v) => (v ?? {}) as NodeData),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  label: z.string().optional(),
});

const workflowJsonSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
  triggerNodeId: z.string().min(1),
});

/**
 * Validates the outer shape of `AutomationWorkflow.workflow_json`. Throws
 * `ZodError` on invalid input. Engine callers should catch + translate to
 * `WorkflowJsonInvalidError` (see `automationEngineService.ts`).
 *
 * Deliberately permissive on `node.data` — the canvas may write fields that
 * a future engine version doesn't yet understand, and we'd rather skip such
 * a node than refuse to load the whole workflow.
 */
export function parseWorkflowJson(raw: unknown): WorkflowJson {
  return workflowJsonSchema.parse(raw) as WorkflowJson;
}
