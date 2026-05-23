'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

import { CheckIcon, RefreshIcon } from '@/app/admin/_shell/icons';

// Auto-save indicator + Revert + Save changes row. Mounted below the
// Overview's Contact/Emergency form. Targets the form by id via the native
// `form="<id>"` attribute on the submit/reset buttons, so this component
// doesn't need to be a child of the form.
//
// Dirty-state tracking: looks up the form by id once mounted, listens for
// `input` / `change` to flip dirty=true, and resets to false on submit /
// reset. Until any edit, both buttons are disabled.

export function SectionSaveFooter({
  formId,
  className,
}: {
  formId: string;
  className?: string;
}) {
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;

    const onEdit = () => setDirty(true);
    const onReset = () => setDirty(false);
    const onSubmit = () => setDirty(false);

    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);
    form.addEventListener('reset', onReset);
    form.addEventListener('submit', onSubmit);
    return () => {
      form.removeEventListener('input', onEdit);
      form.removeEventListener('change', onEdit);
      form.removeEventListener('reset', onReset);
      form.removeEventListener('submit', onSubmit);
    };
  }, [formId]);

  return (
    <section
      className={cn(
        'flex flex-wrap items-center gap-s3 rounded-md border border-line bg-surface',
        'px-s6 py-s4 shadow-sm lg:px-s8',
        className,
      )}
    >
      <span className="inline-flex items-center gap-s2 text-[12.5px] text-ink-3">
        <CheckIcon size={14} />
        All changes auto-save
      </span>
      <span className="ml-auto inline-flex items-center gap-s2">
        <button
          type="reset"
          form={formId}
          disabled={!dirty}
          className={cn(
            'inline-flex items-center gap-s2 rounded-sm border border-line bg-surface',
            'px-s4 py-s2 text-[13px] font-medium text-ink-2',
            'transition-colors duration-fast',
            dirty
              ? 'hover:bg-surface-2 cursor-pointer'
              : 'opacity-50 cursor-not-allowed',
          )}
        >
          <RefreshIcon size={14} />
          Revert
        </button>
        <button
          type="submit"
          form={formId}
          disabled={!dirty}
          className={cn(
            'inline-flex items-center gap-s2 rounded-full',
            'bg-accent px-s5 py-s2 text-[13px] font-semibold text-ink-inv',
            'transition-colors duration-fast',
            dirty
              ? 'hover:bg-sage-deep cursor-pointer'
              : 'opacity-50 cursor-not-allowed',
          )}
        >
          <CheckIcon size={14} />
          Save changes
        </button>
      </span>
    </section>
  );
}
