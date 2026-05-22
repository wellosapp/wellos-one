import type { Appointment } from '@/lib/api/appointments';
import { formatTimeLocal } from '@/lib/calendar';

interface CalendarRiverSessionDetailProps {
  appointment?: Appointment;
  clientFirstName?: string;
  serviceName?: string;
  staffFirstName?: string;
}

/**
 * Compact summary card for the left rail. The full edit/notes experience
 * still lives in AppointmentDrawer (right side); this card just confirms what
 * the operator selected and links visually to the drawer.
 */
export function CalendarRiverSessionDetail({
  appointment,
  clientFirstName,
  serviceName,
  staffFirstName,
}: CalendarRiverSessionDetailProps) {
  if (!appointment) {
    return (
      <div className="rounded-md border border-surface-3 bg-white p-s4 shadow-sm">
        <span className="t-eyebrow text-ink-soft">Session detail</span>
        <p className="mt-s2 font-display italic t-body-sm text-ink-soft">
          Select a session to inspect.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-surface-3 bg-white p-s4 shadow-sm">
      <span className="t-eyebrow text-ink-soft">Session detail</span>
      <p className="mt-s2 t-display-sm text-ink">{serviceName ?? 'Service'}</p>
      <p className="mt-s1 t-caption font-mono text-ink-soft">
        {formatTimeLocal(appointment.scheduledStartAt)}
        {' – '}
        {formatTimeLocal(appointment.scheduledEndAt)}
      </p>
      <dl className="mt-s3 grid gap-s2 t-body-sm">
        {clientFirstName ? (
          <div className="flex justify-between gap-s2">
            <dt className="text-ink-soft">Client</dt>
            <dd className="truncate font-medium text-ink">
              {clientFirstName}
            </dd>
          </div>
        ) : null}
        {staffFirstName ? (
          <div className="flex justify-between gap-s2">
            <dt className="text-ink-soft">Staff</dt>
            <dd className="truncate font-medium text-ink">{staffFirstName}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
