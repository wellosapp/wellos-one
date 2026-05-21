import Link from 'next/link';

import { Badge, Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Appointment, AppointmentState } from '@/lib/api/appointments';

// Renders the occurrence list for a series detail page. Past occurrences
// are dimmed; cancelled occurrences are struck through. Links route to the
// calendar drawer (`/admin/calendar?date=…&selected=appt.id`) since there
// is no dedicated `/admin/appointments/[id]` page yet.

const STATE_LABEL: Record<AppointmentState, string> = {
  requested: 'Requested',
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

function stateTone(s: AppointmentState): 'green' | 'amber' | 'red' | 'accent' | 'neutral' {
  switch (s) {
    case 'requested':
    case 'checked_in':
    case 'in_progress':
      return 'amber';
    case 'confirmed':
      return 'accent';
    case 'completed':
      return 'green';
    case 'cancelled':
    case 'no_show':
      return 'red';
    case 'scheduled':
    default:
      return 'neutral';
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toDateParam(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

interface OccurrencesTableProps {
  occurrences: Appointment[];
}

export function OccurrencesTable({ occurrences }: OccurrencesTableProps) {
  if (occurrences.length === 0) {
    return (
      <Card padding="md">
        <p className="t-body-sm text-ink-soft">No occurrences on file.</p>
      </Card>
    );
  }

  const now = Date.now();

  return (
    <Card padding="sm" className="overflow-hidden p-0">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-surface-3 bg-surface-2 text-left">
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Date</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Time</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Status</th>
            <th className="t-eyebrow px-s4 py-s3 text-right text-ink-soft">
              Open
            </th>
          </tr>
        </thead>
        <tbody>
          {occurrences.map((occ) => {
            const isPast = new Date(occ.scheduledEndAt).getTime() < now;
            const isCancelled =
              occ.state === 'cancelled' || occ.state === 'no_show';
            const rowClass = cn(
              'border-b border-surface-3 last:border-b-0',
              isPast && 'opacity-60',
            );
            const dateClass = cn(isCancelled && 'line-through');
            return (
              <tr key={occ.id} className={rowClass}>
                <td className={cn('px-s4 py-s3 t-body-sm text-ink', dateClass)}>
                  {formatDate(occ.scheduledStartAt)}
                </td>
                <td className={cn('px-s4 py-s3 t-body-sm text-ink-soft', dateClass)}>
                  {formatTime(occ.scheduledStartAt)} –{' '}
                  {formatTime(occ.scheduledEndAt)}
                </td>
                <td className="px-s4 py-s3">
                  <Badge tone={stateTone(occ.state)}>
                    {STATE_LABEL[occ.state]}
                  </Badge>
                </td>
                <td className="px-s4 py-s3 text-right">
                  <Link
                    href={{
                      pathname: '/admin/calendar',
                      query: {
                        date: toDateParam(occ.scheduledStartAt),
                        selected: occ.id,
                      },
                    }}
                    className="t-body-sm text-accent no-underline hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
