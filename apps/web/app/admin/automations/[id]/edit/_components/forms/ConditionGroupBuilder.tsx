'use client';

import { Input, Select } from '@/components/ui';
import { cn } from '@/lib/cn';

import { findFieldDef } from './fieldCatalog';
import { FieldPicker } from './FieldPicker';
import {
  operatorIsMultiValue,
  operatorIsValueless,
  operatorsForKind,
  type ConditionOperator,
} from './conditionOperators';

// Flat ConditionGroup editor — PR 8 of the Automation System epic. Used by
// the condition / filter forms and the trigger's optional pre-filter.
// Nested groups (a Group whose `rules` contains another Group) are valid in
// the engine but not yet authorable in the UI — that lands in a later
// polish PR. The engine handles authored-flat groups exactly as expected.
//
// Empty groups are valid in the engine ("evaluates to true" by combinator
// identity) — the builder lets users add/delete rules freely.

export interface ConditionRule {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface ConditionGroup {
  combinator: 'AND' | 'OR';
  rules: Array<ConditionRule | ConditionGroup>;
}

interface Props {
  triggerType: string;
  value: ConditionGroup;
  onChange: (next: ConditionGroup) => void;
  disabled?: boolean;
}

const DEFAULT_RULE = (firstFieldPath: string): ConditionRule => ({
  field: firstFieldPath,
  operator: 'equals',
  value: '',
});

function isGroup(node: ConditionRule | ConditionGroup): node is ConditionGroup {
  return (
    typeof (node as ConditionGroup).combinator === 'string' &&
    Array.isArray((node as ConditionGroup).rules)
  );
}

export function ConditionGroupBuilder({
  triggerType,
  value,
  onChange,
  disabled,
}: Props) {
  const combinator = value.combinator ?? 'AND';
  const rules = value.rules ?? [];

  const updateRule = (index: number, next: ConditionRule) => {
    onChange({
      ...value,
      rules: rules.map((r, i) => (i === index ? next : r)),
    });
  };

  const removeRule = (index: number) => {
    onChange({ ...value, rules: rules.filter((_, i) => i !== index) });
  };

  const addRule = () => {
    // Seed with the first field of the first group so the dropdown isn't
    // empty when the user opens it.
    const seedPath =
      findFieldDef(triggerType, 'client.id')?.path ?? 'event.type';
    onChange({ ...value, rules: [...rules, DEFAULT_RULE(seedPath)] });
  };

  return (
    <div className="rounded-md border border-surface-3 bg-white p-s4">
      <div className="flex items-center justify-between gap-s3">
        <label className="t-caption text-ink-soft">
          Match
          <Select
            value={combinator}
            onChange={(e) =>
              onChange({
                ...value,
                combinator: e.target.value === 'OR' ? 'OR' : 'AND',
              })
            }
            disabled={disabled}
            className="ml-s2 inline-block w-auto py-s1 px-s3 t-body-sm"
          >
            <option value="AND">all of the following</option>
            <option value="OR">any of the following</option>
          </Select>
        </label>
      </div>

      <ul className="mt-s3 flex flex-col gap-s3">
        {rules.length === 0 ? (
          <li className="t-caption text-ink-soft">No rules yet.</li>
        ) : (
          rules.map((rule, index) =>
            isGroup(rule) ? (
              <li
                key={index}
                className="rounded-sm border border-dashed border-surface-3 px-s3 py-s2 t-caption text-ink-soft"
              >
                Nested group (edit-from-JSON only for now)
              </li>
            ) : (
              <li key={index}>
                <RuleRow
                  triggerType={triggerType}
                  rule={rule}
                  onChange={(next) => updateRule(index, next)}
                  onRemove={() => removeRule(index)}
                  disabled={disabled}
                />
              </li>
            ),
          )
        )}
      </ul>

      <button
        type="button"
        onClick={addRule}
        disabled={disabled}
        className={cn(
          'mt-s3 t-body-sm text-accent no-underline hover:underline',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        + Add rule
      </button>
    </div>
  );
}

function RuleRow({
  triggerType,
  rule,
  onChange,
  onRemove,
  disabled,
}: {
  triggerType: string;
  rule: ConditionRule;
  onChange: (next: ConditionRule) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const fieldDef = findFieldDef(triggerType, rule.field);
  const kind = fieldDef?.kind ?? 'unknown';
  const operatorOptions = operatorsForKind(kind);
  const valueless = operatorIsValueless(rule.operator);
  const multi = operatorIsMultiValue(rule.operator);
  const currentValue =
    rule.value === null || rule.value === undefined
      ? ''
      : Array.isArray(rule.value)
        ? rule.value.join(', ')
        : String(rule.value);

  const onValueChange = (raw: string) => {
    if (multi) {
      const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
      onChange({ ...rule, value: parts });
      return;
    }
    if (kind === 'number') {
      const n = raw === '' ? '' : Number(raw);
      onChange({ ...rule, value: Number.isNaN(n) ? raw : n });
      return;
    }
    if (kind === 'boolean') {
      onChange({ ...rule, value: raw === 'true' });
      return;
    }
    onChange({ ...rule, value: raw });
  };

  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-s2">
      <FieldPicker
        triggerType={triggerType}
        value={rule.field}
        onChange={(path) => onChange({ ...rule, field: path })}
        disabled={disabled}
      />
      <Select
        value={rule.operator}
        onChange={(e) =>
          onChange({ ...rule, operator: e.target.value as ConditionOperator })
        }
        disabled={disabled}
        aria-label="Operator"
      >
        {operatorOptions.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </Select>
      {valueless ? (
        <div />
      ) : kind === 'boolean' ? (
        <Select
          value={String(rule.value === true)}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={disabled}
          aria-label="Value"
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </Select>
      ) : (
        <Input
          type={kind === 'number' ? 'number' : 'text'}
          value={currentValue}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={multi ? 'comma-separated' : 'value'}
          disabled={disabled}
          aria-label="Value"
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove rule"
        className={cn(
          't-body-sm text-ink-soft hover:text-red',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        ✕
      </button>
    </div>
  );
}
