import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Route } from 'next';

import { Alert, Badge, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { getReviewSubmission } from '@/lib/api/form-review';

import { ReviewActions } from '../ReviewActions';
import { SubmissionViewer } from '../SubmissionViewer';

// /admin/forms/review-queue/[id] — full-page review surface. Two-column on
// desktop (viewer + sidebar), single-column on mobile. The Review modal is
// heavy enough that a route works better than a sheet.

function reviewStatusTone(s: string | null): 'green' | 'red' | 'amber' | 'neutral' | 'accent' {
  if (s === 'approved') return 'green';
  if (s === 'denied') return 'red';
  if (s === 'requires_follow_up') return 'amber';
  if (s === 'reviewed') return 'accent';
  return 'neutral';
}

function reviewStatusLabel(s: string | null): string {
  switch (s) {
    case 'unreviewed':
      return 'Unreviewed';
    case 'reviewed':
      return 'Reviewed';
    case 'requires_follow_up':
      return 'Follow-up';
    case 'approved':
      return 'Approved';
    case 'denied':
      return 'Denied';
    default:
      return s ?? 'No review';
  }
}

function actionLabel(a: string): string {
  switch (a) {
    case 'created':
      return 'Created';
    case 'sent':
      return 'Sent';
    case 'opened':
      return 'Opened';
    case 'started':
      return 'Started';
    case 'submitted':
      return 'Submitted';
    case 'cancelled':
      return 'Cancelled';
    case 'expired':
      return 'Expired';
    case 'reviewed':
      return 'Reviewed';
    case 'approved':
      return 'Approved';
    case 'denied':
      return 'Denied';
    default:
      return a;
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.round(diffMs / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 14) return `${diffD}d ago`;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function clientName(c: {
  firstName: string;
  lastName: string | null;
} | null): string {
  if (!c) return 'No client linked';
  const parts = [c.firstName, c.lastName].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  return parts.length > 0 ? parts.join(' ') : 'Client';
}

export default async function ReviewSubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data: Awaited<ReturnType<typeof getReviewSubmission>> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await getReviewSubmission(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    if (err instanceof ApiError && err.status === 403) {
      errorMessage = 'You do not have access to this submission.';
    } else if (err instanceof ApiError) {
      errorMessage = err.message;
    } else {
      throw err;
    }
  }

  if (errorMessage || !data) {
    return (
      <div className="flex flex-col gap-s5">
        <div>
          <Link
            href={'/admin/forms/review-queue' as Route}
            className="t-body-sm text-accent no-underline hover:underline"
          >
            ← Back to review queue
          </Link>
        </div>
        <Alert tone="error">{errorMessage ?? 'Could not load submission.'}</Alert>
      </div>
    );
  }

  const {
    submission,
    definition,
    client,
    appointment,
    service,
    fileUploads,
    audits,
  } = data;

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex flex-col gap-s2">
        <div>
          <Link
            href={'/admin/forms/review-queue' as Route}
            className="t-body-sm text-accent no-underline hover:underline"
          >
            ← Back to review queue
          </Link>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-s4">
          <div className="flex flex-col gap-s2">
            <span className="t-eyebrow text-accent">Review</span>
            <h1 className="font-display t-display-sm text-ink">
              {definition.title}
            </h1>
            <div className="flex flex-wrap items-center gap-s2">
              <Badge tone="neutral">v{definition.version}</Badge>
              {definition.formType ? (
                <Badge tone="neutral">{definition.formType}</Badge>
              ) : null}
              <Badge tone={reviewStatusTone(submission.reviewStatus)}>
                {reviewStatusLabel(submission.reviewStatus)}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-s6 lg:grid-cols-[1fr_360px]">
        <section aria-label="Submission" className="min-w-0">
          <SubmissionViewer
            schema={definition.schema}
            answers={submission.answers}
            signatureData={submission.signatureData}
            submittedAt={submission.submittedAt}
            clientName={clientName(client)}
            fileUploads={fileUploads}
          />
        </section>

        <aside className="flex flex-col gap-s4">
          <Card padding="md" className="rounded-lg border border-surface-3 bg-white shadow-sm">
            <h2 className="t-display-md text-ink">Client</h2>
            {client ? (
              <dl className="mt-s3 flex flex-col gap-s2 t-body-sm">
                <div className="flex flex-col">
                  <dt className="t-caption uppercase tracking-wide text-ink-soft">
                    Name
                  </dt>
                  <dd>
                    <Link
                      href={`/admin/clients/${client.id}` as Route}
                      className="text-accent no-underline hover:underline"
                    >
                      {clientName(client)}
                    </Link>
                  </dd>
                </div>
                {client.email ? (
                  <div className="flex flex-col">
                    <dt className="t-caption uppercase tracking-wide text-ink-soft">
                      Email
                    </dt>
                    <dd className="text-ink">{client.email}</dd>
                  </div>
                ) : null}
                {client.phone ? (
                  <div className="flex flex-col">
                    <dt className="t-caption uppercase tracking-wide text-ink-soft">
                      Phone
                    </dt>
                    <dd className="text-ink">{client.phone}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="mt-s3 t-body-sm text-ink-soft">No client linked.</p>
            )}
          </Card>

          <Card padding="md" className="rounded-lg border border-surface-3 bg-white shadow-sm">
            <h2 className="t-display-md text-ink">Appointment</h2>
            {appointment && service ? (
              <dl className="mt-s3 flex flex-col gap-s2 t-body-sm">
                <div className="flex flex-col">
                  <dt className="t-caption uppercase tracking-wide text-ink-soft">
                    Service
                  </dt>
                  <dd className="text-ink">{service.name}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="t-caption uppercase tracking-wide text-ink-soft">
                    Scheduled
                  </dt>
                  <dd className="text-ink">
                    {formatDateTime(appointment.scheduledStartAt)}
                  </dd>
                </div>
                <div className="flex flex-col">
                  <dt className="t-caption uppercase tracking-wide text-ink-soft">
                    State
                  </dt>
                  <dd className="text-ink">{appointment.state}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-s3 t-body-sm text-ink-soft">
                Not linked to an appointment.
              </p>
            )}
          </Card>

          <Card padding="md" className="rounded-lg border border-surface-3 bg-white shadow-sm">
            <h2 className="t-display-md text-ink">Audit trail</h2>
            {audits.length === 0 ? (
              <p className="mt-s3 t-body-sm text-ink-soft">No events yet.</p>
            ) : (
              <ol className="mt-s3 flex flex-col gap-s3">
                {audits.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-col gap-s1 border-l-2 border-surface-3 pl-s3"
                  >
                    <span className="t-body-sm font-medium text-ink">
                      {actionLabel(a.action)}
                    </span>
                    <span
                      className="t-caption text-ink-soft"
                      title={formatDateTime(a.createdAt)}
                    >
                      {formatRelative(a.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card padding="md" className="rounded-lg border border-surface-3 bg-white shadow-sm">
            <h2 className="t-display-md text-ink">Decision</h2>
            <div className="mt-s4">
              <ReviewActions
                submissionId={submission.id}
                currentReviewStatus={submission.reviewStatus}
                currentNotes={submission.reviewNotes}
              />
            </div>
            {submission.reviewedByStaffName && submission.reviewedAt ? (
              <p className="mt-s4 t-caption text-ink-soft">
                Last reviewed by{' '}
                <span className="text-ink">
                  {submission.reviewedByStaffName}
                </span>{' '}
                {formatRelative(submission.reviewedAt)}.
              </p>
            ) : null}
          </Card>
        </aside>
      </div>
    </div>
  );
}
