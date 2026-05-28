'use client';

import { useRef } from 'react';

import { Input } from '@/components/ui';
import { cn } from '@/lib/cn';

import { findPaletteItem } from '../paletteCatalog';
import { VariablePicker } from './VariablePicker';

// Action node form — PR 8 ships a generic key/value config editor. Per-
// handler bespoke forms (e.g. a tag picker that lists the tenant's actual
// tags) land alongside the handler PRs (14-16). Until then, this lets the
// user author config and templates so the action types in the palette
// aren't dead surfaces.
//
// Variable substitution: text values containing `{{path}}` get resolved at
// handler dispatch time. The substitution layer lives in the engine and
// will be wired in PR 14 when the first handler that uses it ships. For
// now, authoring works — the values just sit verbatim in node.data.config.

interface FormData {
  actionType?: string;
  config?: Record<string, unknown>;
}

interface Props {
  data: FormData;
  onChange: (next: FormData) => void;
  triggerType: string;
  disabled?: boolean;
}

export function ActionForm({ data, onChange, triggerType, disabled }: Props) {
  const actionType = data.actionType ?? '';
  const config = data.config ?? {};
  const entries = Object.entries(config);
  const actionLabel =
    findPaletteItem(`action.${actionType}`)?.label ?? actionType;

  const setEntry = (key: string, value: unknown, oldKey?: string) => {
    const next: Record<string, unknown> = { ...config };
    if (oldKey && oldKey !== key) delete next[oldKey];
    if (key === '') {
      if (oldKey) delete next[oldKey];
    } else {
      next[key] = value;
    }
    onChange({ ...data, config: next });
  };

  const removeEntry = (key: string) => {
    const next = { ...config };
    delete next[key];
    onChange({ ...data, config: next });
  };

  const addEntry = () => {
    onChange({ ...data, config: { ...config, '': '' } });
  };

  return (
    <div className="flex flex-col gap-s4">
      <div className="flex flex-col gap-s1">
        <span className="t-caption text-ink-soft">Action</span>
        <div className="t-body-md text-ink">{actionLabel}</div>
        <p className="t-caption text-ink-soft">
          The handler for this action isn&apos;t wired yet. You can still
          configure its fields — they apply when the handler ships.
        </p>
      </div>

      <div className="flex flex-col gap-s2">
        <div className="flex items-center justify-between">
          <span className="t-caption text-ink-soft">Config</span>
          <button
            type="button"
            onClick={addEntry}
            disabled={disabled}
            className={cn(
              't-caption text-accent no-underline hover:underline',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            + Add field
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="t-caption text-ink-soft">No fields configured.</p>
        ) : (
          <ul className="flex flex-col gap-s2">
            {entries.map(([key, value], index) => (
              <li key={`${key}-${index}`}>
                <ConfigRow
                  triggerType={triggerType}
                  fieldKey={key}
                  value={value}
                  onChange={(k, v) => setEntry(k, v, key)}
                  onRemove={() => removeEntry(key)}
                  disabled={disabled}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConfigRow({
  triggerType,
  fieldKey,
  value,
  onChange,
  onRemove,
  disabled,
}: {
  triggerType: string;
  fieldKey: string;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const valueRef = useRef<HTMLInputElement | null>(null);
  const stringValue =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);

  const onInsert = (template: string) => {
    const el = valueRef.current;
    const current = stringValue;
    if (!el) {
      onChange(fieldKey, current + template);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + template + current.slice(end);
    onChange(fieldKey, next);
    // Restore focus + caret after insert.
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + template.length;
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="grid grid-cols-[160px_1fr_auto_auto] gap-s2">
      <Input
        value={fieldKey}
        onChange={(e) => onChange(e.target.value, value)}
        placeholder="key"
        disabled={disabled}
        aria-label="Config field name"
      />
      <Input
        ref={valueRef}
        value={stringValue}
        onChange={(e) => onChange(fieldKey, e.target.value)}
        placeholder="value (supports {{variables}})"
        disabled={disabled}
        aria-label="Config field value"
      />
      <VariablePicker
        triggerType={triggerType}
        onPick={onInsert}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove field"
        className={cn(
          't-body-sm text-ink-soft hover:text-red px-s1',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        ✕
      </button>
    </div>
  );
}
