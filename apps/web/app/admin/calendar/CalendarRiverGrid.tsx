'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { cn } from '@/lib/cn';
import {
  formatTimeLocal,
  localDayAndMinutesToUtcIso,
  staffScheduleBlockTouchesLocalDay,
} from '@/lib/calendar';
import type {
  Appointment,
  AppointmentState,
} from '@/lib/api/appointments';
import type { ClassInstanceWithRelations } from '@/lib/api/class-instances';
import type { StaffScheduleBlock } from '@/lib/api/staff-schedule-blocks';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';

import { rescheduleAppointmentCalendarDragAction } from './_actions';
import { CalendarNowMarker } from './CalendarNowMarker';
import { CalendarRiverChip } from './CalendarRiverChip';
import { CalendarRiverStaffBlock } from './CalendarRiverStaffBlock';

// ---- Layout constants (mirror the design's admin.jsx + shared.jsx) -------

const NAME_COL_WIDTH = 168;
const PX_PER_HOUR = 110;
const LANE_HEIGHT = 78;
const ANCHOR_HOUR = 7;
const DAY_END_HOUR = 20;
const TOTAL_HOURS = DAY_END_HOUR - ANCHOR_HOUR; // 13
const SNAP_MINUTES = 15;

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

/**
 * Convert an x-pixel offset (relative to the river's hour zone, i.e. AFTER
 * subtracting NAME_COL_WIDTH) into minutes-since-midnight, snapped to the
 * 15-minute grid. Preserves the existing snap rule from the vertical grid.
 */
function pxToSnappedMinutes(px: number, pxPerHour: number): number {
  const startMin = ANCHOR_HOUR * 60;
  const endMin = DAY_END_HOUR * 60;
  const offsetMin = (px / pxPerHour) * 60;
  const raw = startMin + offsetMin;
  const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.max(startMin, Math.min(endMin, snapped));
}

// ---- Per-row open-gap helpers --------------------------------------------

type LaneRange = { startMin: number; endMin: number };

function appointmentRange(a: Appointment): LaneRange {
  const s = new Date(a.scheduledStartAt);
  const e = new Date(a.scheduledEndAt);
  return {
    startMin: s.getHours() * 60 + s.getMinutes(),
    endMin: e.getHours() * 60 + e.getMinutes(),
  };
}

function blockRange(b: StaffScheduleBlock): LaneRange {
  const s = new Date(b.startsAt);
  const e = new Date(b.endsAt);
  return {
    startMin: s.getHours() * 60 + s.getMinutes(),
    endMin: e.getHours() * 60 + e.getMinutes(),
  };
}

function classInstanceRange(c: ClassInstanceWithRelations): LaneRange {
  const s = new Date(c.scheduledStartAt);
  const e = new Date(c.scheduledEndAt);
  return {
    startMin: s.getHours() * 60 + s.getMinutes(),
    endMin: e.getHours() * 60 + e.getMinutes(),
  };
}

/**
 * Walk a staff lane's appointments + blocks and return the gaps in
 * [ANCHOR_HOUR, DAY_END_HOUR]. Each gap ≥ 15 min becomes a Quick Book entry.
 */
function gapsForLane(ranges: LaneRange[]): LaneRange[] {
  const startMin = ANCHOR_HOUR * 60;
  const endMin = DAY_END_HOUR * 60;
  const sorted = [...ranges].sort((a, b) => a.startMin - b.startMin);
  const merged: LaneRange[] = [];
  for (const r of sorted) {
    const clipped = {
      startMin: Math.max(startMin, r.startMin),
      endMin: Math.min(endMin, r.endMin),
    };
    if (clipped.endMin <= clipped.startMin) continue;
    const last = merged[merged.length - 1];
    if (last && clipped.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, clipped.endMin);
    } else {
      merged.push(clipped);
    }
  }
  const gaps: LaneRange[] = [];
  let cursor = startMin;
  for (const r of merged) {
    if (r.startMin - cursor >= SNAP_MINUTES) {
      gaps.push({ startMin: cursor, endMin: r.startMin });
    }
    cursor = Math.max(cursor, r.endMin);
  }
  if (endMin - cursor >= SNAP_MINUTES) {
    gaps.push({ startMin: cursor, endMin });
  }
  return gaps;
}

function minutesSinceAnchorPx(min: number): number {
  return ((min - ANCHOR_HOUR * 60) / 60) * PX_PER_HOUR;
}

// ---- Component -----------------------------------------------------------

interface CalendarRiverGridProps {
  date: Date;
  staff: Staff[];
  serviceById: Map<string, Service>;
  appointments: Appointment[];
  /** Phase 2a — class instances scheduled on the visible day. Rendered as chips. */
  classInstances: ClassInstanceWithRelations[];
  scheduleBlocksByStaff: Record<string, StaffScheduleBlock[]>;
  hrefSelected: (appointmentId: string, tab?: string) => string;
  selectedAppointmentId: string | null;
  /** URL builder for opening the class instance drawer. */
  hrefSelectedClassInstance: (instanceId: string) => string;
  /** Active class-instance drawer (used for selected-state styling). */
  selectedClassInstanceId: string | null;
  clientDisplayNames?: Record<string, string>;
  hrefQuickBook: string;
  nextAppointmentId?: string | null;
  onDeleteScheduleBlock?: (blockId: string) => void;
}

export function CalendarRiverGrid({
  date,
  staff,
  serviceById,
  appointments,
  classInstances,
  scheduleBlocksByStaff,
  hrefSelected,
  selectedAppointmentId,
  hrefSelectedClassInstance,
  selectedClassInstanceId,
  clientDisplayNames,
  hrefQuickBook,
  nextAppointmentId,
  onDeleteScheduleBlock,
}: CalendarRiverGridProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [, startReschedule] = useTransition();

  const apptsByStaff = new Map<string, Appointment[]>();
  for (const a of appointments) {
    const list = apptsByStaff.get(a.staffId);
    if (list) list.push(a);
    else apptsByStaff.set(a.staffId, [a]);
  }

  // Phase 2a — bucket class instances by instructor staffId so each lane
  // can render its own chips alongside the appointment chips.
  const classInstancesByStaff = new Map<string, ClassInstanceWithRelations[]>();
  for (const c of classInstances) {
    const list = classInstancesByStaff.get(c.staffId);
    if (list) list.push(c);
    else classInstancesByStaff.set(c.staffId, [c]);
  }

  const handleLaneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleLaneDrop = (e: React.DragEvent, targetStaffId: string) => {
    e.preventDefault();
    const payload = parseDragPayload(e.dataTransfer);
    setDraggingId(null);
    if (!payload) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    // x relative to the START of the hour zone (after the sticky name col).
    const relX =
      e.clientX -
      scrollEl.getBoundingClientRect().left +
      scrollEl.scrollLeft -
      NAME_COL_WIDTH;
    if (relX < 0) return;
    const minutes = pxToSnappedMinutes(relX, PX_PER_HOUR);
    const scheduledStartAt = localDayAndMinutesToUtcIso(date, minutes);

    startReschedule(async () => {
      setRescheduleError(null);
      // Cross-staff drop: targetStaffId is bound per-lane, so dropping into a
      // different lane reassigns the appointment to that staff.
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

  const totalWidth = NAME_COL_WIDTH + TOTAL_HOURS * PX_PER_HOUR;
  const totalHeight = staff.length * LANE_HEIGHT + 4;

  return (
    <div className="overflow-hidden rounded-xl border border-surface-3 bg-white shadow-sm">
      {rescheduleError ? (
        <div
          role="alert"
          className="border-b border-red/30 bg-red-pale px-s4 py-s2 t-caption text-red"
        >
          {rescheduleError}
        </div>
      ) : null}

      <div ref={scrollRef} className="relative overflow-x-auto">
        <div className="relative" style={{ width: totalWidth }}>
          {/* Hour scale header */}
          <div
            className="sticky top-0 z-20 grid border-b border-surface-3 bg-white"
            style={{ gridTemplateColumns: `${NAME_COL_WIDTH}px 1fr` }}
          >
            <div className="border-r border-surface-3 px-s4 py-s2 t-eyebrow text-ink-soft">
              Staff · time →
            </div>
            <div className="relative h-9">
              {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => {
                const h = ANCHOR_HOUR + i;
                const h12 = ((h + 11) % 12) + 1;
                const period = h >= 12 ? 'PM' : 'AM';
                return (
                  <span
                    key={i}
                    className="absolute top-0 flex h-full items-center pl-s1 t-caption font-mono font-semibold text-ink-soft"
                    style={{ left: i * PX_PER_HOUR }}
                  >
                    {h12}
                    {period}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Lanes container — relative so absolute chips position against it. */}
          <div
            className="relative"
            style={{ width: totalWidth, height: totalHeight }}
          >
            {/* Hour grid lines */}
            {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => (
              <div
                key={`gl-${i}`}
                aria-hidden="true"
                className={cn(
                  'absolute top-0 bottom-0 w-px',
                  i % 2 === 0 ? 'bg-surface-3' : 'bg-surface-2',
                )}
                style={{ left: NAME_COL_WIDTH + i * PX_PER_HOUR }}
              />
            ))}

            {/* Staff lanes */}
            {staff.map((s, idx) => {
              const list = apptsByStaff.get(s.id) ?? [];
              const classList = classInstancesByStaff.get(s.id) ?? [];
              const blocksForStaff = (
                scheduleBlocksByStaff[s.id] ?? []
              ).filter((b) => staffScheduleBlockTouchesLocalDay(b, date));
              const ranges: LaneRange[] = [
                ...list.map(appointmentRange),
                ...blocksForStaff.map(blockRange),
                ...classList.map(classInstanceRange),
              ];
              const gaps = gapsForLane(ranges);
              const laneTop = idx * LANE_HEIGHT;

              return (
                <div
                  key={s.id}
                  className="absolute left-0 right-0 border-b border-surface-3"
                  style={{ top: laneTop, height: LANE_HEIGHT }}
                >
                  {/* Sticky lane label */}
                  <div
                    className={cn(
                      'absolute left-0 top-0 z-[2] flex h-full items-center gap-s3 border-r border-surface-3 px-s4',
                      'bg-surface',
                    )}
                    style={{ width: NAME_COL_WIDTH }}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-pale t-caption font-semibold text-ink"
                    >
                      {(s.firstName?.charAt(0) ?? '').toUpperCase()}
                      {(s.lastName?.charAt(0) ?? '').toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <span className="block truncate t-body-sm font-semibold text-ink">
                        {s.firstName}
                      </span>
                      {s.jobTitle ? (
                        <span className="block truncate t-caption text-ink-soft">
                          {s.jobTitle}
                        </span>
                      ) : (
                        <span className="block truncate t-caption text-ink-soft">
                          Provider
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Lane drop zone (the hour area). Bound to this staff id so
                      cross-staff drop just works. */}
                  <div
                    className={cn(
                      'absolute top-0 bottom-0 right-0',
                      idx % 2 === 1 ? 'bg-surface/30' : '',
                    )}
                    style={{ left: NAME_COL_WIDTH }}
                    onDragOver={handleLaneDragOver}
                    onDrop={(e) => handleLaneDrop(e, s.id)}
                  >
                    {/* Open-gap quick book links */}
                    {gaps.map((g, i) => {
                      const leftPx = minutesSinceAnchorPx(g.startMin);
                      const widthPx = minutesSinceAnchorPx(g.endMin) - leftPx;
                      if (widthPx < 24) return null;
                      return (
                        <Link
                          key={`gap-${s.id}-${i}`}
                          href={hrefQuickBook as Route}
                          className={cn(
                            'absolute top-s2 bottom-s2 flex items-center justify-center rounded-md',
                            'border border-dashed border-surface-3 bg-white/60 t-caption font-semibold text-ink-soft',
                            'transition-colors duration-fast hover:border-accent/40 hover:bg-accent-pale/40',
                            draggingId && 'pointer-events-none',
                          )}
                          style={{ left: leftPx + 2, width: widthPx - 4 }}
                        >
                          + Quick book
                        </Link>
                      );
                    })}

                    {/* Schedule blocks */}
                    {blocksForStaff.map((b) => {
                      const r = blockRange(b);
                      const leftPx = minutesSinceAnchorPx(r.startMin);
                      const widthPx =
                        minutesSinceAnchorPx(r.endMin) - leftPx;
                      if (widthPx <= 0) return null;
                      return (
                        <div
                          key={b.id}
                          className={cn(
                            'absolute top-s2 bottom-s2 z-[3]',
                            draggingId && 'pointer-events-none',
                          )}
                          style={{ left: leftPx + 2, width: widthPx - 4 }}
                        >
                          <CalendarRiverStaffBlock
                            block={b}
                            onDelete={onDeleteScheduleBlock}
                          />
                        </div>
                      );
                    })}

                    {/* Class instance chips (Phase 2a). Rendered with the
                        class's color and a dashed outline so they read as
                        distinct from appointment chips. Capacity shows 0/X
                        until Phase 3 wires real bookings. */}
                    {classList.map((inst) => {
                      const r = classInstanceRange(inst);
                      const leftPx = minutesSinceAnchorPx(r.startMin);
                      const widthPx =
                        minutesSinceAnchorPx(r.endMin) - leftPx;
                      if (widthPx <= 0) return null;
                      const isSelected = inst.id === selectedClassInstanceId;
                      const capacity =
                        inst.capacityOverride ?? inst.class.maxCapacity;
                      const bg = inst.class.color ?? undefined;
                      return (
                        <Link
                          key={`ci-${inst.id}`}
                          href={hrefSelectedClassInstance(inst.id) as Route}
                          className={cn(
                            'absolute top-s2 bottom-s2 z-[4] flex flex-col gap-[2px] overflow-hidden rounded-md',
                            'border-2 border-dashed bg-white/85 px-s2 py-s1 no-underline',
                            'transition-colors duration-fast hover:bg-white',
                            isSelected
                              ? 'ring-2 ring-accent/60 ring-offset-1'
                              : '',
                          )}
                          style={{
                            left: leftPx + 2,
                            width: widthPx - 4,
                            borderColor: bg ?? 'var(--accent)',
                            backgroundColor: bg
                              ? `${bg}22`
                              : undefined,
                          }}
                          aria-label={`Open class instance ${inst.class.name}`}
                          title={`${inst.class.name} · ${formatTimeLocal(inst.scheduledStartAt)}`}
                        >
                          <span className="t-eyebrow truncate text-ink-soft">
                            Class
                          </span>
                          <span className="t-body-sm truncate font-semibold text-ink">
                            {inst.class.name}
                          </span>
                          <span className="t-caption truncate text-ink-soft">
                            0 / {capacity}
                          </span>
                        </Link>
                      );
                    })}

                    {/* Appointment chips */}
                    {list.map((appt) => {
                      const r = appointmentRange(appt);
                      const leftPx = minutesSinceAnchorPx(r.startMin);
                      const widthPx =
                        minutesSinceAnchorPx(r.endMin) - leftPx;
                      if (widthPx <= 0) return null;
                      const canDrag = DRAGGABLE_APPOINTMENT_STATES.includes(
                        appt.state,
                      );
                      const isSelected =
                        appt.id === selectedAppointmentId;
                      const isNextUp = appt.id === nextAppointmentId;

                      return (
                        <div
                          key={appt.id}
                          className="absolute top-s2 bottom-s2 z-[5]"
                          style={{ left: leftPx + 2, width: widthPx - 4 }}
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
                          onDragEnd={() => setDraggingId(null)}
                          title={canDrag ? 'Drag to reschedule' : undefined}
                        >
                          <Link
                            href={hrefSelected(appt.id) as Route}
                            className={cn(
                              'block h-full w-full no-underline',
                              canDrag ? 'cursor-grab active:cursor-grabbing' : '',
                              draggingId === appt.id && 'opacity-70',
                            )}
                            aria-label={`Open appointment ${appt.id}`}
                          >
                            <CalendarRiverChip
                              appointment={appt}
                              service={
                                serviceById.get(appt.serviceId) ?? null
                              }
                              staff={s}
                              clientDisplayName={
                                clientDisplayNames?.[appt.clientId]
                              }
                              isSelected={isSelected}
                              isNextUp={isNextUp}
                            />
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* NOW marker — pulses + reticks every minute */}
            <CalendarNowMarker
              startHour={ANCHOR_HOUR}
              totalHours={TOTAL_HOURS}
              pxPerHour={PX_PER_HOUR}
              nameColumnWidth={NAME_COL_WIDTH}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Layout constants exported for the density-wave alignment in CalendarDayView. */
export const RIVER_LAYOUT = {
  ANCHOR_HOUR,
  DAY_END_HOUR,
  TOTAL_HOURS,
  PX_PER_HOUR,
  NAME_COL_WIDTH,
  LANE_HEIGHT,
} as const;
