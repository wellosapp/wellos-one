import Link from 'next/link';
import type { Route } from 'next';

import { cn } from '@/lib/cn';

// Phase 3b — tab nav between the services-side public booking flow and the
// new classes-side flow. URL state `?type=` is the single source of truth.
// Server component (no client interaction) — Link handles the navigation.

type Props = {
  activeType: 'services' | 'classes';
  tenantSlug: string;
};

function buildHref(type: 'services' | 'classes', tenantSlug: string): string {
  const params = new URLSearchParams();
  params.set('type', type);
  if (tenantSlug) params.set('tenant', tenantSlug);
  return `/book?${params.toString()}`;
}

export function BookPageTabs({ activeType, tenantSlug }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Booking type"
      className="flex border-b border-surface-3"
    >
      <Link
        href={buildHref('services', tenantSlug) as Route}
        role="tab"
        aria-selected={activeType === 'services'}
        className={cn(
          'px-s5 py-s3 t-body-md font-medium no-underline transition-colors duration-fast',
          activeType === 'services'
            ? 'border-b-2 border-accent text-accent'
            : 'border-b-2 border-transparent text-ink-soft hover:text-ink',
        )}
      >
        Services
      </Link>
      <Link
        href={buildHref('classes', tenantSlug) as Route}
        role="tab"
        aria-selected={activeType === 'classes'}
        className={cn(
          'px-s5 py-s3 t-body-md font-medium no-underline transition-colors duration-fast',
          activeType === 'classes'
            ? 'border-b-2 border-accent text-accent'
            : 'border-b-2 border-transparent text-ink-soft hover:text-ink',
        )}
      >
        Classes
      </Link>
    </div>
  );
}
