'use client';

import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

// Collapse/expand wrapper around the 6 mailing-address inputs. When
// collapsed, displays a single read-only-looking summary input showing
// `composedAddress`. On click/focus the summary swaps for the actual 6
// field inputs (passed as `children`). The children's `name` attributes
// stay intact, so FormData submission still posts all 6 individually —
// the schema doesn't change.

export function MailingAddressField({
  children,
  composedAddress,
  expanded: initialExpanded = false,
}: {
  children: ReactNode;
  composedAddress: string;
  expanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);

  if (expanded) {
    return (
      <div className="flex flex-col gap-s3">
        <div className="flex items-center justify-between gap-s3">
          <span className="t-eyebrow text-ink-soft">Mailing address</span>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className={cn(
              't-body-sm text-sage-deep no-underline',
              'hover:underline cursor-pointer',
            )}
          >
            Collapse
          </button>
        </div>
        <div className="flex flex-col gap-s3">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-s2">
      <label className="t-caption text-ink-soft font-sans">
        Mailing address
      </label>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(
          'w-full rounded-md border border-line bg-surface px-s4 py-s3 text-left',
          't-body-md text-ink',
          'hover:border-sage-soft hover:bg-sage-tint-2/40',
          'cursor-text transition-colors duration-fast',
          composedAddress === 'No address on file.' && 'text-ink-3 italic',
        )}
      >
        {composedAddress}
      </button>
    </div>
  );
}
