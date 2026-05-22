'use client';

import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

import { Badge, Button } from '@/components/ui';
import { addDays, formatDateShort, isToday } from '@/lib/calendar';
import type { CalendarViewMode } from '@/lib/calendar-view';

import { CalendarFilterPills } from './CalendarFilterPills';
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
  /** Toggles the collapsible "Today's pulse" panel (?pulse=1). */
  hrefTogglePulse: string;
  pulseOpen: boolean;
}

/**
 * R2 “CalendarToolbar” — period navigation, view toggle, Quick Book entry.
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
  hrefTogglePulse,
  pulseOpen,
}: CalendarToolbarProps) {
  const titleWithBadge: ReactNode =
    view === 'day' && isToday(date) ? (
      <>
        {periodTitle}
        <Badge tone="accent" className="self-center">
          Today
        </Badge>
      </>
    ) : (
      periodTitle
    );

  return (
    <header className="flex flex-col gap-s4">
      <div className="flex flex-col gap-s4 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-s1">
        <span className="t-eyebrow text-accent">Calendar</span>
        <h1 className="t-display-lg flex flex-wrap items-baseline gap-s3">
          {titleWithBadge}
        </h1>
        <div className="flex flex-wrap items-center gap-s3">
          <Link href={prevNav as Route} className="no-underline">
            <Button variant="ghost" size="sm">
              {view === 'day' && <>← {formatDateShort(addDays(date, -1))}</>}
              {view === 'week' && <>← Previous week</>}
              {view === 'month' && <>← Previous month</>}
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
              {view === 'day' && <>{formatDateShort(addDays(date, +1))} →</>}
              {view === 'week' && <>Next week →</>}
              {view === 'month' && <>Next month →</>}
            </Button>
          </Link>
          {view !== 'day' && (
            <>
              <span className="text-ink-soft">·</span>
              <Link href={dayJumpPrev as Route} className="no-underline">
                <Button variant="ghost" size="sm">
                  Day ←
                </Button>
              </Link>
              <Link href={dayJumpNext as Route} className="no-underline">
                <Button variant="ghost" size="sm">
                  Day →
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-s3">
        <CalendarViewToggle
          surface="admin"
          dateParam={dateParam}
          active={view}
          quickBookOpen={quickBookOpen}
          blockTimeOpen={blockTimeOpen}
        />

        <span className="rounded-md border border-surface-3 bg-white px-s4 py-s2 t-body-sm font-medium text-ink-soft shadow-sm">
          All staff
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
      </div>

      {view === 'day' && (
        <div className="flex flex-wrap items-center justify-between gap-s3">
          <CalendarFilterPills variant="toolbar" />
          <div className="flex flex-wrap items-center gap-s2">
            <Link href={hrefTogglePulse as Route} className="no-underline">
              <Button variant="ghost" size="sm">
                {pulseOpen ? 'Hide today’s pulse' : 'Today’s pulse'}
              </Button>
            </Link>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="cursor-not-allowed rounded-sm border border-surface-3 bg-white px-s4 py-[7px] t-caption font-semibold text-ink-soft opacity-60"
            >
              Send booking link
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
