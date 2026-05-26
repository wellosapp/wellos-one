// Conditional-visibility rules for builder fields. Rules live INSIDE the
// existing schema JSON (per-field `visibility` property) — no DB migration.
// Multiple rules combine with AND only (no OR in MVP). Watched fields are
// referenced by stable `id`, not `internalKey`, so renames don't break.
//
// `evaluateVisibility` returns true when a field should render. If the
// referenced watched field has been deleted, that rule is treated as
// satisfied (the field defaults to visible) rather than silently hidden —
// hiding on missing data was judged the more surprising failure mode.

import type { FieldType, FormField } from './_schema-utils';

export type VisibilityOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'is_truthy'
  | 'is_falsy';

export interface VisibilityRule {
  fieldId: string; // the watched field, by id (survives internalKey renames)
  operator: VisibilityOperator;
  value?: string | number | boolean | string[];
}

export interface VisibilityConfig {
  rules: VisibilityRule[]; // combined with AND
}

// Operator catalog — used to render the operator dropdown + decide whether
// the value-input widget shows. `requiresValue: false` means the operator is
// a unary predicate (is_truthy / is_falsy) and the rule's `value` is unused.
export const VISIBILITY_OPERATORS: Record<
  VisibilityOperator,
  { label: string; requiresValue: boolean }
> = {
  equals: { label: 'equals', requiresValue: true },
  not_equals: { label: 'does not equal', requiresValue: true },
  contains: { label: 'contains', requiresValue: true },
  not_contains: { label: 'does not contain', requiresValue: true },
  is_truthy: { label: 'is filled in', requiresValue: false },
  is_falsy: { label: 'is empty', requiresValue: false },
};

// Field types that only support truthy/falsy checks. Their value shape is
// opaque to the visibility editor (a blob, an upload reference, etc.).
const TRUTHY_ONLY_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'file_upload',
  'image_upload',
  'signature',
]);

// Field types for which substring-style operators don't make obvious sense.
// (We still allow equals/not_equals on dates as a stringified comparison.)
const NO_CONTAINS_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'yes_no',
  'checkbox',
  'date',
  'number',
  'rating',
  'pain_scale',
  'dropdown',
  'radio',
]);

// Operators valid for a given watched-field type. Used by the rule editor
// to filter the operator dropdown so the user can't compose nonsense.
export function operatorsForFieldType(
  type: FieldType,
): VisibilityOperator[] {
  if (TRUTHY_ONLY_TYPES.has(type)) {
    return ['is_truthy', 'is_falsy'];
  }
  const ops: VisibilityOperator[] = ['equals', 'not_equals'];
  // multi_select stores arrays — contains/not_contains are membership checks.
  if (type === 'multi_select') {
    ops.push('contains', 'not_contains');
  } else if (!NO_CONTAINS_TYPES.has(type)) {
    ops.push('contains', 'not_contains');
  }
  ops.push('is_truthy', 'is_falsy');
  return ops;
}

// Watched-field candidates for the given current field. Excludes the field
// itself + any fields whose own visibility rules depend on `currentFieldId`
// (one-level cycle prevention — recursive cycles like A→B→C→A are accepted
// as latent risk per the PR spec).
export function getWatchableFields(
  currentFieldId: string,
  allFields: FormField[],
): FormField[] {
  return allFields.filter((f) => {
    if (f.id === currentFieldId) return false;
    const rules = f.visibility?.rules ?? [];
    for (const r of rules) {
      if (r.fieldId === currentFieldId) return false;
    }
    return true;
  });
}

// "Truthy-ish" — non-null, non-undefined, non-empty-string, non-empty-array,
// non-NaN, non-zero numbers count as truthy, false booleans count as falsy.
// Lifted out so equals/contains/etc. all share the same emptiness semantics.
function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return !Number.isNaN(value) && value !== 0;
  if (typeof value === 'boolean') return value;
  return true;
}

// Compare two scalars for `equals`. Coerces string<->number where possible
// (HTML inputs always return strings) so a numeric rule still matches.
function scalarEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' || typeof b === 'number') {
    const na = typeof a === 'number' ? a : Number(a);
    const nb = typeof b === 'number' ? b : Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return String(a) === String(b);
  }
  return String(a) === String(b);
}

function evaluateRule(
  rule: VisibilityRule,
  fieldValues: Record<string, unknown>,
  fields: FormField[],
): boolean {
  // Orphan rule — referenced field was deleted. Per spec: treat as
  // satisfied so the dependent field stays visible.
  const watched = fields.find((f) => f.id === rule.fieldId);
  if (!watched) return true;

  const current = fieldValues[rule.fieldId];

  switch (rule.operator) {
    case 'is_truthy':
      return isFilled(current);
    case 'is_falsy':
      return !isFilled(current);
    case 'equals': {
      if (Array.isArray(current)) {
        // multi_select: equals = "rule.value is selected"
        return current.some((v) => scalarEquals(v, rule.value));
      }
      return scalarEquals(current, rule.value);
    }
    case 'not_equals': {
      if (Array.isArray(current)) {
        return !current.some((v) => scalarEquals(v, rule.value));
      }
      return !scalarEquals(current, rule.value);
    }
    case 'contains': {
      if (Array.isArray(current)) {
        return current.some((v) => scalarEquals(v, rule.value));
      }
      if (current == null || rule.value == null) return false;
      return String(current).includes(String(rule.value));
    }
    case 'not_contains': {
      if (Array.isArray(current)) {
        return !current.some((v) => scalarEquals(v, rule.value));
      }
      if (current == null || rule.value == null) return true;
      return !String(current).includes(String(rule.value));
    }
    default:
      return true;
  }
}

// True when the field should be shown. Undefined visibility = always visible.
// All rules must pass (AND). Empty rules array = always visible.
export function evaluateVisibility(
  visibility: VisibilityConfig | undefined,
  fieldValues: Record<string, unknown>,
  fields: FormField[],
): boolean {
  if (!visibility || !Array.isArray(visibility.rules) || visibility.rules.length === 0) {
    return true;
  }
  for (const rule of visibility.rules) {
    if (!evaluateRule(rule, fieldValues, fields)) return false;
  }
  return true;
}

// True when the watched field type doesn't take a freeform value (we only
// support is_truthy / is_falsy for it). Used by the rule editor to hide the
// value input entirely.
export function isTruthyOnlyType(type: FieldType): boolean {
  return TRUTHY_ONLY_TYPES.has(type);
}
