'use client';

import { Badge, Card } from '@/components/ui';
import type { BookingAnswer } from '@/lib/api/appointments';

// Render the operator-facing read of the client's triage answers for this
// appointment. The data shape mirrors AppointmentBookingAnswer rows from
// triageService.listBookingAnswersForAppointment (E3-S4d). The `answerValue`
// JSONB shape varies by question type — the renderers below cover the seven
// question types defined in the schema.

function renderAnswer(answer: BookingAnswer): React.ReactNode {
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
  answers: BookingAnswer[];
}

export function IntakeTab({ answers }: IntakeTabProps) {
  if (answers.length === 0) {
    return (
      <Card padding="lg" className="border border-dashed border-surface-3 bg-surface-2/40">
        <div className="flex flex-col gap-s2">
          <h3 className="t-display-sm text-ink">No intake responses</h3>
          <p className="t-body-md text-ink-soft">
            This appointment was booked without triage questions, or the
            questions were configured but not answered.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-s3">
      {answers.map((a) => (
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
  );
}
