// Operator catalog for the ConditionGroupBuilder. Mirrors the
// `ConditionOperator` union in apps/api/src/lib/automationWorkflowTypes.ts.
//
// PR 8 of the Automation System epic.
//
// The grouping by value-kind keeps the operator dropdown short — the picker
// shows only the operators that make sense for the field the user picked.
// E.g. a `client.tags` (array) field offers `in` / `not_in`, not `greater_than`.

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

/** Categories the field catalog tags fields with. Drives operator filtering. */
export type FieldKind = 'string' | 'number' | 'boolean' | 'date' | 'array' | 'unknown';

export interface OperatorOption {
  value: ConditionOperator;
  label: string;
  /** True when the operator needs no `value` field (is_truthy / is_falsy). */
  valueless?: boolean;
  /**
   * True when the operator's `value` is a comma-separated list — applies to
   * `in` / `not_in`. The builder splits on commas at write time.
   */
  multiValue?: boolean;
}

export const OPERATORS: OperatorOption[] = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'is_truthy', label: 'is set', valueless: true },
  { value: 'is_falsy', label: 'is empty', valueless: true },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
  { value: 'greater_or_equal', label: 'greater than or equal' },
  { value: 'less_or_equal', label: 'less than or equal' },
  { value: 'in', label: 'is one of', multiValue: true },
  { value: 'not_in', label: 'is none of', multiValue: true },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
];

const STRING_OPERATORS: ConditionOperator[] = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'in',
  'not_in',
  'is_truthy',
  'is_falsy',
];

const NUMBER_OPERATORS: ConditionOperator[] = [
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'greater_or_equal',
  'less_or_equal',
  'in',
  'not_in',
  'is_truthy',
  'is_falsy',
];

const BOOLEAN_OPERATORS: ConditionOperator[] = [
  'equals',
  'not_equals',
  'is_truthy',
  'is_falsy',
];

const DATE_OPERATORS: ConditionOperator[] = [
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'greater_or_equal',
  'less_or_equal',
  'is_truthy',
  'is_falsy',
];

const ARRAY_OPERATORS: ConditionOperator[] = [
  'contains',
  'not_contains',
  'in',
  'not_in',
  'is_truthy',
  'is_falsy',
];

const ALL_OPERATORS: ConditionOperator[] = OPERATORS.map((o) => o.value);

export function operatorsForKind(kind: FieldKind): OperatorOption[] {
  let allowed: ConditionOperator[];
  switch (kind) {
    case 'string': allowed = STRING_OPERATORS; break;
    case 'number': allowed = NUMBER_OPERATORS; break;
    case 'boolean': allowed = BOOLEAN_OPERATORS; break;
    case 'date': allowed = DATE_OPERATORS; break;
    case 'array': allowed = ARRAY_OPERATORS; break;
    default: allowed = ALL_OPERATORS;
  }
  return OPERATORS.filter((op) => allowed.includes(op.value));
}

export function operatorLabel(value: ConditionOperator): string {
  return OPERATORS.find((op) => op.value === value)?.label ?? value;
}

export function operatorIsValueless(value: ConditionOperator): boolean {
  return OPERATORS.find((op) => op.value === value)?.valueless === true;
}

export function operatorIsMultiValue(value: ConditionOperator): boolean {
  return OPERATORS.find((op) => op.value === value)?.multiValue === true;
}
