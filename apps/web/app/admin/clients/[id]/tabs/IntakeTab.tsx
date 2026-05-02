'use client';

import { Badge, Card } from '@/components/ui';
import type {
  BookingAnswerSummary,
  ClientTimelineVisit,
} from '@/lib/api/timeline';

// Intake tab — shows triage / booking-answer responses across all of
// this client's visits, grouped by visit. Mirrors the appointment-drawer
// IntakeTab renderer from #58 but groups by visit so the operator sees
// "what did this client say at each visit" rather than "what's on this
// specific appointment."

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function renderAnswer(answer: BookingAnswerSummary): React.ReactNode {
  const value = answer.answerValue;
  switch (answer.questionTypeSnapshot) {
    case 'short_text':
    case 'long_text':
      return typeof value === 'string' ? (
        <p className="t-body-md whitespace-pre-wrap text-ink">{value}</p>
      ) : (
        <span className="t-body-sm italic text-ink-soft">No response</span>
      );
    case 'chips_single':
      return typeof value === 'string' ? (
        <Badge tone="accent">{value}</Badge>
      ) : (
        <span className="t-body-sm italic text-ink-soft">No response</span>
      );
    case 'chips_multi':
      return Array.isArray(value) && value.length > 0 ? (
        <div className="flex flex-wrap gap-s1">
          {value.map((v, i) => (
            <Badge key={i} tone="accent">
              {String(v)}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="t-body-sm italic text-ink-soft">No response</span>
      );
    case 'yes_no':
      return (
        <Badge tone={value === true || value === 'yes' ? 'green' : 'red'}>
          {value === true || value === 'yes' ? 'Yes' : 'No'}
        </Badge>
      );
    case 'slider':
      return (
        <span className="t-body-md font-medium text-ink">
          {typeof value === 'number' ? value : String(value)}
        </span>
      );
    case 'photo_upload':
      return (
        <span className="t-body-sm text-ink-soft">
          Photo uploaded — view in Files tab.
        </span>
      );
    default:
      return <span className="t-body-sm italic text-ink-soft">—</span>;
  }
}

interface IntakeTabProps {
  visits: ClientTimelineVisit[];
  clientId: string;
}

export function IntakeTab({ visits }: IntakeTabProps) {
  const visitsWithAnswers = visits.filter((v) => v.bookingAnswers.length > 0);

  if (visitsWithAnswers.length === 0) {
    return (
      <Card
        padding="lg"
        className="border border-dashed border-surface-3 bg-surface-2/40"
      >
        <div className="flex flex-col gap-s2">
          <h3 className="t-display-sm text-ink">No intake responses yet</h3>
          <p className="t-body-md text-ink-soft">
            When this client books a service that has triage questions
            attached, their answers will surface here grouped by visit.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-s5">
      {visitsWithAnswers.map((visit) => (
        <section key={visit.appointment.id} className="flex flex-col gap-s3">
          <header className="flex flex-col gap-s1">
            <span className="t-eyebrow text-ink-soft">
              {formatDate(visit.appointment.scheduledStartAt)}
            </span>
            <h3 className="t-display-sm text-ink">
              {visit.service.name} with {visit.staff.firstName}
              {visit.staff.lastName ? ' ' + visit.staff.lastName : ''}
            </h3>
          </header>

          <ul className="flex flex-col gap-s2">
            {visit.bookingAnswers.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-s2 rounded-sm border border-surface-3 bg-white p-s3"
              >
                <span className="t-caption text-ink-soft">
                  {a.questionLabelSnapshot}
                </span>
                {renderAnswer(a)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
