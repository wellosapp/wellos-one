// Date helpers for the staff calendar Day view. All multi-tz handling stays
// in the API layer (location.timezone resolves availability); the web UI
// renders timestamps in the operator's browser timezone, which matches the
// admin's working zone for single-location tenants. Per-tenant TZ is a
// follow-up — see plan §"Tenant timezone".

import {
  addDays,
  endOfDay,
  format as fmt,
  isToday as isTodayFn,
  parseISO,
  startOfDay,
} from 'date-fns';

// ---- date param helpers ----

// Parse `YYYY-MM-DD` from a search param. Treat empty / invalid as today.
// We intentionally interpret it in browser-local TZ — the operator picks
// "May 2" and means "May 2 here," not "May 2 UTC."
export function parseDateParam(value: string | undefined | null): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return startOfDay(new Date());
  }
  // Construct as local-midnight to avoid the parseISO("YYYY-MM-DD") UTC trap.
  const parts = value.split('-').map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const local = new Date(y, m - 1, d, 0, 0, 0, 0);
  return startOfDay(local);
}

export function toDateParam(date: Date): string {
  return fmt(date, 'yyyy-MM-dd');
}

// Returns UTC ISO bounds for a day so we can pass `from`/`to` to
// GET /admin/appointments. End is exclusive (matches the service's `lt`).
export function dayBoundsUtc(date: Date): { fromIso: string; toIso: string } {
  const start = startOfDay(date);
  const end = endOfDay(date); // 23:59:59.999 — but we send next-day-start
  // Use start of next day for the exclusive upper bound. endOfDay would
  // truncate at .999 which loses the last millisecond of the day.
  return {
    fromIso: start.toISOString(),
    toIso: addDays(start, 1).toISOString(),
  };
}

// ---- formatting ----

export function formatTimeLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDateLong(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateShort(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTimeLocal(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function isToday(date: Date): boolean {
  return isTodayFn(date);
}

// ---- grid math ----

// Default visible window. Operator-friendly default; later we can read from
// location working hours. 8:00 → 20:00 (12h × 60min = 720 minutes).
export const GRID_START_HOUR = 8;
export const GRID_END_HOUR = 20;
export const GRID_TOTAL_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60;
// 30-min half-rows; gives readable density without crowding.
export const GRID_ROW_MINUTES = 30;
// Pixels per minute. 30-min row = 36px; full grid ≈ 864px.
export const GRID_PX_PER_MIN = 1.2;

// Wallclock minutes since midnight, in the BROWSER timezone. Used to position
// blocks vertically. Negative or over GRID_TOTAL_MINUTES means out-of-window —
// we still render but clip to the visible range so the operator sees
// "something is up."
export function minutesSinceMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export function offsetFromGridStart(iso: string): number {
  const m = minutesSinceMidnight(iso);
  return m - GRID_START_HOUR * 60;
}

export type GridPosition = {
  topPx: number;
  heightPx: number;
};

export function blockPosition(
  startIso: string,
  endIso: string,
): GridPosition {
  const startMin = offsetFromGridStart(startIso);
  const endMin = offsetFromGridStart(endIso);
  // Clip the appointment span to the visible grid window so blocks that
  // start or end outside the 8am–8pm range don't stretch into wrong slots.
  const visStart = Math.max(0, Math.min(GRID_TOTAL_MINUTES, startMin));
  const visEnd = Math.max(0, Math.min(GRID_TOTAL_MINUTES, endMin));
  if (visEnd <= visStart) {
    return { topPx: 0, heightPx: 0 };
  }
  const top = visStart * GRID_PX_PER_MIN;
  const visible = visEnd - visStart;
  // Floor at half a row so micro-bookings stay tappable.
  const heightPx =
    Math.max(GRID_ROW_MINUTES / 2, visible) * GRID_PX_PER_MIN;
  return { topPx: top, heightPx };
}

// Hour rows for the leftmost time gutter. The first label sits at the very
// top of the gutter (no negative offset) so it doesn't clip; later labels
// are nudged up by half their line-height to center on the hour line.
export function hourLabels(): {
  label: string;
  topPx: number;
  isFirst: boolean;
}[] {
  const out: { label: string; topPx: number; isFirst: boolean }[] = [];
  for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) {
    const d = new Date();
    d.setHours(h, 0, 0, 0);
    out.push({
      label: d.toLocaleTimeString(undefined, { hour: 'numeric' }),
      topPx: (h - GRID_START_HOUR) * 60 * GRID_PX_PER_MIN,
      isFirst: h === GRID_START_HOUR,
    });
  }
  return out;
}

// "Now" line position — only render when the current time is in window AND
// the date being viewed is today.
export function nowLinePx(date: Date): number | null {
  if (!isTodayFn(date)) return null;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const offset = minutes - GRID_START_HOUR * 60;
  if (offset < 0 || offset > GRID_TOTAL_MINUTES) return null;
  return offset * GRID_PX_PER_MIN;
}

/** Open intervals between consecutive appointments (same column), in grid coordinates. */
export type CalendarGap = {
  topPx: number;
  heightPx: number;
  /** Minutes from grid start (8:00) */
  gapStartMin: number;
  gapEndMin: number;
};

const MIN_GAP_MINUTES = 12;

/**
 * Computes whitespace gaps between sorted same-day appointments for one staff member.
 * Ignores pairs where the gap is smaller than MIN_GAP_MINUTES.
 */
export function gapsBetweenAppointments(
  appointments: { scheduledStartAt: string; scheduledEndAt: string }[],
): CalendarGap[] {
  if (appointments.length < 2) return [];
  const sorted = [...appointments].sort(
    (a, b) =>
      new Date(a.scheduledStartAt).getTime() -
      new Date(b.scheduledStartAt).getTime(),
  );
  const gaps: CalendarGap[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!a || !b) continue;
    const endA = offsetFromGridStart(a.scheduledEndAt);
    const startB = offsetFromGridStart(b.scheduledStartAt);
    const gapStart = Math.max(0, endA);
    const gapEnd = Math.min(GRID_TOTAL_MINUTES, startB);
    if (gapEnd - gapStart < MIN_GAP_MINUTES) continue;
    const topPx = gapStart * GRID_PX_PER_MIN;
    const heightPx = Math.max(
      GRID_ROW_MINUTES * GRID_PX_PER_MIN * 0.5,
      (gapEnd - gapStart) * GRID_PX_PER_MIN,
    );
    gaps.push({
      topPx,
      heightPx,
      gapStartMin: gapStart,
      gapEndMin: gapEnd,
    });
  }
  return gaps;
}

/** Minutes duration of a gap for display (rounded). */
export function gapDurationMinutes(gap: CalendarGap): number {
  return Math.round(gap.gapEndMin - gap.gapStartMin);
}

// Re-export some date-fns primitives used by callers so the rest of the app
// has one import surface.
export { addDays, parseISO, startOfDay };
