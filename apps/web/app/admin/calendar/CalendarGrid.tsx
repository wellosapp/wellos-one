'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { cn } from '@/lib/cn';
import {
  GRID_END_HOUR,
  GRID_PX_PER_MIN,
  GRID_ROW_MINUTES,
  GRID_START_HOUR,
  GRID_TOTAL_MINUTES,
  hourLabels,
  nowLinePx,
} from '@/lib/calendar';
import type { Appointment } from '@/lib/api/appointments';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';

import { CalendarEventBlock } from './CalendarEventBlock';

interface CalendarGridProps {
  date: Date;
  staff: Staff[];
  serviceById: Map<string, Service>;
  appointments: Appointment[];
  hrefSelected: (appointmentId: string, tab?: string) => string;
  selectedAppointmentId: string | null;
}

const STAFF_COLUMN_MIN_WIDTH = 200;
const TIME_GUTTER_WIDTH = 64;

export function CalendarGrid({
  date,
  staff,
  serviceById,
  appointments,
  hrefSelected,
  selectedAppointmentId,
}: CalendarGridProps) {
  const totalRows =
    Math.ceil((GRID_END_HOUR - GRID_START_HOUR) * 60 / GRID_ROW_MINUTES) + 1;
  const gridHeightPx = GRID_TOTAL_MINUTES * GRID_PX_PER_MIN;
  const labels = hourLabels();
  const nowLineY = nowLinePx(date);

  // Group appointments by staffId for column rendering.
  const apptsByStaff = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const list = apptsByStaff.get(a.staffId);
    if (list) list.push(a);
    else apptsByStaff.set(a.staffId, [a]);
  }

  return (
    <div className="overflow-hidden rounded-md border border-surface-3 bg-white shadow-sm">
      {/* Sticky staff header row */}
      <div
        className="sticky top-0 z-10 flex border-b border-surface-3 bg-white/95 backdrop-blur"
        style={{ paddingLeft: TIME_GUTTER_WIDTH }}
      >
        {staff.map((s) => (
          <div
            key={s.id}
            className="flex min-w-0 flex-1 flex-col gap-s1 border-r border-surface-3 px-s3 py-s3 last:border-r-0"
            style={{ minWidth: STAFF_COLUMN_MIN_WIDTH }}
          >
            <span className="t-body-sm font-medium text-ink truncate">
              {s.firstName}
              {s.lastName ? ` ${s.lastName}` : ''}
            </span>
            {s.jobTitle && (
              <span className="t-caption text-ink-soft truncate">
                {s.jobTitle}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="relative overflow-auto" style={{ maxHeight: '70vh' }}>
        <div
          className="relative flex"
          style={{ height: gridHeightPx, minWidth: TIME_GUTTER_WIDTH + staff.length * STAFF_COLUMN_MIN_WIDTH }}
        >
          {/* Hour gutter — first label sits at the top of the gutter; the
              rest are nudged up so they visually center on the hour line. */}
          <div
            className="sticky left-0 z-[5] shrink-0 border-r border-surface-3 bg-white"
            style={{ width: TIME_GUTTER_WIDTH }}
          >
            {labels.map((l) => (
              <div
                key={l.label}
                className="absolute right-s2 t-caption text-ink-soft"
                style={{
                  top: l.isFirst ? 4 : l.topPx - 6,
                }}
              >
                {l.label}
              </div>
            ))}
          </div>

          {/* Half-hour grid lines for the entire body */}
          <div
            className="absolute inset-y-0"
            style={{ left: TIME_GUTTER_WIDTH, right: 0, pointerEvents: 'none' }}
            aria-hidden="true"
          >
            {Array.from({ length: totalRows }).map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  'absolute left-0 right-0 border-t',
                  idx % 2 === 0 ? 'border-surface-3' : 'border-surface-2',
                )}
                style={{ top: idx * GRID_ROW_MINUTES * GRID_PX_PER_MIN }}
              />
            ))}
          </div>

          {/* Now-line — only when viewing today and time is in range */}
          {nowLineY !== null && (
            <div
              className="absolute left-0 right-0 z-[6] flex items-center"
              style={{ top: nowLineY, pointerEvents: 'none' }}
              aria-label="Current time"
            >
              <div className="h-[2px] flex-1 bg-red shadow-sm" />
            </div>
          )}

          {/* Staff columns */}
          {staff.map((s) => {
            const list = apptsByStaff.get(s.id) ?? [];
            return (
              <div
                key={s.id}
                className="relative min-w-0 flex-1 border-r border-surface-3 last:border-r-0"
                style={{ minWidth: STAFF_COLUMN_MIN_WIDTH }}
              >
                {list.map((appt) => (
                  <Link
                    key={appt.id}
                    href={hrefSelected(appt.id) as Route}
                    className="no-underline"
                    aria-label={`Open appointment ${appt.id}`}
                  >
                    <CalendarEventBlock
                      appointment={appt}
                      service={serviceById.get(appt.serviceId) ?? null}
                      isSelected={appt.id === selectedAppointmentId}
                    />
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
