// Automation workflow service — backs /admin/automation-workflows/* in PR 6
// of the Automation System epic. CRUD over AutomationWorkflow rows.
//
// Phase B PR 6 ships the canvas + persistence shell. State transitions are
// intentionally narrow here (draft ↔ archived only) — PR 8 unlocks
// draft → active when the settings drawer makes node configs meaningful.
// Other transitions throw AutomationWorkflowInvalidStateTransitionError so
// the route layer can return 409 with a stable code.
//
// Tenant scoping: every query filters by `args.tenantId`. The route layer
// reads tenantId from `request.currentUser.tenantId`. Never accept tenantId
// from request body / params.
//
// workflow_json validation: incoming workflowJson goes through
// `parseWorkflowJson` (the Zod validator declared in PR 2) before writing.
// Invalid shapes surface as ZodError which the route layer maps to a 400.

import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import type { ExtendedPrismaClient } from '../db/client.js';
import { parseWorkflowJson } from '../lib/automationWorkflowTypes.js';

// ----- Public DTOs -----

export type AutomationWorkflowStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'archived'
  | 'error';

export type AutomationWorkflowStatusFilter =
  | AutomationWorkflowStatus
  | 'all';

export interface AutomationWorkflowListItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
  triggerType: string;
  lastRunStatus: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationWorkflowDetail extends AutomationWorkflowListItem {
  /** Parsed at the API boundary — outer shape verified, node.data left loose. */
  workflowJson: unknown;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface ListAutomationWorkflowsArgs {
  tenantId: string;
  status?: AutomationWorkflowStatusFilter;
  cursor?: string;
  take?: number;
}

export interface ListAutomationWorkflowsResult {
  workflows: AutomationWorkflowListItem[];
  cursor: string | null;
}

export interface CreateAutomationWorkflowArgs {
  tenantId: string;
  actorUserId: string | null;
  name: string;
  description?: string;
  /** One of AutomationEventType. Stored as a plain string for forward-compat. */
  triggerType: string;
}

export interface UpdateAutomationWorkflowArgs {
  tenantId: string;
  actorUserId: string | null;
  id: string;
  name?: string;
  description?: string | null;
  triggerType?: string;
  status?: AutomationWorkflowStatus;
  /** When provided, validated via parseWorkflowJson before persisting. */
  workflowJson?: unknown;
}

// ----- Errors -----

export class AutomationWorkflowNotFoundError extends Error {
  readonly code = 'AUTOMATION_WORKFLOW_NOT_FOUND' as const;
  constructor(public workflowId: string) {
    super(`AutomationWorkflow ${workflowId} not found`);
    this.name = 'AutomationWorkflowNotFoundError';
  }
}

export class AutomationWorkflowInvalidStateTransitionError extends Error {
  readonly code = 'AUTOMATION_WORKFLOW_INVALID_STATE_TRANSITION' as const;
  constructor(
    public from: string,
    public to: string,
  ) {
    super(`Cannot transition workflow from '${from}' to '${to}'`);
    this.name = 'AutomationWorkflowInvalidStateTransitionError';
  }
}

export class AutomationWorkflowJsonInvalidError extends Error {
  readonly code = 'AUTOMATION_WORKFLOW_JSON_INVALID' as const;
  constructor(
    message: string,
    public issues: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'AutomationWorkflowJsonInvalidError';
  }
}

// ----- Helpers -----

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

interface CursorPayload {
  id: string;
  updatedAt: string;
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { id: string; updatedAt: Date } | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<CursorPayload>;
    if (typeof parsed.id !== 'string' || typeof parsed.updatedAt !== 'string') {
      return null;
    }
    const updatedAt = new Date(parsed.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) return null;
    return { id: parsed.id, updatedAt };
  } catch {
    return null;
  }
}

// Default workflow_json content for newly-created workflows. Minimal — one
// trigger node placeholder at (250, 100), no edges. The user can move it
// but can't configure it until PR 8 ships the settings drawer.
function defaultWorkflowJsonTemplate(triggerType: string): unknown {
  return {
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 100 },
        data: { triggerType },
      },
    ],
    edges: [],
    triggerNodeId: 'trigger-1',
  };
}

// State-transition guard. PR 6 only allows draft ↔ archived. PR 8 will
// expand this when the settings drawer + validation make `active` meaningful.
function isStateTransitionAllowed(from: string, to: string): boolean {
  if (from === to) return true;
  if (from === 'draft' && to === 'archived') return true;
  if (from === 'archived' && to === 'draft') return true;
  return false;
}

function rowToListItem(row: {
  id: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
  triggerType: string;
  lastRunStatus: string | null;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AutomationWorkflowListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    version: row.version,
    triggerType: row.triggerType,
    lastRunStatus: row.lastRunStatus,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function rowToDetail(row: {
  id: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
  triggerType: string;
  workflowJson: Prisma.JsonValue;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  lastRunStatus: string | null;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AutomationWorkflowDetail {
  return {
    ...rowToListItem(row),
    workflowJson: row.workflowJson,
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
  };
}

function zodErrorToIssues(err: ZodError): Array<{ path: string; message: string }> {
  return err.issues.map((i) => ({
    path: i.path.join('.'),
    message: i.message,
  }));
}

// ----- listAutomationWorkflows -----

export async function listAutomationWorkflows(
  prisma: ExtendedPrismaClient,
  args: ListAutomationWorkflowsArgs,
): Promise<ListAutomationWorkflowsResult> {
  const take = Math.min(MAX_TAKE, Math.max(1, args.take ?? DEFAULT_TAKE));

  const where: Prisma.AutomationWorkflowWhereInput = {
    tenantId: args.tenantId,
  };
  if (args.status && args.status !== 'all') {
    where.status = args.status;
  }

  // Cursor on (updatedAt, id) DESC — most recently edited first.
  if (args.cursor) {
    const decoded = decodeCursor(args.cursor);
    if (decoded) {
      where.OR = [
        { updatedAt: { lt: decoded.updatedAt } },
        {
          updatedAt: decoded.updatedAt,
          id: { lt: decoded.id },
        },
      ];
    }
  }

  const rows = await prisma.automationWorkflow.findMany({
    where,
    take: take + 1,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      version: true,
      triggerType: true,
      lastRunStatus: true,
      lastRunAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const hasNext = rows.length > take;
  const sliced = hasNext ? rows.slice(0, take) : rows;
  const last = sliced[sliced.length - 1];

  const workflows = sliced.map(rowToListItem);

  const cursor =
    hasNext && last
      ? encodeCursor({ id: last.id, updatedAt: last.updatedAt.toISOString() })
      : null;

  return { workflows, cursor };
}

// ----- getAutomationWorkflow -----

export async function getAutomationWorkflow(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; id: string },
): Promise<AutomationWorkflowDetail | null> {
  const row = await prisma.automationWorkflow.findFirst({
    where: { id: args.id, tenantId: args.tenantId },
  });
  if (!row) return null;
  return rowToDetail(row);
}

// ----- createAutomationWorkflow -----

export async function createAutomationWorkflow(
  prisma: ExtendedPrismaClient,
  args: CreateAutomationWorkflowArgs,
): Promise<{ workflow: AutomationWorkflowDetail }> {
  const workflowJson = defaultWorkflowJsonTemplate(args.triggerType);

  const row = await prisma.automationWorkflow.create({
    data: {
      tenantId: args.tenantId,
      name: args.name,
      description: args.description ?? null,
      status: 'draft',
      version: 1,
      triggerType: args.triggerType,
      workflowJson: workflowJson as Prisma.InputJsonValue,
      createdByUserId: args.actorUserId,
      updatedByUserId: args.actorUserId,
    },
  });

  return { workflow: rowToDetail(row) };
}

// ----- updateAutomationWorkflow -----

export async function updateAutomationWorkflow(
  prisma: ExtendedPrismaClient,
  args: UpdateAutomationWorkflowArgs,
): Promise<{ workflow: AutomationWorkflowDetail }> {
  const existing = await prisma.automationWorkflow.findFirst({
    where: { id: args.id, tenantId: args.tenantId },
  });
  if (!existing) {
    throw new AutomationWorkflowNotFoundError(args.id);
  }

  // State transition guard. PR 6 only allows draft ↔ archived.
  if (args.status !== undefined && args.status !== existing.status) {
    if (!isStateTransitionAllowed(existing.status, args.status)) {
      throw new AutomationWorkflowInvalidStateTransitionError(
        existing.status,
        args.status,
      );
    }
  }

  // Validate workflow_json outer shape before persisting.
  if (args.workflowJson !== undefined) {
    try {
      parseWorkflowJson(args.workflowJson);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new AutomationWorkflowJsonInvalidError(
          'Workflow JSON failed validation.',
          zodErrorToIssues(err),
        );
      }
      throw err;
    }
  }

  const data: Prisma.AutomationWorkflowUpdateInput = {
    updatedByUserId: args.actorUserId,
  };
  if (args.name !== undefined) data.name = args.name;
  if (args.description !== undefined) data.description = args.description;
  if (args.triggerType !== undefined) data.triggerType = args.triggerType;
  if (args.status !== undefined) data.status = args.status;
  if (args.workflowJson !== undefined) {
    data.workflowJson = args.workflowJson as Prisma.InputJsonValue;
  }

  const row = await prisma.automationWorkflow.update({
    where: { id: existing.id },
    data,
  });

  return { workflow: rowToDetail(row) };
}

// ----- archiveAutomationWorkflow -----

export async function archiveAutomationWorkflow(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; actorUserId: string | null; id: string },
): Promise<{ workflow: AutomationWorkflowDetail }> {
  return updateAutomationWorkflow(prisma, {
    tenantId: args.tenantId,
    actorUserId: args.actorUserId,
    id: args.id,
    status: 'archived',
  });
}
