import {
  addMonths,
  endOfMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  endOfWeek,
} from 'date-fns';

/** URL + UI calendar scope — shared by admin, staff, and client booking shell. */
export type CalendarViewMode = 'day' | 'week' | 'month';

export function parseViewParam(
  value: string | undefined | null,
): CalendarViewMode {
  if (value === 'week' || value === 'month') return value;
  return 'day';
}

/** UTC ISO bounds for listAppointments — padded like the day view window. */
export function appointmentFetchBounds(
  anchorDate: Date,
  view: CalendarViewMode,
): { fromIso: string; toIso: string } {
  let rangeStart: Date;
  let rangeEnd: Date;

  switch (view) {
    case 'week': {
      rangeStart = startOfWeek(anchorDate, { weekStartsOn: 1 });
      rangeEnd = endOfWeek(anchorDate, { weekStartsOn: 1 });
      break;
    }
    case 'month': {
      rangeStart = startOfMonth(anchorDate);
      rangeEnd = endOfMonth(anchorDate);
      break;
    }
    default: {
      const dayMs = anchorDate.getTime();
      rangeStart = new Date(dayMs - 14 * 60 * 60 * 1000);
      rangeEnd = new Date(dayMs + 38 * 60 * 60 * 1000);
      break;
    }
  }

  const fromIso = new Date(
    rangeStart.getTime() - 14 * 60 * 60 * 1000,
  ).toISOString();
  const toIso = new Date(rangeEnd.getTime() + 38 * 60 * 60 * 1000).toISOString();
  return { fromIso, toIso };
}

/** Max rows to request — month/week may include many appointments. */
export function appointmentFetchTake(view: CalendarViewMode): number {
  return view === 'month' ? 500 : view === 'week' ? 350 : 200;
}

export function shiftAnchorDate(
  anchor: Date,
  view: CalendarViewMode,
  dir: 'prev' | 'next',
): Date {
  const d = dir === 'prev' ? -1 : 1;
  switch (view) {
    case 'day':
      return new Date(
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate() + d,
      );
    case 'week':
      return new Date(
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate() + 7 * d,
      );
    case 'month':
      return addMonths(anchor, d);
    default:
      return anchor;
  }
}

export function monthGridCells(
  anchorMonth: Date,
): { date: Date; inMonth: boolean }[] {
  const monthStart = startOfMonth(anchorMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const cells: { date: Date; inMonth: boolean }[] = [];
  let cursor = gridStart;
  for (let i = 0; i < 42; i++) {
    cells.push({
      date: new Date(cursor),
      inMonth: cursor.getMonth() === anchorMonth.getMonth(),
    });
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
    );
  }
  return cells;
}

export function weekDayDates(anchorInWeek: Date): Date[] {
  const weekStart = startOfWeek(anchorInWeek, { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(
      new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate() + i,
      ),
    );
  }
  return days;
}

/** True when `d` is the same civil day as `anchor` in local TZ. */
export function isSameLocalDay(d: Date, anchor: Date): boolean {
  return (
    d.getFullYear() === anchor.getFullYear() &&
    d.getMonth() === anchor.getMonth() &&
    d.getDate() === anchor.getDate()
  );
}

export function startOfLocalDay(d: Date): Date {
  return startOfDay(d);
}

/** Stable calendar URLs for admin, staff, and client booking. */
export function buildCalendarUrl(
  basePath: string,
  opts: {
    date: string;
    view?: CalendarViewMode;
    selected?: string;
    tab?: string;
    quickbook?: string;
    /** Staff schedule block side panel (calendar-area-features §9). */
    blocktime?: string;
  },
): string {
  const params = new URLSearchParams();
  params.set('date', opts.date);
  if (opts.view && opts.view !== 'day') params.set('view', opts.view);
  if (opts.selected) params.set('selected', opts.selected);
  if (opts.tab) params.set('tab', opts.tab);
  if (opts.quickbook) params.set('quickbook', opts.quickbook);
  if (opts.blocktime) params.set('blocktime', opts.blocktime);
  return `${basePath}?${params.toString()}`;
}
