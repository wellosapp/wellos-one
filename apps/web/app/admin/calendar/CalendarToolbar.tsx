'use client';

import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui';
import { addDays, formatDateShort, isToday } from '@/lib/calendar';
import type { CalendarViewMode } from '@/lib/calendar-view';

import { CalendarViewToggle } from './CalendarViewToggle';

export interface CalendarToolbarProps {
  date: Date;
  view: CalendarViewMode;
  dateParam: string;
  periodTitle: string;
  prevNav: string;
  nextNav: string;
  jumpTodayNav: string;
  dayJumpPrev: string;
  dayJumpNext: string;
  hrefQuickBook: string;
  quickBookOpen: boolean;
  hrefOpenBlockTime: string;
  hrefCloseBlockTime: string;
  blockTimeOpen: boolean;
}

/**
 * R2 "CalendarToolbar" — period navigation, view toggle, Quick Book entry.
 * URL state is built by the parent (`buildCalendarUrl` + `useMemo` hrefs).
 */
export function CalendarToolbar({
  date,
  view,
  dateParam,
  periodTitle,
  prevNav,
  nextNav,
  jumpTodayNav,
  dayJumpPrev,
  dayJumpNext,
  hrefQuickBook,
  quickBookOpen,
  hrefOpenBlockTime,
  hrefCloseBlockTime,
  blockTimeOpen,
}: CalendarToolbarProps) {
  const todayBadge: ReactNode =
    view === 'day' && isToday(date) ? (
      <span className="font-display italic text-ink-3">Today&rsquo;s</span>
    ) : null;

  return (
    <header className="flex flex-col gap-s4 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-s2">
        <div className="flex items-center gap-s2">
          <span
            aria-hidden="true"
            className="inline-block h-[6px] w-[6px] rounded-full bg-sage"
          />
          <span className="t-eyebrow text-ink-3">Calendar</span>
        </div>
        <h1 className="flex flex-wrap items-baseline gap-s2 font-display text-[28px] font-medium leading-tight tracking-[-0.01em] text-ink">
          {todayBadge}
          <span>{periodTitle}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-s2">
          <Link href={prevNav as Route} className="no-underline">
            <Button variant="ghost" size="sm">
              {view === 'day' && <>&larr; {formatDateShort(addDays(date, -1))}</>}
              {view === 'week' && <>&larr; Previous week</>}
              {view === 'month' && <>&larr; Previous month</>}
            </Button>
          </Link>
          <Link href={jumpTodayNav as Route} className="no-underline">
            <Button variant="ghost" size="sm">
              {view === 'month'
                ? 'This month'
                : view === 'week'
                  ? 'This week'
                  : 'Today'}
            </Button>
          </Link>
          <Link href={nextNav as Route} className="no-underline">
            <Button variant="ghost" size="sm">
              {view === 'day' && <>{formatDateShort(addDays(date, +1))} &rarr;</>}
              {view === 'week' && <>Next week &rarr;</>}
              {view === 'month' && <>Next month &rarr;</>}
            </Button>
          </Link>
          {view !== 'day' && (
            <>
              <span className="text-ink-4">·</span>
              <Link href={dayJumpPrev as Route} className="no-underline">
                <Button variant="ghost" size="sm">
                  Day &larr;
                </Button>
              </Link>
              <Link href={dayJumpNext as Route} className="no-underline">
                <Button variant="ghost" size="sm">
                  Day &rarr;
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-s2">
        <CalendarViewToggle
          surface="admin"
          dateParam={dateParam}
          active={view}
          quickBookOpen={quickBookOpen}
          blockTimeOpen={blockTimeOpen}
        />

        {/* Static filter chips — wire up in a follow-up ticket. */}
        <span className="inline-flex items-center gap-s1 rounded-full border border-line bg-surface px-s3 py-[6px] text-[12px] font-medium text-ink-3">
          All staff
        </span>
        <span className="inline-flex items-center gap-s1 rounded-full border border-line bg-surface px-s3 py-[6px] text-[12px] font-medium text-ink-3">
          All services
        </span>

        <Link href={hrefQuickBook as Route} className="no-underline">
          <Button variant="accent" size="md">
            + Quick Book
          </Button>
        </Link>

        {blockTimeOpen ? (
          <Link href={hrefCloseBlockTime as Route} className="no-underline">
            <Button variant="ghost" size="md">
              Close block time
            </Button>
          </Link>
        ) : (
          <Link href={hrefOpenBlockTime as Route} className="no-underline">
            <Button variant="primary" size="md">
              + Block time
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
