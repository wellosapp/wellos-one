'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { cn } from '@/lib/cn';
import { buildCalendarUrl, type CalendarViewMode } from '@/lib/calendar-view';

type Surface = 'admin' | 'staff' | 'book';

interface CalendarViewToggleProps {
  surface: Surface;
  dateParam: string;
  active: CalendarViewMode;
  /** Preserve quickbook when switching views on admin/staff calendar. */
  quickBookOpen?: boolean;
  /** Preserve block time panel on admin calendar. */
  blockTimeOpen?: boolean;
}

const MODES: CalendarViewMode[] = ['month', 'week', 'day'];

const LABELS: Record<CalendarViewMode, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

export function CalendarViewToggle({
  surface,
  dateParam,
  active,
  quickBookOpen,
  blockTimeOpen,
}: CalendarViewToggleProps) {
  const qb = quickBookOpen ? '1' : undefined;
  const bt = blockTimeOpen ? '1' : undefined;
  const base =
    surface === 'admin'
      ? '/admin/calendar'
      : surface === 'staff'
        ? '/staff/schedule'
        : '/book';

  return (
    <div
      role="tablist"
      aria-label="Calendar scope"
      className="inline-flex rounded-md border border-surface-3 bg-white p-[2px] shadow-sm"
    >
      {MODES.map((mode) => {
        const isActive = active === mode;
        const href = buildCalendarUrl(base, {
          date: dateParam,
          view: mode,
          quickbook: qb,
          blocktime: bt,
        });
        return (
          <Link
            key={mode}
            href={href as Route}
            role="tab"
            aria-selected={isActive}
            className={cn(
              'rounded-md px-s4 py-s2 t-body-sm font-semibold no-underline transition-colors duration-fast',
              isActive
                ? 'bg-accent text-white'
                : 'text-ink-soft hover:bg-surface-2 hover:text-ink',
            )}
          >
            {LABELS[mode]}
          </Link>
        );
      })}
    </div>
  );
}
