import type { ComponentType, ReactNode } from 'react';

import { cn } from '@/lib/cn';

// Reusable section card wrapper for the Book tab — header strip (icon +
// eyebrow + count chip) and body (the row list, or an italic empty state).
// Used twice on /admin/clients/[id]/book — once for Upcoming, once for Past.

type IconComponent = ComponentType<{ size?: number; className?: string }>;

export function AppointmentsSection({
  icon: IconCmp,
  eyebrow,
  count,
  emptyState,
  children,
}: {
  icon: IconComponent;
  eyebrow: string;
  count: number;
  emptyState: string;
  children: ReactNode;
}) {
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
          <IconCmp size={14} />
          <span>{eyebrow}</span>
          <span
            className={cn(
              'rounded-full bg-surface-sunk px-s2 py-[1px] text-[11px]',
              'font-medium normal-case tracking-normal text-ink-3',
            )}
          >
            {count}
          </span>
        </div>
      </header>
      <div className="px-s6 py-s5 lg:px-s8 lg:py-s6">
        {count === 0 ? (
          <p className="t-body-md italic text-ink-3">{emptyState}</p>
        ) : (
          <div className="flex flex-col gap-s4">{children}</div>
        )}
      </div>
    </section>
  );
}
