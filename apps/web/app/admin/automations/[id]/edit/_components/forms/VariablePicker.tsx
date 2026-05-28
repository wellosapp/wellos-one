'use client';

import { useId, useState } from 'react';

import { cn } from '@/lib/cn';

import { fieldGroupsForTrigger } from './fieldCatalog';

// Tiny "Insert variable" dropdown for use next to text inputs in action
// config forms. Emits a Handlebars-style placeholder ({{path}}) — the
// runtime template substitution lives outside PR 8's scope (it'll land
// alongside the Phase D action handlers, which is where templates actually
// get resolved before dispatch).
//
// The picker is a popover anchored to the trigger button. PR 8 uses a
// click-outside listener + escape-key handler — Radix migration is a future
// design-system pass (mirrors the Select-as-native note in components/ui).

interface Props {
  triggerType: string;
  onPick: (template: string) => void;
  disabled?: boolean;
  className?: string;
}

export function VariablePicker({ triggerType, onPick, disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const buttonId = useId();
  const groups = fieldGroupsForTrigger(triggerType);

  return (
    <div className={cn('relative inline-block', className)}>
      <button
        id={buttonId}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center rounded-sm border border-surface-3 bg-white px-s2 py-s1',
          't-caption text-ink-soft no-underline hover:bg-surface-1',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        Insert variable
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close variable picker"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 bg-transparent"
          />
          <div
            role="listbox"
            aria-labelledby={buttonId}
            className={cn(
              'absolute right-0 z-20 mt-s1 max-h-[260px] w-[260px] overflow-y-auto',
              'rounded-md border border-surface-3 bg-white shadow-md',
            )}
          >
            {groups.map((g) => (
              <div key={g.label} className="border-b border-surface-3 py-s2 last:border-b-0">
                <div className="px-s3 t-eyebrow text-ink-soft">{g.label}</div>
                <ul>
                  {g.fields.map((f) => (
                    <li key={f.path}>
                      <button
                        type="button"
                        onClick={() => {
                          onPick(`{{${f.path}}}`);
                          setOpen(false);
                        }}
                        className="w-full px-s3 py-s1 text-left t-body-sm text-ink hover:bg-surface-1"
                      >
                        <span>{f.label}</span>
                        <span className="ml-s2 t-caption text-ink-soft">
                          {f.path}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
