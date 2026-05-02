'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { cn } from '@/lib/cn';
import type { Appointment } from '@/lib/api/appointments';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';
import { formatTimeLocal } from '@/lib/calendar';
import { isSameLocalDay } from '@/lib/calendar-view';
import { formatDateShort } from '@/lib/calendar';

interface CalendarWeekViewProps {
  weekDays: Date[];
  appointments: Appointment[];
  staffById: Map<string, Staff>;
  serviceById: Map<string, Service>;
  clientDisplayNames?: Record<string, string>;
  hrefSelected: (appointmentId: string, tab?: string) => string;
  /** Admin shows provider name on each card; staff hides it. */
  mode: 'admin' | 'staff';
}

export function CalendarWeekView({
  weekDays,
  appointments,
  staffById,
  serviceById,
  clientDisplayNames,
  hrefSelected,
  mode,
}: CalendarWeekViewProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-surface-3 bg-white shadow-sm">
      <div className="flex min-w-[840px] divide-x divide-surface-3">
        {weekDays.map((day) => {
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
              className="flex min-w-[120px] flex-1 flex-col bg-[#fbfbfa]"
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
                {dayAppts.length === 0 ? (
                  <span className="t-caption text-ink-soft">—</span>
                ) : (
                  dayAppts.map((appt) => {
                    const staff = staffById.get(appt.staffId);
                    const service = serviceById.get(appt.serviceId);
                    const clientName = clientDisplayNames?.[appt.clientId];
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
                        {mode === 'admin' && staff ? (
                          <div className="mt-s1 line-clamp-1 t-caption text-ink-soft">
                            {staff.firstName}
                            {staff.lastName ? ` ${staff.lastName}` : ''}
                          </div>
                        ) : null}
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
