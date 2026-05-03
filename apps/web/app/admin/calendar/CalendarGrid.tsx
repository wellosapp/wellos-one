'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { cn } from '@/lib/cn';
import {
  GRID_END_HOUR,
  GRID_PX_PER_MIN,
  GRID_ROW_MINUTES,
  GRID_START_HOUR,
  GRID_TOTAL_MINUTES,
  blockPosition,
  gapDurationMinutes,
  gapsBetweenAppointments,
  gridTopPxToSnappedLocalMinutesSinceMidnight,
  hourLabels,
  localDayAndMinutesToUtcIso,
  nowLinePx,
  staffScheduleBlockTouchesLocalDay,
} from '@/lib/calendar';
import type { Appointment, AppointmentState } from '@/lib/api/appointments';
import type { StaffScheduleBlock } from '@/lib/api/staff-schedule-blocks';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';

import { rescheduleAppointmentCalendarDragAction } from './_actions';
import { CalendarEventBlock } from './CalendarEventBlock';
import { CalendarStaffBlock } from './CalendarStaffBlock';

const RESCHEDULE_DRAG_MIME = 'application/x-wellos-appt';

type DragPayload = { appointmentId: string };

function parseDragPayload(dt: DataTransfer | null): DragPayload | null {
  try {
    const raw = dt?.getData(RESCHEDULE_DRAG_MIME);
    if (!raw) return null;
    const j = JSON.parse(raw) as DragPayload;
    if (typeof j.appointmentId === 'string') return j;
    return null;
  } catch {
    return null;
  }
}

/** Matches API reschedule rules (appointmentService RESCHEDULABLE_STATES). */
const DRAGGABLE_APPOINTMENT_STATES: AppointmentState[] = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
];

interface CalendarGridProps {
  date: Date;
  staff: Staff[];
  serviceById: Map<string, Service>;
  appointments: Appointment[];
  scheduleBlocksByStaff: Record<string, StaffScheduleBlock[]>;
  hrefSelected: (appointmentId: string, tab?: string) => string;
  selectedAppointmentId: string | null;
  /** Display names for appointment.clientId — grid lines show client + service. */
  clientDisplayNames?: Record<string, string>;
  /** Opens admin quick book when user taps an open gap. */
  hrefQuickBook: string;
  /** Next upcoming appointment id for this view (single-column staff mode). */
  nextAppointmentId?: string | null;
  onDeleteScheduleBlock?: (blockId: string) => void;
}

const STAFF_COLUMN_MIN_WIDTH = 200;
const TIME_GUTTER_WIDTH = 72;

export function CalendarGrid({
  date,
  staff,
  serviceById,
  appointments,
  scheduleBlocksByStaff,
  hrefSelected,
  selectedAppointmentId,
  clientDisplayNames,
  hrefQuickBook,
  nextAppointmentId,
  onDeleteScheduleBlock,
}: CalendarGridProps) {
  const router = useRouter();
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [, startReschedule] = useTransition();

  const handleColumnDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleColumnDrop = (e: React.DragEvent, targetStaffId: string) => {
    e.preventDefault();
    const payload = parseDragPayload(e.dataTransfer);
    setDraggingId(null);
    if (!payload) return;
    const scrollEl = gridScrollRef.current;
    if (!scrollEl) return;
    const relY =
      e.clientY -
      scrollEl.getBoundingClientRect().top +
      scrollEl.scrollTop;
    const gridHeightPx = GRID_TOTAL_MINUTES * GRID_PX_PER_MIN;
    const topPx = Math.max(0, Math.min(relY, gridHeightPx));
    const minutes = gridTopPxToSnappedLocalMinutesSinceMidnight(topPx);
    const scheduledStartAt = localDayAndMinutesToUtcIso(date, minutes);

    startReschedule(async () => {
      setRescheduleError(null);
      const res = await rescheduleAppointmentCalendarDragAction({
        appointmentId: payload.appointmentId,
        scheduledStartAt,
        staffId: targetStaffId,
      });
      if (!res.ok) {
        setRescheduleError(res.error ?? 'Could not reschedule.');
        return;
      }
      router.refresh();
    });
  };

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
        className="sticky top-0 z-10 flex border-b border-surface-3 bg-white/95 backdrop-blur"
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

      <div
        ref={gridScrollRef}
        className="relative max-h-[min(520px,58vh)] overflow-auto"
        data-calendar-scroll
      >
        <div
          className="relative flex"
          style={{
            height: gridHeightPx,
            minWidth: TIME_GUTTER_WIDTH + staff.length * STAFF_COLUMN_MIN_WIDTH,
          }}
        >
          <div
            className="sticky left-0 z-[5] shrink-0 border-r border-surface-3 bg-surface"
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
            const blocksForStaff = (scheduleBlocksByStaff[s.id] ?? []).filter(
              (b) => staffScheduleBlockTouchesLocalDay(b, date),
            );
            return (
              <div
                key={s.id}
                className="relative min-w-0 flex-1 border-r border-surface-3 last:border-r-0"
                style={{ minWidth: STAFF_COLUMN_MIN_WIDTH }}
                onDragOver={handleColumnDragOver}
                onDrop={(e) => handleColumnDrop(e, s.id)}
              >
                {blocksForStaff.map((b) => (
                  <div
                    key={b.id}
                    className={draggingId ? 'pointer-events-none' : undefined}
                  >
                    <CalendarStaffBlock
                      block={b}
                      onDelete={onDeleteScheduleBlock}
                    />
                  </div>
                ))}
                {list.map((appt) => {
                  const pos = blockPosition(
                    appt.scheduledStartAt,
                    appt.scheduledEndAt,
                  );
                  if (pos.heightPx <= 0) return null;
                  const canDrag = DRAGGABLE_APPOINTMENT_STATES.includes(
                    appt.state,
                  );
                  return (
                    <div
                      key={appt.id}
                      className="absolute left-s2 right-s2 z-[8] flex gap-s1"
                      style={{ top: pos.topPx, height: pos.heightPx }}
                    >
                      {canDrag ? (
                        <div
                          draggable
                          role="button"
                          tabIndex={0}
                          aria-label="Drag to reschedule"
                          title="Drag to reschedule"
                          onDragStart={(e) => {
                            e.dataTransfer.setData(
                              RESCHEDULE_DRAG_MIME,
                              JSON.stringify({
                                appointmentId: appt.id,
                              } satisfies DragPayload),
                            );
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggingId(appt.id);
                          }}
                          onDragEnd={() => setDraggingId(null)}
                          className="w-7 shrink-0 cursor-grab rounded-l-[12px] border border-surface-3 bg-white/90 active:cursor-grabbing"
                        />
                      ) : (
                        <span className="w-0 shrink-0" aria-hidden />
                      )}
                      <Link
                        href={hrefSelected(appt.id) as Route}
                        className={cn(
                          'relative min-w-0 flex-1 overflow-hidden no-underline',
                          draggingId && 'pointer-events-none',
                        )}
                        aria-label={`Open appointment ${appt.id}`}
                      >
                        <CalendarEventBlock
                          appointment={appt}
                          service={serviceById.get(appt.serviceId) ?? null}
                          isSelected={appt.id === selectedAppointmentId}
                          clientDisplayName={
                            clientDisplayNames?.[appt.clientId]
                          }
                          omitOuterPosition
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
                    </div>
                  );
                })}
                {gaps.map((g, i) => (
                  <Link
                    key={`gap-${s.id}-${i}`}
                    href={hrefQuickBook as Route}
                    className={cn(
                      'absolute left-s3 right-s3 z-[5] flex items-center justify-center rounded-[14px]',
                      'border border-dashed border-surface-3 bg-white/70',
                      't-caption font-semibold text-ink-soft shadow-sm',
                      'transition-colors duration-fast hover:border-accent/40 hover:bg-accent-pale/50',
                      draggingId && 'pointer-events-none',
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
