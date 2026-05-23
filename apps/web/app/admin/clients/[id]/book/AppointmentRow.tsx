import Link from 'next/link';
import type { Route } from 'next';

import { Badge } from '@/components/ui';
import type {
  Appointment,
  AppointmentSource,
  AppointmentState,
} from '@/lib/api/appointments';
import { cn } from '@/lib/cn';

// One inspectable row card per appointment on the Book tab. Visual language
// mirrors TimelineAppointmentCard / UpcomingAppointmentCard from the prior
// iteration — date+time pill, state badge, "{service} — {duration} minutes"
// headline, "with {staff}" line, source label, list price, booked-when,
// intake status pill. The whole card is a Link to `?selected={id}` so the
// click target is the entire surface; the AppointmentDrawer then mounts
// in-place via the parent page's bundle-fetch.
//
// Cancelled appointments get a small terracotta divider footer with the
// cancel reason + when.

export type AppointmentRowService = {
  id: string;
  name: string;
  durationMinutes: number;
};

export type AppointmentRowStaff = {
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

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
];

function relativeTime(iso: string): string {
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return 'unknown';
  const diffMs = target - Date.now();
  const absMs = Math.abs(diffMs);
  if (absMs < 60 * 1000) return diffMs <= 0 ? 'just now' : 'in a moment';
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const { unit, ms } of RELATIVE_UNITS) {
    if (absMs >= ms) {
      const value = Math.round(diffMs / ms);
      return rtf.format(value, unit);
    }
  }
  return rtf.format(Math.round(diffMs / (60 * 1000)), 'minute');
}

const INTAKE_LABEL: Record<string, string> = {
  pending: 'Pending',
  sent: 'Sent',
  completed: 'Completed',
  expired: 'Expired',
};

export function AppointmentRow({
  appointment,
  service,
  staff,
  selectedHref,
}: {
  appointment: Appointment;
  service: AppointmentRowService | null;
  staff: AppointmentRowStaff | null;
  selectedHref: Route;
}) {
  const source = sourceLabel(appointment.source);
  const intakeLabel = appointment.clientIntakeStatus
    ? (INTAKE_LABEL[appointment.clientIntakeStatus] ?? 'Unknown')
    : 'Unknown';

  return (
    <Link
      href={selectedHref}
      className={cn(
        'block rounded-md border border-line bg-surface p-s4 no-underline',
        'transition-colors duration-fast hover:bg-surface-sunk/30',
      )}
    >
      <div className="flex flex-col gap-s2">
        <header className="flex flex-wrap items-baseline justify-between gap-s2">
          <span className="t-eyebrow text-accent">
            {formatRange(
              appointment.scheduledStartAt,
              appointment.scheduledEndAt,
            )}
          </span>
          <Badge tone={STATUS_TONE[appointment.state]}>
            {STATUS_LABEL[appointment.state]}
          </Badge>
        </header>

        <h3 className="t-display-sm text-ink">
          {service
            ? `${service.name} — ${service.durationMinutes} minutes`
            : 'Service'}
        </h3>

        {staff && (
          <p className="t-body-sm text-ink-soft">
            with {staff.firstName}
            {staff.lastName ? ` ${staff.lastName}` : ''}
            {staff.jobTitle ? ` · ${staff.jobTitle}` : ''}
          </p>
        )}

        {source && (
          <p className="t-body-sm italic text-ink-3">{source}</p>
        )}

        <div className="flex flex-wrap items-center gap-s2 t-body-sm text-ink">
          <span>{formatCents(appointment.bookedBasePriceCents)} list price</span>
          <span className="italic text-ink-3">(paid status — coming soon)</span>
        </div>

        <p className="t-body-sm text-ink-3">
          Booked {relativeTime(appointment.createdAt)}
        </p>

        <div className="flex flex-wrap items-center gap-s2 t-body-sm">
          <Badge tone="neutral">Intake: {intakeLabel}</Badge>
          <span className="italic text-ink-3">
            (per-appointment forms — coming soon)
          </span>
        </div>

        {appointment.state === 'cancelled' && (
          <div className="mt-s2 border-t border-line pt-s2">
            <p className="t-body-sm italic text-terracotta">
              Cancelled
              {appointment.cancelledAt
                ? ` ${relativeTime(appointment.cancelledAt)}`
                : ''}
              {' — '}
              {appointment.cancelReason ?? 'no reason recorded'}
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}
