import { Badge, Card } from '@/components/ui';
import type {
  Appointment,
  AppointmentSource,
  AppointmentState,
} from '@/lib/api/appointments';

import { UpcomingActions } from './UpcomingActions';

// One card per upcoming appointment. Visual language matches the Visits
// timeline cards (TimelineAppointmentCard) — date eyebrow + state badge +
// "{service} — {duration} minutes" headline + "with {staff}" line + italic
// source label — with a right-side kebab menu (UpcomingActions) for View /
// Reschedule (coming soon) / Cancel.
//
// Service + staff are hydrated from the directory by the parent because
// listAppointments returns only foreign-key IDs.

export type UpcomingService = {
  id: string;
  name: string;
  durationMinutes: number;
};

export type UpcomingStaff = {
  id: string;
  firstName: string;
  lastName: string | null;
  jobTitle: string | null;
};

const STATUS_TONE: Record<
  AppointmentState,
  'neutral' | 'accent' | 'red' | 'amber' | 'green'
> = {
  requested: 'neutral',
  scheduled: 'neutral',
  confirmed: 'accent',
  checked_in: 'amber',
  in_progress: 'amber',
  completed: 'green',
  cancelled: 'red',
  no_show: 'red',
};

const STATUS_LABEL: Record<AppointmentState, string> = {
  requested: 'Requested',
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

const SOURCE_LABEL: Record<AppointmentSource, string> = {
  web: 'Online',
  staff: 'Admin',
  widget: 'Embed',
  api: 'API',
  import: 'Import',
  campaign: 'Campaign',
  walk_in: 'Walk-in',
  quick_book: 'Quick Book',
  calendar_drag: 'Calendar drag',
};

function sourceLabel(source: AppointmentSource | null): string | null {
  if (!source) return null;
  return SOURCE_LABEL[source] ?? null;
}

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startStr = start.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const endStr = end.toLocaleString(undefined, { timeStyle: 'short' });
  return `${startStr} – ${endStr}`;
}

export function UpcomingAppointmentCard({
  appointment,
  service,
  staff,
  clientId,
}: {
  appointment: Appointment;
  service: UpcomingService | null;
  staff: UpcomingStaff | null;
  clientId: string;
}) {
  return (
    <Card padding="md" as="article" className="flex flex-col gap-s3">
      <header className="flex flex-wrap items-start justify-between gap-s3">
        <div className="flex min-w-0 flex-col gap-s1">
          <span className="t-eyebrow text-accent">
            {formatRange(
              appointment.scheduledStartAt,
              appointment.scheduledEndAt,
            )}
          </span>
          <h3 className="t-display-sm">
            {service ? `${service.name} — ${service.durationMinutes} minutes` : 'Service'}
          </h3>
          {staff && (
            <p className="t-body-sm text-ink-soft">
              with {staff.firstName}
              {staff.lastName ? ` ${staff.lastName}` : ''}
              {staff.jobTitle ? ` · ${staff.jobTitle}` : ''}
            </p>
          )}
          {sourceLabel(appointment.source) ? (
            <p className="t-body-sm italic text-ink-3">
              {sourceLabel(appointment.source)}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-s2">
          <Badge tone={STATUS_TONE[appointment.state]}>
            {STATUS_LABEL[appointment.state]}
          </Badge>
          <UpcomingActions
            appointmentId={appointment.id}
            appointmentStartIso={appointment.scheduledStartAt}
            clientId={clientId}
          />
        </div>
      </header>

      {appointment.notes && (
        <p className="t-body-md whitespace-pre-wrap text-ink">
          {appointment.notes}
        </p>
      )}
    </Card>
  );
}
