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
  gapDurationMinutes,
  gapsBetweenAppointments,
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
  /** Display names for appointment.clientId — grid lines show client + service. */
  clientDisplayNames?: Record<string, string>;
  /** Opens admin quick book when user taps an open gap. */
  hrefQuickBook: string;
  /** Next upcoming appointment id for this view (single-column staff mode). */
  nextAppointmentId?: string | null;
}

const STAFF_COLUMN_MIN_WIDTH = 200;
const TIME_GUTTER_WIDTH = 72;

export function CalendarGrid({
  date,
  staff,
  serviceById,
  appointments,
  hrefSelected,
  selectedAppointmentId,
  clientDisplayNames,
  hrefQuickBook,
  nextAppointmentId,
}: CalendarGridProps) {
  const totalRows =
    Math.ceil((GRID_END_HOUR - GRID_START_HOUR) * 60 / GRID_ROW_MINUTES) + 1;
  const gridHeightPx = GRID_TOTAL_MINUTES * GRID_PX_PER_MIN;
  const labels = hourLabels();
  const nowLineY = nowLinePx(date);

  const apptsByStaff = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const list = apptsByStaff.get(a.staffId);
    if (list) list.push(a);
    else apptsByStaff.set(a.staffId, [a]);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-surface-3 bg-white shadow-sm">
      <div
        className="sticky top-0 z-10 flex border-b border-surface-3 bg-[#fbfbfa]/95 backdrop-blur"
        style={{ paddingLeft: TIME_GUTTER_WIDTH }}
      >
        {staff.map((s) => (
          <div
            key={s.id}
            className="flex min-h-[64px] min-w-0 flex-1 flex-col justify-center gap-s1 border-r border-surface-3 px-s4 py-s3 last:border-r-0"
            style={{ minWidth: STAFF_COLUMN_MIN_WIDTH }}
          >
            <span className="t-body-md font-semibold text-ink truncate">
              {s.firstName}
              {s.lastName ? ` ${s.lastName}` : ''}
            </span>
            {s.jobTitle ? (
              <span className="t-caption text-ink-soft truncate">{s.jobTitle}</span>
            ) : (
              <span className="t-caption text-ink-soft truncate">Provider</span>
            )}
          </div>
        ))}
      </div>

      <div className="relative max-h-[min(520px,58vh)] overflow-auto">
        <div
          className="relative flex"
          style={{
            height: gridHeightPx,
            minWidth: TIME_GUTTER_WIDTH + staff.length * STAFF_COLUMN_MIN_WIDTH,
          }}
        >
          <div
            className="sticky left-0 z-[5] shrink-0 border-r border-surface-3 bg-[#fbfbfa]"
            style={{ width: TIME_GUTTER_WIDTH }}
          >
            {labels.map((l) => (
              <div
                key={l.label}
                className="absolute right-s2 font-medium t-caption text-ink-soft"
                style={{
                  top: l.isFirst ? 8 : l.topPx - 6,
                }}
              >
                {l.label}
              </div>
            ))}
          </div>

          <div
            className="pointer-events-none absolute inset-y-0"
            style={{ left: TIME_GUTTER_WIDTH, right: 0 }}
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

          {staff.map((s) => {
            const list = apptsByStaff.get(s.id) ?? [];
            const gaps = gapsBetweenAppointments(list);
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
                      clientDisplayName={clientDisplayNames?.[appt.clientId]}
                      alertStyle={
                        Boolean(appt.notes) &&
                        appt.state !== 'completed' &&
                        appt.state !== 'cancelled'
                      }
                      statusOverride={
                        nextAppointmentId === appt.id ? 'Next up' : undefined
                      }
                    />
                  </Link>
                ))}
                {gaps.map((g, i) => (
                  <Link
                    key={`gap-${s.id}-${i}`}
                    href={hrefQuickBook as Route}
                    className={cn(
                      'absolute left-s3 right-s3 flex items-center justify-center rounded-[14px]',
                      'border border-dashed border-surface-3 bg-white/70',
                      't-caption font-semibold text-ink-soft shadow-sm',
                      'transition-colors duration-fast hover:border-accent/40 hover:bg-accent-pale/50',
                    )}
                    style={{ top: g.topPx, height: g.heightPx }}
                  >
                    Open {gapDurationMinutes(g)} min · Quick book
                  </Link>
                ))}
              </div>
            );
          })}

          {nowLineY !== null && (
            <div
              className="pointer-events-none absolute z-[8]"
              style={{
                left: TIME_GUTTER_WIDTH,
                right: 0,
                top: nowLineY,
              }}
              aria-label="Current time"
            >
              <span className="absolute left-s2 top-[-11px] rounded-full bg-red px-s2 py-[2px] text-[10px] font-bold text-white shadow-sm">
                Now
              </span>
              <div className="h-[2px] w-full bg-red shadow-sm" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
