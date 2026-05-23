import { CalendarIcon } from '@/app/admin/_shell/icons';
import type { Appointment } from '@/lib/api/appointments';
import { cn } from '@/lib/cn';

import {
  UpcomingAppointmentCard,
  type UpcomingService,
  type UpcomingStaff,
} from './UpcomingAppointmentCard';

// Upcoming section. Renders inside its own section card with a custom
// header (eyebrow + headline + optional count chip). The count chip is
// only shown when the list is non-empty.

export type UpcomingItem = {
  appointment: Appointment;
  service: UpcomingService | null;
  staff: UpcomingStaff | null;
};

export function UpcomingList({
  appointments,
  clientId,
}: {
  appointments: UpcomingItem[];
  clientId: string;
}) {
  const count = appointments.length;

  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
      )}
    >
      <header
        className={cn(
          'border-b border-line bg-surface-sunk/40',
          'px-s6 py-s5 lg:px-s8 lg:py-s6',
        )}
      >
        <div className="flex items-center gap-s2 t-eyebrow tracking-wide text-sage">
          <CalendarIcon size={14} />
          <span>UPCOMING</span>
          {count > 0 && (
            <span className="text-[12px] font-medium normal-case tracking-normal text-ink-3">
              {count}
            </span>
          )}
        </div>
        <h2 className="mt-s2 font-display text-[22px] leading-tight text-ink">
          What&apos;s coming up.
        </h2>
      </header>
      <div className="px-s6 py-s5 lg:px-s8 lg:py-s6">
        {count === 0 ? (
          <p className="t-body-md italic text-ink-3">
            No upcoming appointments for this client.
          </p>
        ) : (
          <div className="flex flex-col gap-s4">
            {appointments.map((item) => (
              <UpcomingAppointmentCard
                key={item.appointment.id}
                appointment={item.appointment}
                service={item.service}
                staff={item.staff}
                clientId={clientId}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
