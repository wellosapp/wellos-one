// Automation action handler registry.
//
// PR 2 of the Automation System epic. Provides the wiring contract for the
// engine to dispatch action nodes. Ships EMPTY here — no handlers registered.
// Phase D PRs (14-16) call `automationActionRegistry.register('send_sms', ...)`
// etc. to fill it.
//
// Why a registry rather than a switch statement in the engine: each handler
// (send SMS, add tag, create task, dispatch webhook) lands in its own PR,
// owned by different services. The registry lets us land the engine
// independently of any single handler. Same pattern as Fastify plugins —
// declarative registration, dispatched by string key.
//
// Tenant scope, audit, idempotency: each handler is responsible for its own
// $transaction + audit-log writes. The registry just dispatches.
//
// Single-process today — mirrors automationEventBus.ts. // TODO(scale)
// stays consistent.

import type { FastifyBaseLogger } from 'fastify';

import type { ExtendedPrismaClient } from '../db/client.js';

// ----- Context passed to every handler -----

export interface ActionExecutionContext {
  /** Extended Prisma client — handler may open its own $transaction. */
  prisma: ExtendedPrismaClient;
  /** Pino logger — handler logs through this. Tagged with run/node ids by the engine. */
  log: FastifyBaseLogger;
  /** AutomationRun.id — for audit + correlation. */
  runId: string;
  /** WorkflowNode.id within the workflow's workflow_json. */
  nodeId: string;
  /** Tenant scope — handler MUST scope every query by this. */
  tenantId: string;
  /**
   * Resolved run context built by the engine — same shape used for condition
   * eval. Includes the trigger event payload + resolved client / appointment /
   * etc. when the dispatcher (PR 3) populates them. Read-only from the
   * handler's POV; mutations don't propagate back.
   */
  runContext: Record<string, unknown>;
  /**
   * Test mode (PR 10). When true, handlers should skip side effects (no
   * SMS sent, no rows mutated outside the audit trail) but may still
   * return a representative `output` so the canvas test viewer can render
   * a realistic path.
   */
  dryRun: boolean;
}

export interface ActionExecutionResult {
  /**
   * Stored as AutomationNodeRun.output_json. Free-form per handler — the
   * SMS handler might return `{ messageSid: 'SM...' }`, the tag handler
   * `{ tagId: 'cuid', alreadyApplied: false }`, etc.
   */
  output: Record<string, unknown>;
}

export type ActionHandler = (
  ctx: ActionExecutionContext,
  config: Record<string, unknown>,
) => Promise<ActionExecutionResult>;

// ----- Registry implementation -----

class ActionRegistry {
  private handlers: Map<string, ActionHandler> = new Map();

  /**
   * Register a handler for an actionType. Overwrites any existing handler
   * with a warning-level no-op (the engine doesn't log here — caller can
   * detect via `has()` if they care about replace-vs-create semantics).
   * Phase D PRs call this at boot.
   */
  register(actionType: string, handler: ActionHandler): void {
    this.handlers.set(actionType, handler);
  }

  /** True if a handler is registered for the given actionType. */
  has(actionType: string): boolean {
    return this.handlers.has(actionType);
  }

  /**
   * Returns the handler for the given actionType, or `null` if none is
   * registered. The engine uses this to decide between dispatching the
   * handler and writing a `skipped` node-run row.
   */
  get(actionType: string): ActionHandler | null {
    return this.handlers.get(actionType) ?? null;
  }

  /** Test/debug helper: how many handlers are registered. */
  get size(): number {
    return this.handlers.size;
  }

  /**
   * Test helper: clear all registrations. NOT for production use — only
   * unit tests should call this between cases. Mirrors
   * `automationEventBus._clearAllSubscribers`.
   */
  _clearAll(): void {
    this.handlers.clear();
  }
}

export const automationActionRegistry = new ActionRegistry();
