'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Appointment } from '@/lib/api/appointments';
import type { StaffScheduleBlock } from '@/lib/api/staff-schedule-blocks';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';
import {
  formatDateShort,
  formatTimeLocal,
  staffScheduleBlockTouchesLocalDay,
} from '@/lib/calendar';
import { isSameLocalDay } from '@/lib/calendar-view';

import { intakeStatusCalendarChip } from './intake-status-label';

function blocksTouchingDay(
  scheduleBlocksByStaff: Record<string, StaffScheduleBlock[]>,
  day: Date,
): StaffScheduleBlock[] {
  const out: StaffScheduleBlock[] = [];
  for (const blocks of Object.values(scheduleBlocksByStaff)) {
    for (const b of blocks) {
      if (staffScheduleBlockTouchesLocalDay(b, day)) out.push(b);
    }
  }
  return out.sort(
    (a, b) =>
      new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
}

interface CalendarWeekViewProps {
  weekDays: Date[];
  appointments: Appointment[];
  staffById: Map<string, Staff>;
  serviceById: Map<string, Service>;
  clientDisplayNames?: Record<string, string>;
  hrefSelected: (appointmentId: string, tab?: string) => string;
  /** Admin shows provider name on each card; staff hides it. */
  mode: 'admin' | 'staff';
  /** Staff schedule blocks (same shape as day grid) — calendar-area-features §9. */
  scheduleBlocksByStaff?: Record<string, StaffScheduleBlock[]>;
  onDeleteScheduleBlock?: (blockId: string) => void;
}

export function CalendarWeekView({
  weekDays,
  appointments,
  staffById,
  serviceById,
  clientDisplayNames,
  hrefSelected,
  mode,
  scheduleBlocksByStaff = {},
  onDeleteScheduleBlock,
}: CalendarWeekViewProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-surface-3 bg-white shadow-sm">
      <div className="flex min-w-[840px] divide-x divide-surface-3">
        {weekDays.map((day) => {
          const dayBlocks = blocksTouchingDay(scheduleBlocksByStaff, day);
          const dayAppts = appointments
            .filter((a) => isSameLocalDay(new Date(a.scheduledStartAt), day))
            .sort(
              (a, b) =>
                new Date(a.scheduledStartAt).getTime() -
                new Date(b.scheduledStartAt).getTime(),
            );

          return (
            <div
              key={day.toISOString()}
              className="flex min-w-[120px] flex-1 flex-col bg-surface"
            >
              <div className="border-b border-surface-3 px-s2 py-s3 text-center">
                <div className="t-caption font-semibold uppercase text-ink-soft">
                  {day.toLocaleDateString(undefined, { weekday: 'short' })}
                </div>
                <div className="t-body-md font-semibold text-ink">
                  {formatDateShort(day)}
                </div>
              </div>
              <div className="flex flex-col gap-s2 p-s2">
                {dayBlocks.map((block) => {
                  const staff = staffById.get(block.staffId);
                  const catLabel = block.category.replace(/_/g, ' ');
                  return (
                    <div
                      key={block.id}
                      className={cn(
                        'rounded-lg border border-dashed border-ink-soft/35 bg-surface-2/90 p-s2 shadow-sm',
                      )}
                    >
                      <div className="flex items-start justify-between gap-s2">
                        <span className="t-caption font-semibold uppercase tracking-wide text-ink-soft">
                          {catLabel}
                        </span>
                        {onDeleteScheduleBlock ? (
                          <button
                            type="button"
                            className="t-caption shrink-0 font-medium text-ink-soft underline-offset-2 hover:text-red hover:underline"
                            onClick={() => {
                              if (
                                typeof window !== 'undefined' &&
                                window.confirm('Remove this blocked time?')
                              ) {
                                onDeleteScheduleBlock(block.id);
                              }
                            }}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-s1 line-clamp-2 t-body-sm font-medium text-ink">
                        {block.title}
                      </p>
                      <p className="mt-s1 t-caption text-ink-soft">
                        {formatTimeLocal(block.startsAt)} –{' '}
                        {formatTimeLocal(block.endsAt)}
                      </p>
                      {mode === 'admin' && staff ? (
                        <p className="mt-s1 line-clamp-1 t-caption text-ink-soft">
                          {staff.firstName}
                          {staff.lastName ? ` ${staff.lastName}` : ''}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
                {dayAppts.length === 0 && dayBlocks.length === 0 ? (
                  <span className="t-caption text-ink-soft">—</span>
                ) : null}
                {dayAppts.map((appt) => {
                    const staff = staffById.get(appt.staffId);
                    const service = serviceById.get(appt.serviceId);
                    const clientName = clientDisplayNames?.[appt.clientId];
                    const intakeChip = intakeStatusCalendarChip(
                      appt.clientIntakeStatus,
                    );
                    return (
                      <Link
                        key={appt.id}
                        href={hrefSelected(appt.id) as Route}
                        className={cn(
                          'block rounded-lg border border-surface-3 bg-white p-s2 no-underline shadow-sm',
                          'transition-shadow duration-fast hover:border-accent/40 hover:shadow-md',
                        )}
                      >
                        <div className="t-caption font-semibold text-accent">
                          {formatTimeLocal(appt.scheduledStartAt)}
                        </div>
                        <div className="mt-s1 line-clamp-2 t-body-sm font-medium text-ink">
                          {service?.name ?? 'Service'}
                        </div>
                        {clientName ? (
                          <div className="mt-s1 line-clamp-1 t-caption text-ink-soft">
                            {clientName}
                          </div>
                        ) : null}
                        {intakeChip ? (
                          <div className="mt-s1">
                            <Badge tone={intakeChip.tone} className="t-caption">
                              {intakeChip.label}
                            </Badge>
                          </div>
                        ) : null}
                        {mode === 'admin' && staff ? (
                          <div className="mt-s1 line-clamp-1 t-caption text-ink-soft">
                            {staff.firstName}
                            {staff.lastName ? ` ${staff.lastName}` : ''}
                          </div>
                        ) : null}
                      </Link>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
