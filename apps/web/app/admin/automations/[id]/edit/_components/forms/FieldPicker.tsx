'use client';

import { Select } from '@/components/ui';

import { fieldGroupsForTrigger } from './fieldCatalog';

// Dotted-path field picker. Renders a native <select> with one <optgroup>
// per FieldGroup. PR 8 — used by ConditionGroupBuilder and (eventually) the
// per-action config forms.

interface Props {
  triggerType: string;
  value: string;
  onChange: (path: string) => void;
  disabled?: boolean;
  /** When true, prepends an empty "Select a field…" option. */
  withEmpty?: boolean;
}

export function FieldPicker({
  triggerType,
  value,
  onChange,
  disabled,
  withEmpty,
}: Props) {
  const groups = fieldGroupsForTrigger(triggerType);
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Field"
    >
      {withEmpty ? <option value="">Select a field…</option> : null}
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.fields.map((f) => (
            <option key={f.path} value={f.path}>
              {f.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
