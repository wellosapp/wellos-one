'use client';

import { cn } from '@/lib/cn';

import {
  FIELD_TYPES,
  FIELD_TYPE_DESCRIPTIONS,
  FIELD_TYPE_LABELS,
  type FieldType,
} from '../_schema-utils';

import { FIELD_TYPE_ICONS } from './_icons';

type Props = {
  onAdd: (type: FieldType) => void;
  disabled?: boolean;
};

// Sticky left-side palette listing all 16 field types. Clicking one calls
// `onAdd` — the parent decides which section the new field lands in.
export function FieldTypePalette({ onAdd, disabled }: Props) {
  return (
    <aside
      aria-label="Field types"
      className="rounded-lg border border-surface-3 bg-white shadow-sm"
    >
      <header className="border-b border-surface-3 px-s4 py-s3">
        <span className="t-eyebrow text-accent">Field types</span>
        <p className="mt-s1 t-caption text-ink-soft">
          Click a type to add it to the canvas.
        </p>
      </header>
      <ul className="flex flex-col gap-s2 p-s3">
        {FIELD_TYPES.map((t) => {
          const Icon = FIELD_TYPE_ICONS[t];
          return (
            <li key={t}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAdd(t)}
                className={cn(
                  'flex w-full items-start gap-s3 rounded-md border border-transparent bg-white px-s3 py-s2 text-left',
                  'transition-colors duration-fast',
                  'hover:border-sage hover:bg-sage-tint/50',
                  'focus-visible:outline-none focus-visible:shadow-focus',
                  disabled && 'opacity-50 cursor-not-allowed',
                )}
              >
                <span className="mt-[2px] text-ink-soft">
                  <Icon size={18} />
                </span>
                <span className="flex min-w-0 flex-col gap-[2px]">
                  <span className="t-body-sm font-medium text-ink">
                    {FIELD_TYPE_LABELS[t]}
                  </span>
                  <span className="t-caption text-ink-soft">
                    {FIELD_TYPE_DESCRIPTIONS[t]}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
