'use client';

import { useMemo, useState } from 'react';

import { Button, FormField, Input, Select } from '@/components/ui';
import { TrashIcon } from '@/app/admin/_shell/icons';
import { cn } from '@/lib/cn';

import {
  FIELD_TYPE_LABELS,
  type FormField as FormFieldT,
} from '../_schema-utils';
import {
  VISIBILITY_OPERATORS,
  getWatchableFields,
  isTruthyOnlyType,
  operatorsForFieldType,
  type VisibilityConfig,
  type VisibilityOperator,
  type VisibilityRule,
} from '../_visibility-utils';

type Props = {
  currentField: FormFieldT;
  allFields: FormFieldT[];
  onChange: (visibility: VisibilityConfig | undefined) => void;
};

// Collapsible "Conditional visibility" section inside FieldSettingsDrawer.
// Owns no canonical state — every edit fires `onChange` with the next full
// config (or undefined to mean "always visible"). The collapse state and
// the "Always visible" toggle are local UI concerns and stay here.
export function VisibilitySection({ currentField, allFields, onChange }: Props) {
  const config = currentField.visibility;
  const hasRules = (config?.rules.length ?? 0) > 0;

  // Expand by default if the field already has rules — the user almost
  // certainly wants to see them. Otherwise start collapsed so the drawer
  // doesn't grow visually for every field.
  const [expanded, setExpanded] = useState(hasRules);

  const watchable = useMemo(
    () => getWatchableFields(currentField.id, allFields),
    [currentField.id, allFields],
  );

  function setRules(rules: VisibilityRule[]) {
    if (rules.length === 0) {
      onChange(undefined);
    } else {
      onChange({ rules });
    }
  }

  function addRule() {
    // Default to the first watchable field with an `equals` rule. If there's
    // nothing watchable, do nothing (the button shouldn't be reachable).
    const first = watchable[0];
    if (!first) return;
    const op: VisibilityOperator = isTruthyOnlyType(first.type)
      ? 'is_truthy'
      : 'equals';
    const next: VisibilityRule = {
      fieldId: first.id,
      operator: op,
      value: defaultValueForField(first),
    };
    setRules([...(config?.rules ?? []), next]);
  }

  function updateRule(idx: number, patch: Partial<VisibilityRule>) {
    const rules = (config?.rules ?? []).map((r, i) =>
      i === idx ? { ...r, ...patch } : r,
    );
    setRules(rules);
  }

  function removeRule(idx: number) {
    const rules = (config?.rules ?? []).filter((_, i) => i !== idx);
    setRules(rules);
  }

  function toggleAlwaysVisible(alwaysVisible: boolean) {
    if (alwaysVisible) {
      // Switching back to always-visible clears the rules entirely.
      onChange(undefined);
    } else {
      // Off → expand and seed an initial rule if possible.
      if (watchable.length > 0 && (config?.rules.length ?? 0) === 0) {
        const first = watchable[0];
        if (first) {
          const op: VisibilityOperator = isTruthyOnlyType(first.type)
            ? 'is_truthy'
            : 'equals';
          onChange({
            rules: [
              {
                fieldId: first.id,
                operator: op,
                value: defaultValueForField(first),
              },
            ],
          });
        }
      } else {
        onChange({ rules: config?.rules ?? [] });
      }
      setExpanded(true);
    }
  }

  // When the user changes the watched field, the previously selected
  // operator + value might not be valid for the new type. Reset both.
  function changeRuleField(idx: number, newFieldId: string) {
    const newWatched = allFields.find((f) => f.id === newFieldId);
    if (!newWatched) return;
    const op: VisibilityOperator = isTruthyOnlyType(newWatched.type)
      ? 'is_truthy'
      : 'equals';
    updateRule(idx, {
      fieldId: newFieldId,
      operator: op,
      value: defaultValueForField(newWatched),
    });
  }

  const rules = config?.rules ?? [];
  const alwaysVisible = !config || rules.length === 0;

  return (
    <div className="flex flex-col gap-s3 rounded-md border border-surface-3 bg-surface-2/40 px-s4 py-s3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex items-center justify-between gap-s2',
          'text-left t-label text-ink',
          'focus-visible:outline-none focus-visible:shadow-focus',
        )}
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-s2">
          Conditional visibility
          {hasRules ? (
            <span className="inline-flex rounded-sm bg-accent-pale px-s2 py-[2px] t-caption text-accent">
              {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden
          className={cn(
            'text-ink-soft transition-transform duration-fast',
            expanded ? 'rotate-180' : '',
          )}
        >
          <ChevronIcon />
        </span>
      </button>

      {expanded ? (
        <div className="flex flex-col gap-s3">
          <label className="flex cursor-pointer items-center gap-s2 t-body-sm text-ink">
            <input
              type="checkbox"
              checked={alwaysVisible}
              onChange={(e) => toggleAlwaysVisible(e.target.checked)}
              className="h-4 w-4 accent-sage-deep"
            />
            <span>Always visible</span>
          </label>

          {!alwaysVisible ? (
            <>
              {watchable.length === 0 ? (
                <p className="rounded-md border border-dashed border-surface-3 bg-white/60 px-s3 py-s3 t-caption text-ink-soft">
                  Add another field to this form before creating a rule.
                </p>
              ) : null}

              {rules.length === 0 && watchable.length > 0 ? (
                <p className="t-caption text-ink-soft">
                  Add a rule to make this field conditional.
                </p>
              ) : null}

              <ul className="flex flex-col gap-s3">
                {rules.map((rule, idx) => (
                  <li key={idx}>
                    <RuleRow
                      rule={rule}
                      allFields={allFields}
                      watchable={watchable}
                      onChangeField={(id) => changeRuleField(idx, id)}
                      onChangeOperator={(op) => updateRule(idx, { operator: op })}
                      onChangeValue={(v) => updateRule(idx, { value: v })}
                      onRemove={() => removeRule(idx)}
                    />
                  </li>
                ))}
              </ul>

              {watchable.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addRule}
                  className="self-start"
                >
                  + Add rule (AND)
                </Button>
              ) : null}

              {rules.length > 1 ? (
                <p className="t-caption text-ink-soft">
                  All rules must match for this field to show.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// One rule row: [Field] [Operator] [Value] [×]. The value widget swaps based
// on the watched field's type so the user picks from real options instead of
// typing raw strings.
function RuleRow({
  rule,
  allFields,
  watchable,
  onChangeField,
  onChangeOperator,
  onChangeValue,
  onRemove,
}: {
  rule: VisibilityRule;
  allFields: FormFieldT[];
  watchable: FormFieldT[];
  onChangeField: (id: string) => void;
  onChangeOperator: (op: VisibilityOperator) => void;
  onChangeValue: (v: VisibilityRule['value']) => void;
  onRemove: () => void;
}) {
  // The watched field may have been deleted from the form. Surface that as
  // a warning row with a remove button — orphan rules are silently ignored
  // at evaluation time but should not stay hidden in the editor.
  const watched = allFields.find((f) => f.id === rule.fieldId);

  if (!watched) {
    return (
      <div className="flex items-start justify-between gap-s2 rounded-md border border-amber bg-amber-pale/40 px-s3 py-s2">
        <span className="t-caption text-ink">
          Rule references a deleted field.
        </span>
        <button
          type="button"
          aria-label="Remove rule"
          onClick={onRemove}
          className={cn(
            'shrink-0 rounded-md p-s1 text-ink-soft',
            'hover:bg-red-pale hover:text-red',
            'focus-visible:outline-none focus-visible:shadow-focus',
          )}
        >
          <TrashIcon size={14} />
        </button>
      </div>
    );
  }

  const ops = operatorsForFieldType(watched.type);
  const opMeta = VISIBILITY_OPERATORS[rule.operator];
  const showValueInput = opMeta?.requiresValue ?? false;

  return (
    <div className="flex flex-col gap-s2 rounded-md border border-surface-3 bg-white px-s3 py-s3">
      <FormField label="When">
        <Select
          value={rule.fieldId}
          onChange={(e) => onChangeField(e.target.value)}
        >
          {watchable.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label || 'Untitled field'} ({FIELD_TYPE_LABELS[f.type]})
            </option>
          ))}
          {/* If `rule.fieldId` no longer matches a watchable field (e.g. it
              was excluded because of a fresh cycle), keep it as a fallback
              so the select doesn't render with a phantom value. */}
          {!watchable.some((f) => f.id === rule.fieldId) ? (
            <option value={rule.fieldId}>
              {watched.label || 'Untitled field'} ({FIELD_TYPE_LABELS[watched.type]})
            </option>
          ) : null}
        </Select>
      </FormField>

      <div className="grid grid-cols-[1fr_auto] items-end gap-s2">
        <FormField label="Condition">
          <Select
            value={rule.operator}
            onChange={(e) => onChangeOperator(e.target.value as VisibilityOperator)}
          >
            {ops.map((op) => {
              const meta = VISIBILITY_OPERATORS[op];
              return (
                <option key={op} value={op}>
                  {meta.label}
                </option>
              );
            })}
          </Select>
        </FormField>
        <button
          type="button"
          aria-label="Remove rule"
          onClick={onRemove}
          className={cn(
            'mb-[6px] shrink-0 rounded-md p-s2 text-ink-soft',
            'hover:bg-red-pale hover:text-red',
            'focus-visible:outline-none focus-visible:shadow-focus',
          )}
        >
          <TrashIcon size={16} />
        </button>
      </div>

      {showValueInput ? (
        <FormField label="Value">
          <RuleValueInput
            watched={watched}
            value={rule.value}
            onChange={onChangeValue}
          />
        </FormField>
      ) : null}
    </div>
  );
}

// Adapts the value-input widget to the watched field's type. For options-
// based fields, this is a Select of the watched field's options; for yes_no
// it's a yes/no select; for number it's a number input; etc.
function RuleValueInput({
  watched,
  value,
  onChange,
}: {
  watched: FormFieldT;
  value: VisibilityRule['value'];
  onChange: (v: VisibilityRule['value']) => void;
}) {
  switch (watched.type) {
    case 'yes_no':
      return (
        <Select
          value={value === true || value === 'yes' ? 'yes' : 'no'}
          onChange={(e) => onChange(e.target.value === 'yes' ? 'yes' : 'no')}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      );
    case 'checkbox':
      return (
        <Select
          value={value === true || value === 'true' ? 'true' : 'false'}
          onChange={(e) => onChange(e.target.value === 'true')}
        >
          <option value="true">Checked</option>
          <option value="false">Unchecked</option>
        </Select>
      );
    case 'dropdown':
    case 'radio':
    case 'multi_select': {
      const opts = watched.options ?? [];
      return (
        <Select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          {opts.length === 0 ? <option value="">(no options)</option> : null}
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label || o.value}
            </option>
          ))}
        </Select>
      );
    }
    case 'number':
    case 'rating':
    case 'pain_scale':
      return (
        <Input
          type="number"
          value={
            value === undefined || value === null
              ? ''
              : typeof value === 'number'
              ? value
              : String(value)
          }
          onChange={(e) =>
            onChange(e.target.value === '' ? '' : Number(e.target.value))
          }
        />
      );
    case 'date':
      return (
        <Input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <Input
          type="text"
          value={typeof value === 'string' ? value : value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

// Seed a sensible initial `value` for a freshly-added rule based on the
// watched field's type.
function defaultValueForField(field: FormFieldT): VisibilityRule['value'] {
  switch (field.type) {
    case 'yes_no':
      return 'yes';
    case 'checkbox':
      return true;
    case 'dropdown':
    case 'radio':
    case 'multi_select': {
      const first = field.options?.[0];
      return first ? first.value : '';
    }
    case 'number':
    case 'rating':
    case 'pain_scale':
      return 0;
    case 'date':
      return '';
    case 'file_upload':
    case 'image_upload':
    case 'signature':
      return undefined;
    default:
      return '';
  }
}

function ChevronIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
