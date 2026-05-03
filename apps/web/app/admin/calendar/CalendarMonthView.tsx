'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { cn } from '@/lib/cn';
import type { Appointment } from '@/lib/api/appointments';
import type { StaffScheduleBlock } from '@/lib/api/staff-schedule-blocks';
import { monthGridCells, type CalendarViewMode } from '@/lib/calendar-view';
import {
  countStaffScheduleBlocksTouchingLocalDay,
  formatDateShort,
  isToday,
  toDateParam,
} from '@/lib/calendar';
import { countIntakeAttentionOnDay } from './intake-status-label';

interface CalendarMonthViewProps {
  anchorMonth: Date;
  appointments: Appointment[];
  /** URL base path without query — `/admin/calendar` or `/staff/schedule` or `/book`. */
  basePath: string;
  /** Extra params e.g. quickbook=1 */
  preserveParams?: Record<string, string>;
  /** Staff schedule blocks for blocked-time hints per day (calendar-area-features §9). */
  scheduleBlocksByStaff?: Record<string, StaffScheduleBlock[]>;
}

function countByDayKey(appointments: Appointment[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of appointments) {
    const key = toDateParam(new Date(a.scheduledStartAt));
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

function hrefForCell(
  basePath: string,
  dateStr: string,
  preserve?: Record<string, string>,
): string {
  const params = new URLSearchParams();
  params.set('date', dateStr);
  params.set('view', 'day' satisfies CalendarViewMode);
  if (preserve) {
    for (const [k, v] of Object.entries(preserve)) {
      if (v) params.set(k, v);
    }
  }
  return `${basePath}?${params.toString()}`;
}

export function CalendarMonthView({
  anchorMonth,
  appointments,
  basePath,
  preserveParams,
  scheduleBlocksByStaff = {},
}: CalendarMonthViewProps) {
  const counts = countByDayKey(appointments);
  const cells = monthGridCells(anchorMonth);
  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="overflow-hidden rounded-xl border border-surface-3 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-surface-3 bg-surface py-s2">
        {weekdayLabels.map((w) => (
          <div
            key={w}
            className="text-center t-caption font-semibold text-ink-soft"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-surface-3 p-px">
        {cells.map(({ date, inMonth }, idx) => {
          const dateStr = toDateParam(date);
          const n = counts.get(dateStr) ?? 0;
          const blockCount = countStaffScheduleBlocksTouchingLocalDay(
            scheduleBlocksByStaff,
            date,
          );
          const intakeAttention = countIntakeAttentionOnDay(appointments, dateStr);
          const today = isToday(date);
          return (
            <Link
              key={idx}
              href={hrefForCell(basePath, dateStr, preserveParams) as Route}
              className={cn(
                'relative flex min-h-[72px] flex-col items-start gap-s1 bg-white p-s2 no-underline transition-colors duration-fast',
                'hover:bg-accent-pale/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                !inMonth && 'bg-surface text-ink-soft',
                inMonth && 'text-ink',
                today && inMonth && 'ring-1 ring-accent',
              )}
            >
              <span
                className={cn(
                  't-body-sm font-semibold',
                  today && 'text-accent',
                )}
              >
                {date.getDate()}
              </span>
              {n > 0 && inMonth && (
                <span className="rounded-full bg-accent-pale px-s2 py-[2px] t-caption font-semibold text-accent">
                  {n} appt{n === 1 ? '' : 's'}
                </span>
              )}
              {blockCount > 0 && inMonth && (
                <span className="rounded-full bg-surface-2 px-s2 py-[2px] t-caption font-semibold text-ink-soft">
                  {blockCount} block{blockCount === 1 ? '' : 's'}
                </span>
              )}
              {intakeAttention > 0 && inMonth && (
                <span className="rounded-full bg-amber-pale px-s2 py-[2px] t-caption font-semibold text-amber-900">
                  {intakeAttention} intake
                </span>
              )}
            </Link>
          );
        })}
      </div>
      <p className="border-t border-surface-3 bg-surface px-s4 py-s3 t-caption text-ink-soft">
        Click a day to open the day schedule. Badges show appointment count,
        staff blocks touching that day (local time), and how many appointments
        that day still need intake (pending, sent, or expired).
      </p>
    </div>
  );
}
