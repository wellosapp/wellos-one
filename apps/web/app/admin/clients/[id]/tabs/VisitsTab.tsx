'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { LinkedNotesList } from '@/components/admin/LinkedNotesList';
import { Badge, Button, Card } from '@/components/ui';
import type { ClientTimelineResponse } from '@/lib/api/timeline';

// Visits tab — shows the recent visits as preview cards. Each card
// expands into the linked notes for that visit. For full pagination /
// filters, deep-links to the existing /timeline page.

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const STATE_TONE: Record<
  string,
  'neutral' | 'accent' | 'amber' | 'green' | 'red'
> = {
  scheduled: 'neutral',
  confirmed: 'accent',
  checked_in: 'amber',
  in_progress: 'amber',
  completed: 'green',
  cancelled: 'red',
  no_show: 'red',
};

interface VisitsTabProps {
  timeline: ClientTimelineResponse;
  clientId: string;
  // Returns the URL that opens the inline VisitQuickViewDrawer for the
  // given appointmentId. Same builder used by OverviewTab.
  hrefForVisit: (appointmentId: string) => string;
}

export function VisitsTab({
  timeline,
  clientId,
  hrefForVisit,
}: VisitsTabProps) {
  if (timeline.visits.length === 0) {
    return (
      <Card padding="lg" className="border border-dashed border-surface-3 bg-surface-2/40">
        <div className="flex flex-col gap-s2">
          <h3 className="t-display-sm text-ink">No visits yet</h3>
          <p className="t-body-md text-ink-soft">
            Once this client has appointments, they&apos;ll appear here as a
            visit history.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-s4">
      <header className="flex items-center justify-between gap-s3">
        <p className="t-body-sm text-ink-soft">
          Showing the {timeline.visits.length} most recent visit
          {timeline.visits.length === 1 ? '' : 's'}{' '}
          {timeline.total > timeline.visits.length
            ? `of ${timeline.total} total`
            : ''}
        </p>
        <Link
          href={`/admin/clients/${clientId}/timeline` as Route}
          className="no-underline"
        >
          <Button variant="ghost" size="sm">
            Open full timeline →
          </Button>
        </Link>
      </header>

      <ul role="list" className="flex flex-col gap-s3">
        {timeline.visits.map((visit) => (
          <li key={visit.appointment.id}>
            <Link
              href={hrefForVisit(visit.appointment.id) as Route}
              className="block no-underline"
            >
            <Card padding="md" className="border border-surface-3 transition-shadow duration-fast hover:shadow-md">
              <div className="flex flex-col gap-s3">
                <div className="flex flex-wrap items-baseline justify-between gap-s3">
                  <div className="flex flex-col gap-s1">
                    <span className="t-body-md font-medium text-ink">
                      {visit.service.name}
                    </span>
                    <span className="t-body-sm text-ink-soft">
                      {formatDateTime(visit.appointment.scheduledStartAt)}{' '}
                      with {visit.staff.firstName}
                      {visit.staff.lastName ? ' ' + visit.staff.lastName : ''}
                    </span>
                  </div>
                  <Badge
                    tone={STATE_TONE[visit.appointment.state] ?? 'neutral'}
                  >
                    {visit.appointment.state.replace('_', ' ')}
                  </Badge>
                </div>

                {visit.appointment.notes && (
                  <p className="t-body-sm whitespace-pre-wrap text-ink">
                    Booking notes: {visit.appointment.notes}
                  </p>
                )}

                {visit.notes.length > 0 && (
                  <div className="flex flex-col gap-s2 border-t border-surface-3 pt-s3">
                    <span className="t-eyebrow text-ink-soft">
                      Linked notes ({visit.notes.length})
                    </span>
                    <LinkedNotesList
                      notes={visit.notes}
                      emptyLabel="No notes for this visit."
                    />
                  </div>
                )}

                {(visit.bookingAnswers.length > 0 || visit.files.length > 0) && (
                  <div className="flex flex-wrap items-center gap-s2 border-t border-surface-3 pt-s3 t-caption text-ink-soft">
                    {visit.bookingAnswers.length > 0 && (
                      <Badge tone="neutral">
                        {visit.bookingAnswers.length} intake answer
                        {visit.bookingAnswers.length === 1 ? '' : 's'}
                      </Badge>
                    )}
                    {visit.files.length > 0 && (
                      <Badge tone="neutral">
                        {visit.files.length} file
                        {visit.files.length === 1 ? '' : 's'}
                      </Badge>
                    )}
                    {visit.soapNote && <Badge tone="accent">SOAP note</Badge>}
                  </div>
                )}
              </div>
            </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
