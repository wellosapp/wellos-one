'use client';

import { useState } from 'react';

import { CalendarIcon } from '@/app/admin/_shell/icons';
import {
  ClientQuickBookDrawer,
  type ClientQuickBookSummary,
} from '../ClientQuickBookDrawer';
import type { ClientQuickBookDirectory } from '../ClientDetailShell';
import { cn } from '@/lib/cn';

// "Book new" hub. Collapsed by default — renders the section header chrome
// plus a sage primary pill CTA. When expanded, the existing
// ClientQuickBookDrawer is mounted in `mode="inline"` directly below the
// header so the existing 4-step UI + sticky summary footer flow is reused
// without modification.
//
// Marked `'use client'` because of the local expand/collapse state. The
// drawer is also a client component, so this is the natural boundary.

export function NewBookingHub({
  summary,
  directory,
  directoryError,
}: {
  summary: ClientQuickBookSummary;
  directory: ClientQuickBookDirectory;
  directoryError: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
      )}
    >
      <header
        className={cn(
          'border-b border-line bg-surface-sunk/40',
          'px-s6 py-s5 lg:px-s8 lg:py-s6',
        )}
      >
        <div className="flex items-start justify-between gap-s4">
          <div className="min-w-0">
            <div className="flex items-center gap-s2 t-eyebrow tracking-wide text-sage">
              <CalendarIcon size={14} />
              <span>BOOK NEW</span>
            </div>
            <h2 className="mt-s2 font-display text-[22px] leading-tight text-ink">
              Book a new appointment for {summary.firstName}.
            </h2>
            <p className="mt-s2 max-w-2xl t-body-md leading-relaxed text-ink-3">
              Service · Staff · Date · Time · Notes. Prefilled with this
              client&apos;s info.
            </p>
          </div>
          {expanded && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className={cn(
                'shrink-0 rounded-full border border-line bg-surface px-s4 py-s2',
                't-body-sm text-ink-3 hover:bg-surface-2 hover:text-ink',
              )}
            >
              Collapse
            </button>
          )}
        </div>
      </header>
      <div className="px-s6 py-s5 lg:px-s8 lg:py-s6">
        {!expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={cn(
              'inline-flex items-center gap-s2 rounded-full bg-accent px-s5 py-s2',
              'text-[13px] font-semibold text-ink-inv',
              'transition-colors duration-fast hover:bg-sage-deep',
            )}
          >
            + Book new appointment
          </button>
        ) : (
          <ClientQuickBookDrawer
            mode="inline"
            open
            onClose={() => setExpanded(false)}
            client={summary}
            services={directory.services}
            staff={directory.staff}
            locations={directory.locations}
            directoryError={directoryError}
          />
        )}
      </div>
    </section>
  );
}
