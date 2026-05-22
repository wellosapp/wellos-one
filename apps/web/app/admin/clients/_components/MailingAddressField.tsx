'use client';

import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

// Collapse / expand wrapper around the 6 address inputs ClientForm renders
// inside. Default collapsed; click the composed-address row to expand to the
// full editor; click "Collapse" to fold back up. The 6 inputs preserve their
// original `name` attributes so submission is unchanged.
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

  return (
    <div className="flex flex-col gap-s2">
      <label className="t-body-sm font-medium text-ink-2">Mailing address</label>
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            'group flex w-full items-center justify-between rounded-sm border border-line bg-surface',
            'px-s3 py-s2 text-left t-body-md text-ink-2 cursor-pointer',
            'transition-colors duration-fast hover:border-sage hover:bg-surface-2',
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
        <div className="flex flex-col gap-s3 rounded-sm border border-line bg-surface px-s3 py-s3">
          {children}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className={cn(
                't-caption text-ink-3 underline-offset-2 hover:text-sage-deep hover:underline',
              )}
            >
              Collapse
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
