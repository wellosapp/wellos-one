import { Badge, Card } from '@/components/ui';
import type { ClientTimelineVisit } from '@/lib/api/timeline';

import { LinkedNotesList } from './LinkedNotesList';

// One card per appointment in the client visit timeline. Renders:
//   - date / time / status header
//   - service + provider line
//   - linked notes list
//   - triage answers preview (if any)
//   - SOAP note indicator (if any)
//   - reference photo count (S4c-blocked, hidden until upload SDK lands)
//
// Per walkthrough §5 timeline rules.

const STATUS_TONE: Record<
  ClientTimelineVisit['appointment']['state'],
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

const STATUS_LABEL: Record<ClientTimelineVisit['appointment']['state'], string> =
  {
    scheduled: 'Scheduled',
    confirmed: 'Confirmed',
    checked_in: 'Checked in',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No-show',
  };

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay =
    start.toDateString() === end.toDateString();
  const startStr = start.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const endStr = end.toLocaleString(undefined, {
    timeStyle: 'short',
  });
  return sameDay ? `${startStr} – ${endStr}` : `${startStr} – ${endStr}`;
}

function renderAnswerPreview(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  if (
    typeof value === 'object' &&
    Array.isArray((value as { urls?: unknown }).urls)
  ) {
    const urls = (value as { urls: unknown[] }).urls;
    return `${urls.length} reference photo${urls.length === 1 ? '' : 's'}`;
  }
  return JSON.stringify(value);
}

export function TimelineAppointmentCard({
  visit,
}: {
  visit: ClientTimelineVisit;
}) {
  const { appointment, service, staff, notes, bookingAnswers, files, soapNote } =
    visit;

  return (
    <Card padding="md" as="article" className="flex flex-col gap-s4">
      <header className="flex flex-wrap items-baseline justify-between gap-s3">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">
            {formatRange(appointment.scheduledStartAt, appointment.scheduledEndAt)}
          </span>
          <h3 className="t-display-sm">{service.name}</h3>
          <p className="t-body-sm text-ink-soft">
            with {staff.firstName}
            {staff.lastName ? ` ${staff.lastName}` : ''}
            {staff.jobTitle ? ` · ${staff.jobTitle}` : ''}
          </p>
        </div>
        <Badge tone={STATUS_TONE[appointment.state]}>
          {STATUS_LABEL[appointment.state]}
        </Badge>
      </header>

      {appointment.cancelReason && (
        <div className="rounded-sm border border-red/30 bg-red-pale/30 p-s2 t-body-sm text-red">
          Cancel reason: {appointment.cancelReason}
        </div>
      )}

      {appointment.notes && (
        <p className="t-body-md whitespace-pre-wrap text-ink">
          {appointment.notes}
        </p>
      )}

      <section className="flex flex-col gap-s2">
        <div className="flex items-center gap-s2">
          <h4 className="t-eyebrow text-ink-soft">Notes</h4>
          {notes.length > 0 && <Badge tone="neutral">{notes.length}</Badge>}
        </div>
        <LinkedNotesList notes={notes} />
      </section>

      {bookingAnswers.length > 0 && (
        <section className="flex flex-col gap-s2">
          <div className="flex items-center gap-s2">
            <h4 className="t-eyebrow text-ink-soft">Triage answers</h4>
            <Badge tone="neutral">{bookingAnswers.length}</Badge>
          </div>
          <ul className="flex flex-col gap-s2">
            {bookingAnswers.map((a) => (
              <li
                key={a.id}
                className="rounded-sm border border-surface-3 bg-surface-1 p-s3"
              >
                <div className="t-body-sm text-ink-soft">
                  {a.questionLabelSnapshot}
                </div>
                <div className="t-body-md text-ink">
                  {renderAnswerPreview(a.answerValue)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {soapNote && (
        <section className="flex flex-col gap-s2">
          <div className="flex flex-wrap items-center gap-s2">
            <h4 className="t-eyebrow text-ink-soft">SOAP note</h4>
            {soapNote.locked ? (
              <Badge tone="green">Locked</Badge>
            ) : (
              <Badge tone="amber">Draft</Badge>
            )}
          </div>
          <p className="t-body-sm text-ink-soft">
            Created {new Date(soapNote.createdAt).toLocaleDateString()}
            {soapNote.locked && soapNote.lockedAt
              ? ` · Locked ${new Date(soapNote.lockedAt).toLocaleDateString()}`
              : ''}
          </p>
        </section>
      )}

      {files.length > 0 && (
        <section className="flex items-center gap-s2">
          <h4 className="t-eyebrow text-ink-soft">Reference files</h4>
          <Badge tone="neutral">{files.length}</Badge>
        </section>
      )}
    </Card>
  );
}
