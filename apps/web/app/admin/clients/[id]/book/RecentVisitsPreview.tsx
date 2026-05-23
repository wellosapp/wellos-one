import Link from 'next/link';
import type { Route } from 'next';

import { ClockIcon } from '@/app/admin/_shell/icons';
import { Badge } from '@/components/ui';
import type {
  AppointmentSummary,
  ClientTimelineVisit,
} from '@/lib/api/timeline';
import { cn } from '@/lib/cn';

// Compact preview of the two most recent past visits with a link back to
// the full Visits tab. Single-line per row — no SOAP / notes / triage
// expansion (that lives in the Visits timeline).

const STATUS_TONE: Record<
  AppointmentSummary['state'],
  'neutral' | 'accent' | 'red' | 'amber' | 'green'
> = {
  scheduled: 'neutral',
  confirmed: 'accent',
  checked_in: 'amber',
  in_progress: 'amber',
  completed: 'green',
  cancelled: 'red',
  no_show: 'red',
};

const STATUS_LABEL: Record<AppointmentSummary['state'], string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

function formatVisitDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function RecentVisitsPreview({
  visits,
  clientId,
}: {
  visits: ClientTimelineVisit[];
  clientId: string;
}) {
  const seeAllHref = (`/admin/clients/${clientId}/timeline`) as Route;

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
          <ClockIcon size={14} />
          <span>RECENT</span>
        </div>
        <h2 className="mt-s2 font-display text-[22px] leading-tight text-ink">
          Recent visits
        </h2>
      </header>
      <div className="flex flex-col gap-s3 px-s6 py-s5 lg:px-s8 lg:py-s6">
        {visits.length === 0 ? (
          <p className="t-body-md italic text-ink-3">No past visits yet.</p>
        ) : (
          <ul className="flex flex-col gap-s2">
            {visits.map((visit) => (
              <li
                key={visit.appointment.id}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-s3',
                  'rounded-sm border border-line bg-surface-1 px-s3 py-s2',
                )}
              >
                <div className="min-w-0 t-body-sm text-ink">
                  <span className="text-ink-3">
                    {formatVisitDate(visit.appointment.scheduledStartAt)}
                  </span>
                  <span className="text-ink-3"> · </span>
                  <span className="font-medium">{visit.service.name}</span>
                  <span className="text-ink-3"> · with </span>
                  <span>{visit.staff.firstName}</span>
                </div>
                <Badge tone={STATUS_TONE[visit.appointment.state]}>
                  {STATUS_LABEL[visit.appointment.state]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={seeAllHref}
          className="t-body-sm text-sage no-underline hover:text-sage-deep"
        >
          See all visits →
        </Link>
      </div>
    </section>
  );
}
