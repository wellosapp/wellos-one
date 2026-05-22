'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

// Collapse / expand wrapper around the 6 address inputs ClientForm renders
// inside. Default collapsed; click the composed-address row to expand to the
// full editor; blur out of the editor (focus moves anywhere else on the page)
// to collapse back. The 6 inputs preserve their original `name` attributes
// so submission is unchanged.
//
// Sibling-folder placement (not under `[id]/_components/`) is intentional —
// ClientForm is shared with `/admin/clients/new`, so this component is too.

export function MailingAddressField({
  composedAddress,
  defaultExpanded = false,
  children,
}: {
  composedAddress: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // When the user blurs out of the entire expanded editor (focus moves to an
  // element outside the wrapper), collapse back. Using `focusout` + a
  // `relatedTarget`-not-in-wrapper check ensures internal focus shuffles
  // between the 6 inputs don't trigger a collapse mid-edit.
  useEffect(() => {
    if (!expanded) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    function onFocusOut(e: FocusEvent) {
      const next = e.relatedTarget as Node | null;
      // Empty relatedTarget means focus left to the body (e.g. click on
      // empty page area). Either way, collapse.
      if (!next || (wrapper && !wrapper.contains(next))) {
        setExpanded(false);
      }
    }
    wrapper.addEventListener('focusout', onFocusOut);
    return () => wrapper.removeEventListener('focusout', onFocusOut);
  }, [expanded]);

  // Move focus to the first input when we expand, so the user can immediately
  // start editing.
  useEffect(() => {
    if (!expanded) return;
    const first = wrapperRef.current?.querySelector<HTMLInputElement>('input');
    first?.focus();
  }, [expanded]);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'flex flex-col gap-s2',
        // Grid-aware: when the field sits inside a 2-col form grid, the
        // collapsed state stays in its own column (single cell); the expanded
        // state takes the full row so the 6-input editor has room.
        expanded ? 'md:col-span-2' : undefined,
      )}
    >
      <label className="t-body-sm font-medium text-ink-2">Mailing address</label>
      {!expanded ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            'group flex w-full items-center justify-between rounded-md border-[1.5px] border-surface-3 bg-white',
            'px-s4 py-[13px] text-left text-[16px] text-ink cursor-pointer',
            'transition-colors duration-fast hover:border-accent',
            'focus-visible:outline-none focus-visible:shadow-focus',
          )}
        >
          <span className="truncate">{composedAddress}</span>
          <span
            aria-hidden
            className="ml-s3 shrink-0 t-caption text-ink-4 group-hover:text-sage-deep"
          >
            Edit
          </span>
        </button>
      ) : (
        <div className="flex flex-col gap-s3">{children}</div>
      )}
    </div>
  );
}
