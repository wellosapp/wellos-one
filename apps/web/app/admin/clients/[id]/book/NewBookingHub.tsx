import Link from 'next/link';
import type { Route } from 'next';

import { CalendarIcon, PlusIcon } from '@/app/admin/_shell/icons';
import { cn } from '@/lib/cn';

// Footer "Quick Book" CTA on the Book tab. Renders the standard section card
// chrome (eyebrow + headline) and a single sage primary pill Link that
// flips `?quickbook=1` on the URL. The parent ClientDetailShell watches that
// param and mounts the existing ClientQuickBookDrawer — this component
// itself does not own any state.
//
// Originally a client component with an expand/collapse + inline drawer
// mount; simplified to a server component per the approved plan (the
// secondary-action role of this surface no longer warrants the inline-form
// pattern).

export function NewBookingHub({
  clientId,
  preserveQuery,
}: {
  clientId: string;
  preserveQuery?: Record<string, string | undefined>;
}) {
  const params = new URLSearchParams();
  if (preserveQuery) {
    for (const [k, v] of Object.entries(preserveQuery)) {
      if (typeof v === 'string' && v.length > 0) params.set(k, v);
    }
  }
  params.set('quickbook', '1');
  const href =
    `/admin/clients/${clientId}/book?${params.toString()}` as Route;

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
        <div className="flex items-center gap-s2 t-eyebrow tracking-wide text-sage">
          <CalendarIcon size={14} />
          <span>BOOK NEW</span>
        </div>
        <h2 className="mt-s2 font-display text-[22px] leading-tight text-ink">
          Need to book another?
        </h2>
      </header>
      <div className="px-s6 py-s5 lg:px-s8 lg:py-s6">
        <Link
          href={href}
          className={cn(
            'inline-flex items-center gap-s2 rounded-full bg-accent px-s5 py-s2',
            'text-[13px] font-semibold text-ink-inv no-underline',
            'transition-colors duration-fast hover:bg-sage-deep',
          )}
        >
          <PlusIcon size={14} />
          Quick book a new appointment
        </Link>
      </div>
    </section>
  );
}
