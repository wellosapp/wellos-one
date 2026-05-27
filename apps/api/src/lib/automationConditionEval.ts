// Automation condition evaluator — pure boolean expression tree walk.
//
// PR 2 of the Automation System epic. Mirrors the SHAPE of forms PR 7's
// `formValidation.ts` visibility-rule evaluator but with a richer operator
// set (numeric comparison, array membership, prefix/suffix). Forms keeps its
// own copy because that runs in the browser too; automation conditions only
// run server-side, so this file can lean on Node-only primitives.
//
// Pure function — no DB, no Prisma, no fetch. The engine builds `context`
// from the AutomationRun's context_json + any resolved entities, then calls
// `evaluateConditionGroup`. That keeps the evaluator unit-testable in
// isolation.
//
// Missing-field semantics: if `rule.field` resolves to `undefined`, the rule
// is treated as failing (returns false). We DON'T throw — a missing field
// from a malformed template should not crash the whole engine.

import type { FastifyBaseLogger } from 'fastify';

import type {
  ConditionGroup,
  ConditionRule,
  ConditionOperator,
} from './automationWorkflowTypes.js';

// Operator that's a ConditionGroup (vs a leaf rule). The shape has
// `combinator` + `rules`; a rule has `field` + `operator`.
function isConditionGroup(
  node: ConditionRule | ConditionGroup,
): node is ConditionGroup {
  return (
    typeof (node as ConditionGroup).combinator === 'string' &&
    Array.isArray((node as ConditionGroup).rules)
  );
}

/**
 * Resolves a dotted-path reference into a context object. Examples:
 *   - 'client.tags'                       → context.client.tags
 *   - 'appointment.serviceId'             → context.appointment.serviceId
 *   - 'context.formAnswers.allergies'     → context.context.formAnswers.allergies
 *
 * Returns `undefined` for any missing segment. Does NOT throw on null/
 * undefined intermediates — defense-in-depth against incomplete contexts.
 */
export function resolveFieldPath(
  path: string,
  context: Record<string, unknown>,
): unknown {
  if (!path) return undefined;
  const segments = path.split('.');
  let current: unknown = context;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function isMeaningfullyTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.length > 0;
  if (typeof value === 'number') return !Number.isNaN(value) && value !== 0;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0;
  // Objects are truthy if they have at least one own key. Empty {} treated as
  // falsy is friendlier when condition authors mean "is this thing set".
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Evaluates a single ConditionRule. Exported for unit-test reuse —
 * production callers should use `evaluateConditionGroup` which handles
 * AND/OR + nested groups.
 *
 * Returns false (not throws) on any unrecognized operator or missing
 * field — defense-in-depth. Pass an optional logger to surface the
 * unknown-operator case in production logs.
 */
export function evaluateConditionRule(
  rule: ConditionRule,
  context: Record<string, unknown>,
  log?: FastifyBaseLogger,
): boolean {
  const fieldValue = resolveFieldPath(rule.field, context);
  const op: ConditionOperator = rule.operator;
  const ruleValue = rule.value;

  // Truthy / falsy are independent of fieldValue presence — undefined IS
  // falsy. So we handle them BEFORE the missing-field shortcut below.
  if (op === 'is_truthy') return isMeaningfullyTruthy(fieldValue);
  if (op === 'is_falsy') return !isMeaningfullyTruthy(fieldValue);

  // Every other operator treats a missing field as a failed rule.
  if (fieldValue === undefined) return false;

  switch (op) {
    case 'equals':
      // Strict equality for primitives. Arrays / objects fall through to
      // false — use `contains` for array membership, `in` for set checks.
      if (Array.isArray(fieldValue) || (typeof fieldValue === 'object' && fieldValue !== null)) {
        return false;
      }
      return fieldValue === ruleValue;

    case 'not_equals':
      if (Array.isArray(fieldValue) || (typeof fieldValue === 'object' && fieldValue !== null)) {
        return true;
      }
      return fieldValue !== ruleValue;

    case 'contains':
      if (Array.isArray(fieldValue)) {
        return fieldValue.includes(ruleValue);
      }
      if (typeof fieldValue === 'string' && ruleValue !== null && ruleValue !== undefined) {
        return fieldValue.includes(String(ruleValue));
      }
      return false;

    case 'not_contains':
      if (Array.isArray(fieldValue)) {
        return !fieldValue.includes(ruleValue);
      }
      if (typeof fieldValue === 'string' && ruleValue !== null && ruleValue !== undefined) {
        return !fieldValue.includes(String(ruleValue));
      }
      // Missing string content + missing rule value → vacuously "not contains".
      return true;

    case 'greater_than':
    case 'less_than':
    case 'greater_or_equal':
    case 'less_or_equal': {
      const a = coerceNumber(fieldValue);
      const b = coerceNumber(ruleValue);
      if (a === null || b === null) return false;
      if (op === 'greater_than') return a > b;
      if (op === 'less_than') return a < b;
      if (op === 'greater_or_equal') return a >= b;
      return a <= b; // less_or_equal
    }

    case 'in':
      if (!Array.isArray(ruleValue)) return false;
      return ruleValue.includes(fieldValue);

    case 'not_in':
      if (!Array.isArray(ruleValue)) return true;
      return !ruleValue.includes(fieldValue);

    case 'starts_with':
      if (typeof fieldValue !== 'string' || ruleValue === null || ruleValue === undefined) {
        return false;
      }
      return fieldValue.startsWith(String(ruleValue));

    case 'ends_with':
      if (typeof fieldValue !== 'string' || ruleValue === null || ruleValue === undefined) {
        return false;
      }
      return fieldValue.endsWith(String(ruleValue));

    default: {
      // Unknown operator — log + return false so a malformed template
      // doesn't crash the engine. Phase F (PR 19) may upgrade this to
      // a strict-mode opt-in.
      const unknownOp: string = op;
      log?.warn(
        { operator: unknownOp, field: rule.field },
        'automation condition: unknown operator, treating rule as false',
      );
      return false;
    }
  }
}

/**
 * Evaluates a ConditionGroup against the run context. AND combinator passes
 * iff every child passes; OR passes iff at least one passes. Empty groups
 * return true (vacuously satisfied) — same convention as forms visibility.
 *
 * Recursively walks nested groups. No depth cap in PR 2; if real workflows
 * push deeply nested conditions, Phase F can add one.
 */
export function evaluateConditionGroup(
  group: ConditionGroup,
  context: Record<string, unknown>,
  log?: FastifyBaseLogger,
): boolean {
  if (!group || !Array.isArray(group.rules) || group.rules.length === 0) {
    return true;
  }

  const combinator = group.combinator === 'OR' ? 'OR' : 'AND';

  if (combinator === 'AND') {
    for (const child of group.rules) {
      const childResult = isConditionGroup(child)
        ? evaluateConditionGroup(child, context, log)
        : evaluateConditionRule(child, context, log);
      if (!childResult) return false;
    }
    return true;
  }

  // OR
  for (const child of group.rules) {
    const childResult = isConditionGroup(child)
      ? evaluateConditionGroup(child, context, log)
      : evaluateConditionRule(child, context, log);
    if (childResult) return true;
  }
  return false;
}
