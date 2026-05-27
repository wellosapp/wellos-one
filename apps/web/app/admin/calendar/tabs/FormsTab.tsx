'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';

import { Alert, Badge, Button, Card } from '@/components/ui';
import { listAppointmentFormsAction } from '../forms-tab-actions';
import type {
  IntakeFormSubmissionDto,
  IntakeFormSubmissionStatus,
} from '@/lib/api/intake-forms';

// PR 8 — Forms tab on the appointment drawer.
//
// READ surface only. Lists IntakeFormSubmissions linked to this appointment.
// Mutations (send / resend / view) reuse the existing endpoints at
// /admin/clients/[id]/intake — the row's "Send" button is a Link there.

function statusBadgeTone(
  status: IntakeFormSubmissionStatus,
): 'green' | 'amber' | 'red' | 'neutral' | 'accent' {
  switch (status) {
    case 'submitted':
      return 'green';
    case 'expired':
    case 'cancelled':
      return 'red';
    case 'in_progress':
    case 'opened':
      return 'amber';
    case 'sent':
      return 'accent';
    case 'draft':
    case 'assigned':
    default:
      return 'neutral';
  }
}

function statusLabel(status: IntakeFormSubmissionStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'assigned':
      return 'Assigned';
    case 'sent':
      return 'Sent';
    case 'opened':
      return 'Opened';
    case 'in_progress':
      return 'In progress';
    case 'submitted':
      return 'Completed';
    case 'expired':
      return 'Expired';
    case 'cancelled':
      return 'Cancelled';
  }
}

function relTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface FormsTabProps {
  appointmentId: string;
  clientId: string;
}

export function FormsTab({ appointmentId, clientId }: FormsTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<IntakeFormSubmissionDto[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listAppointmentFormsAction(appointmentId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSubmissions(res.submissions);
    });
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  if (loading) {
    return (
      <p className="t-body-sm italic text-ink-soft">Loading forms…</p>
    );
  }

  if (error) {
    return <Alert tone="error">{error}</Alert>;
  }

  if (submissions.length === 0) {
    return (
      <Card padding="lg" className="border border-dashed border-surface-3 bg-surface-2/40">
        <div className="flex flex-col gap-s2">
          <h3 className="t-display-sm text-ink">No forms attached</h3>
          <p className="t-body-md text-ink-soft">
            No intake forms are linked to this appointment. To send a form,
            open the client&apos;s intake page.
          </p>
          <Link
            href={`/admin/clients/${clientId}/intake` as Route}
            className="self-start no-underline"
          >
            <Button variant="ghost" size="sm">
              Open client intake
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  const allComplete = submissions.every((s) => s.status === 'submitted');

  return (
    <div className="flex flex-col gap-s4">
      {allComplete ? (
        <div
          className="rounded-xl border border-green/30 bg-green-pale/60 px-s3 py-s2 t-body-sm font-semibold text-green"
          role="status"
        >
          All forms complete
        </div>
      ) : null}

      <ul className="flex flex-col gap-s2">
        {submissions.map((s) => (
          <li
            key={s.id}
            className="flex flex-col gap-s2 rounded-md border border-surface-3 bg-white p-s3"
          >
            <div className="flex flex-wrap items-center justify-between gap-s2">
              <div className="min-w-0">
                <p className="t-body-sm font-semibold text-ink">
                  {s.definition.title}
                </p>
                <p className="t-caption text-ink-soft">
                  v{s.definition.version} ·{' '}
                  {s.status === 'submitted' && s.submittedAt
                    ? `Submitted ${relTime(s.submittedAt)}`
                    : `Updated ${relTime(s.updatedAt)}`}
                </p>
              </div>
              <Badge tone={statusBadgeTone(s.status)}>
                {statusLabel(s.status)}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-s2">
              <Link
                href={
                  `/admin/clients/${clientId}/intake/${s.id}` as Route
                }
                className="no-underline"
              >
                <Button variant="ghost" size="sm">
                  View
                </Button>
              </Link>
              {(s.status === 'draft' ||
                s.status === 'assigned' ||
                s.status === 'sent' ||
                s.status === 'opened' ||
                s.status === 'in_progress') && (
                <Link
                  href={`/admin/clients/${clientId}/intake` as Route}
                  className="no-underline"
                >
                  <Button variant="ghost" size="sm">
                    {s.status === 'sent' || s.status === 'opened' ||
                    s.status === 'in_progress'
                      ? 'Resend'
                      : 'Send'}
                  </Button>
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
