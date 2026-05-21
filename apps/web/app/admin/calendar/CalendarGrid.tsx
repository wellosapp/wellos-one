'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { cn } from '@/lib/cn';
import {
  isToday,
  localDayAndMinutesToUtcIso,
  staffScheduleBlockTouchesLocalDay,
} from '@/lib/calendar';
import type { Appointment, AppointmentState } from '@/lib/api/appointments';
import type { StaffScheduleBlock } from '@/lib/api/staff-schedule-blocks';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';

import { rescheduleAppointmentCalendarDragAction } from './_actions';
import { CalendarDensityWave } from './CalendarDensityWave';
import { CalendarEventBlock } from './CalendarEventBlock';
import { CalendarNowMarker } from './CalendarNowMarker';
import { CalendarStaffBlock } from './CalendarStaffBlock';

// Horizontal "staff river" layout: staff are rows, time flows left→right.
// Hour cells are PX_PER_HOUR wide; lanes are LANE_HEIGHT tall. The sticky
// name column matches the density wave's empty leading region above.

const RESCHEDULE_DRAG_MIME = 'application/x-wellos-appt';

const START_HOUR = 7;
const END_HOUR = 20;
const TOTAL_HOURS = END_HOUR - START_HOUR; // 13
const PX_PER_HOUR = 110;
const LANE_HEIGHT = 78;
const NAME_COLUMN_WIDTH = 168;
const HEADER_HEIGHT = 36;
const SNAP_MINUTES = 15;
const MIN_GAP_MINUTES = 15;

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
  /** 30-min bin counts for the density wave above the grid. Empty = wave hidden. */
  densityBins?: { hour: number; count: number }[];
}

function hourLabel(h: number): string {
  const period = h >= 12 ? 'p' : 'a';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${period}`;
}

function minutesSinceMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function offsetMinutesFromStart(iso: string): number {
  return minutesSinceMidnight(iso) - START_HOUR * 60;
}

function clampToVisibleRange(startMin: number, endMin: number): {
  startMin: number;
  endMin: number;
} {
  const totalMin = TOTAL_HOURS * 60;
  return {
    startMin: Math.max(0, Math.min(totalMin, startMin)),
    endMin: Math.max(0, Math.min(totalMin, endMin)),
  };
}

/** Snap pixels on the time axis to SNAP_MINUTES granularity, in minutes since midnight. */
function pxToSnappedMinutes(pxFromTrackStart: number): number {
  const minutesFromStart = (pxFromTrackStart / PX_PER_HOUR) * 60;
  const raw = START_HOUR * 60 + minutesFromStart;
  const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES;
  const max = 24 * 60 - SNAP_MINUTES;
  return Math.max(0, Math.min(snapped, max));
}

type RowItem =
  | {
      kind: 'appt';
      id: string;
      startMin: number;
      endMin: number;
      appointment: Appointment;
    }
  | {
      kind: 'block';
      id: string;
      startMin: number;
      endMin: number;
      block: StaffScheduleBlock;
    };

function gapsForLane(items: RowItem[]): { startMin: number; endMin: number }[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin);
  const totalMin = TOTAL_HOURS * 60;
  const gaps: { startMin: number; endMin: number }[] = [];
  let cursor = 0;
  for (const it of sorted) {
    if (it.startMin > cursor) {
      gaps.push({ startMin: cursor, endMin: it.startMin });
    }
    cursor = Math.max(cursor, it.endMin);
  }
  if (cursor < totalMin) {
    gaps.push({ startMin: cursor, endMin: totalMin });
  }
  return gaps.filter((g) => g.endMin - g.startMin >= MIN_GAP_MINUTES);
}

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
  densityBins = [],
}: CalendarGridProps) {
  const router = useRouter();
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHover, setDropHover] = useState<{
    staffId: string;
    leftPx: number;
    widthPx: number;
  } | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [, startReschedule] = useTransition();

  const trackWidth = TOTAL_HOURS * PX_PER_HOUR;
  const bodyHeight = staff.length * LANE_HEIGHT;
  const totalWidth = NAME_COLUMN_WIDTH + trackWidth;

  const apptsByStaff = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const list = apptsByStaff.get(a.staffId);
    if (list) list.push(a);
    else apptsByStaff.set(a.staffId, [a]);
  }

  const handleLaneDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    targetStaffId: string,
  ) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const trackEl = e.currentTarget;
    const rect = trackEl.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const minutesSinceMid = pxToSnappedMinutes(relX);
    const minutesFromStart = minutesSinceMid - START_HOUR * 60;
    const leftPx = (minutesFromStart / 60) * PX_PER_HOUR;
    setDropHover({
      staffId: targetStaffId,
      leftPx,
      widthPx: (SNAP_MINUTES / 60) * PX_PER_HOUR,
    });
  };

  const handleLaneDragLeave = () => {
    setDropHover(null);
  };

  const handleLaneDrop = (
    e: React.DragEvent<HTMLDivElement>,
    targetStaffId: string,
  ) => {
    e.preventDefault();
    setDropHover(null);
    const payload = parseDragPayload(e.dataTransfer);
    setDraggingId(null);
    if (!payload) return;
    const trackEl = e.currentTarget;
    const rect = trackEl.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const minutesSinceMid = pxToSnappedMinutes(relX);
    const scheduledStartAt = localDayAndMinutesToUtcIso(date, minutesSinceMid);

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

  const hours: number[] = [];
  for (let h = START_HOUR; h < END_HOUR; h++) hours.push(h);

  return (
    <div className="flex flex-col gap-s2">
      {rescheduleError ? (
        <div className="rounded-md border border-red/30 bg-red-pale px-s3 py-s2 t-body-sm text-red">
          {rescheduleError}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
        <div className="overflow-x-auto" data-calendar-scroll>
          {/* Density wave — pure visual hint above the grid (admin only) */}
          {densityBins.length > 0 ? (
            <CalendarDensityWave
              bins={densityBins}
              startHour={START_HOUR}
              pxPerHour={PX_PER_HOUR}
              nameColumnWidth={NAME_COLUMN_WIDTH}
              className="border-b border-line bg-surface px-s2 pt-s2"
            />
          ) : null}

          {/* Sticky header row with hour labels */}
          <div
            className="flex border-b border-line bg-surface"
            style={{ width: totalWidth }}
          >
            <div
              className="shrink-0 border-r border-line px-s3 py-s2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3"
              style={{ width: NAME_COLUMN_WIDTH, minHeight: HEADER_HEIGHT }}
            >
              Staff · time →
            </div>
            <div
              className="relative shrink-0"
              style={{ width: trackWidth, height: HEADER_HEIGHT }}
            >
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="absolute top-0 flex h-full items-center font-mono text-[11px] font-semibold text-ink-4"
                  style={{ left: i * PX_PER_HOUR, paddingLeft: 6 }}
                >
                  {hourLabel(h)}
                </div>
              ))}
            </div>
          </div>

          {/* Body — lanes */}
          <div
            ref={gridScrollRef}
            className="relative"
            style={{ width: totalWidth, height: bodyHeight }}
          >
            {staff.map((s, idx) => {
              const list = apptsByStaff.get(s.id) ?? [];
              const blocksForStaff = (
                scheduleBlocksByStaff[s.id] ?? []
              ).filter((b) => staffScheduleBlockTouchesLocalDay(b, date));

              const items: RowItem[] = [];
              for (const a of list) {
                const { startMin, endMin } = clampToVisibleRange(
                  offsetMinutesFromStart(a.scheduledStartAt),
                  offsetMinutesFromStart(a.scheduledEndAt),
                );
                if (endMin <= startMin) continue;
                items.push({
                  kind: 'appt',
                  id: a.id,
                  startMin,
                  endMin,
                  appointment: a,
                });
              }
              for (const b of blocksForStaff) {
                const { startMin, endMin } = clampToVisibleRange(
                  offsetMinutesFromStart(b.startsAt),
                  offsetMinutesFromStart(b.endsAt),
                );
                if (endMin <= startMin) continue;
                items.push({
                  kind: 'block',
                  id: b.id,
                  startMin,
                  endMin,
                  block: b,
                });
              }

              const gaps = gapsForLane(items);
              const isStripe = idx % 2 === 0;
              const initials = (
                (s.firstName?.[0] ?? '') + (s.lastName?.[0] ?? '')
              ).toUpperCase();

              return (
                <div
                  key={s.id}
                  className="absolute left-0 right-0 border-b border-line"
                  style={{ top: idx * LANE_HEIGHT, height: LANE_HEIGHT }}
                >
                  {/* Sticky-left name cell */}
                  <div
                    className="absolute left-0 top-0 z-[3] flex h-full items-center gap-s2 border-r border-line bg-surface px-s3"
                    style={{ width: NAME_COLUMN_WIDTH }}
                  >
                    <span
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sand-soft to-sage-tint text-[12px] font-semibold text-ink"
                      aria-hidden="true"
                    >
                      {initials || '?'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="t-body-sm truncate font-semibold text-ink">
                        {s.firstName}
                        {s.lastName ? ` ${s.lastName}` : ''}
                      </div>
                      <div className="truncate text-[11.5px] text-ink-4">
                        {s.jobTitle ?? 'Provider'}
                      </div>
                    </div>
                  </div>

                  {/* Time track */}
                  <div
                    className={cn(
                      'absolute top-0 h-full',
                      isStripe ? 'bg-sage-tint-2/40' : 'bg-surface',
                    )}
                    style={{ left: NAME_COLUMN_WIDTH, width: trackWidth }}
                    onDragOver={(e) => handleLaneDragOver(e, s.id)}
                    onDragLeave={handleLaneDragLeave}
                    onDrop={(e) => handleLaneDrop(e, s.id)}
                  >
                    {/* Hour gridlines */}
                    {hours.map((_h, i) => (
                      <div
                        key={i}
                        className="pointer-events-none absolute top-0 h-full border-l border-dashed border-line"
                        style={{ left: i * PX_PER_HOUR }}
                        aria-hidden="true"
                      />
                    ))}

                    {/* Open-slot gaps — Quick Book CTAs */}
                    {gaps.map((g, i) => {
                      const left = (g.startMin / 60) * PX_PER_HOUR;
                      const width =
                        ((g.endMin - g.startMin) / 60) * PX_PER_HOUR;
                      const startIso = localDayAndMinutesToUtcIso(
                        date,
                        g.startMin + START_HOUR * 60,
                      );
                      const href =
                        `${hrefQuickBook}&staffId=${encodeURIComponent(
                          s.id,
                        )}&start=${encodeURIComponent(startIso)}` as Route;
                      const durationMin = Math.round(g.endMin - g.startMin);
                      return (
                        <Link
                          key={`gap-${s.id}-${i}`}
                          href={href}
                          className={cn(
                            'absolute z-[1] flex items-center justify-center rounded-sm',
                            'border border-dashed border-line text-[10px] font-medium text-ink-4',
                            'transition-colors duration-fast',
                            'hover:border-sage-soft hover:bg-sage-tint hover:text-sage-deep',
                            draggingId && 'pointer-events-none',
                          )}
                          style={{
                            left: left + 4,
                            width: Math.max(8, width - 8),
                            top: 8,
                            height: LANE_HEIGHT - 16,
                          }}
                          aria-label={`Open ${durationMin}-min slot — Quick Book`}
                        >
                          {width >= 60 ? (
                            <span className="truncate px-s1">
                              {durationMin}m · Quick book
                            </span>
                          ) : (
                            <span aria-hidden="true">+</span>
                          )}
                        </Link>
                      );
                    })}

                    {/* Drop-target hover indicator */}
                    {dropHover && dropHover.staffId === s.id ? (
                      <div
                        className="pointer-events-none absolute top-1 z-[5] rounded-sm bg-sage/20 ring-1 ring-sage"
                        style={{
                          left: dropHover.leftPx,
                          width: Math.max(8, dropHover.widthPx),
                          height: LANE_HEIGHT - 8,
                        }}
                        aria-hidden="true"
                      />
                    ) : null}

                    {/* Schedule blocks */}
                    {items
                      .filter((it) => it.kind === 'block')
                      .map((it) => {
                        if (it.kind !== 'block') return null;
                        const left = (it.startMin / 60) * PX_PER_HOUR;
                        const width =
                          ((it.endMin - it.startMin) / 60) * PX_PER_HOUR;
                        return (
                          <div
                            key={it.id}
                            className={cn(
                              'absolute z-[2]',
                              draggingId && 'pointer-events-none',
                            )}
                            style={{
                              left: left + 2,
                              width: Math.max(8, width - 4),
                              top: 8,
                              height: LANE_HEIGHT - 16,
                            }}
                          >
                            <CalendarStaffBlock
                              block={it.block}
                              onDelete={onDeleteScheduleBlock}
                            />
                          </div>
                        );
                      })}

                    {/* Appointments */}
                    {items
                      .filter((it) => it.kind === 'appt')
                      .map((it) => {
                        if (it.kind !== 'appt') return null;
                        const appt = it.appointment;
                        const left = (it.startMin / 60) * PX_PER_HOUR;
                        const width =
                          ((it.endMin - it.startMin) / 60) * PX_PER_HOUR;
                        const canDrag = DRAGGABLE_APPOINTMENT_STATES.includes(
                          appt.state,
                        );
                        const isSelected =
                          appt.id === selectedAppointmentId;
                        const isNextUp = nextAppointmentId === appt.id;
                        return (
                          <Link
                            key={appt.id}
                            href={hrefSelected(appt.id) as Route}
                            draggable={canDrag}
                            onDragStart={
                              canDrag
                                ? (e) => {
                                    e.dataTransfer.setData(
                                      RESCHEDULE_DRAG_MIME,
                                      JSON.stringify({
                                        appointmentId: appt.id,
                                      } satisfies DragPayload),
                                    );
                                    e.dataTransfer.effectAllowed = 'move';
                                    setDraggingId(appt.id);
                                  }
                                : undefined
                            }
                            onDragEnd={
                              canDrag ? () => setDraggingId(null) : undefined
                            }
                            className={cn(
                              'absolute z-[4] no-underline',
                              canDrag &&
                                'cursor-grab active:cursor-grabbing',
                              draggingId === appt.id && 'opacity-50',
                            )}
                            style={{
                              left: left + 2,
                              width: Math.max(40, width - 4),
                              top: 8,
                              height: LANE_HEIGHT - 16,
                            }}
                            aria-label={`Open appointment for ${
                              clientDisplayNames?.[appt.clientId] ?? 'client'
                            }`}
                          >
                            <CalendarEventBlock
                              appointment={appt}
                              service={
                                serviceById.get(appt.serviceId) ?? null
                              }
                              isSelected={isSelected}
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
                                isNextUp ? 'Next up' : undefined
                              }
                            />
                          </Link>
                        );
                      })}
                  </div>
                </div>
              );
            })}

            {/* NOW marker — only when viewing today; spans all lanes */}
            {isToday(date) ? (
              <CalendarNowMarker
                startHour={START_HOUR}
                totalHours={TOTAL_HOURS}
                pxPerHour={PX_PER_HOUR}
                nameColumnWidth={NAME_COLUMN_WIDTH}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
