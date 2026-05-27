import Link from 'next/link';
import type { Route } from 'next';

import { Alert, Badge, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import {
  listReviewQueue,
  type ReviewStatusFilter,
  type ReviewQueueRow,
} from '@/lib/api/form-review';

// /admin/forms/review-queue — Forms System PR 9.
//
// Lists submissions in the review track. Default filter = unreviewed (the
// queue). Other filters expose the history: approved / denied / requires
// follow-up / reviewed (acknowledged without verdict), plus 'all' for any
// review-track submission.
//
// Forms only land in the review queue when their originating
// FormAssignmentRule has requireProviderReview=true; submissions without a
// rule (admin-sent ad-hoc) stay outside the queue with review_status=null.

const PAGE_SIZE = 50;

const FILTER_VALUES: ReadonlyArray<{
  value: ReviewStatusFilter;
  label: string;
}> = [
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'requires_follow_up', label: 'Follow-up' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'all', label: 'All' },
];

function isReviewStatusFilter(v: unknown): v is ReviewStatusFilter {
  return (
    v === 'unreviewed' ||
    v === 'reviewed' ||
    v === 'requires_follow_up' ||
    v === 'approved' ||
    v === 'denied' ||
    v === 'all'
  );
}

function reviewStatusTone(s: string): 'green' | 'red' | 'amber' | 'neutral' | 'accent' {
  if (s === 'approved') return 'green';
  if (s === 'denied') return 'red';
  if (s === 'requires_follow_up') return 'amber';
  if (s === 'reviewed') return 'accent';
  return 'neutral'; // unreviewed
}

function reviewStatusLabel(s: string): string {
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
      return s;
  }
}

function formTypeLabel(t: string | null): string {
  if (!t) return 'Form';
  // Friendly capitalization for common form_type values. Falls back to a
  // title-cased version of the raw token for anything else.
  const map: Record<string, string> = {
    intake: 'Intake',
    consent: 'Consent',
    waiver: 'Waiver',
    medical_history: 'Medical history',
    soap_intake: 'SOAP',
    fitness_readiness: 'Fitness readiness',
    cancellation_ack: 'Cancellation',
    membership_agreement: 'Agreement',
    custom: 'Custom',
  };
  return map[t] ?? t.replace(/_/g, ' ');
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type SearchParams = {
  reviewStatus?: string;
  formType?: string;
  cursor?: string;
};

export default async function FormReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const reviewStatus: ReviewStatusFilter = isReviewStatusFilter(sp.reviewStatus)
    ? sp.reviewStatus
    : 'unreviewed';
  const formType = sp.formType?.trim() || undefined;
  const cursor = sp.cursor?.trim() || undefined;

  let data: Awaited<ReturnType<typeof listReviewQueue>> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await listReviewQueue({
      reviewStatus,
      formType,
      cursor,
      take: PAGE_SIZE,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      errorMessage = 'You do not have access to this tenant.';
    } else if (err instanceof ApiError) {
      errorMessage = err.message;
    } else {
      throw err;
    }
  }

  const baseQuery: Record<string, string> = {
    reviewStatus,
    ...(formType ? { formType } : {}),
  };

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex flex-wrap items-start justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Operations</span>
          <h1 className="font-display t-display-sm text-ink">Review queue</h1>
          <p className="mt-s1 max-w-2xl t-body-md text-ink-soft">
            Forms attached to services with provider review land here after a
            client submits. Approve, deny, flag for follow-up, or just
            acknowledge — every action is audited.
          </p>
        </div>
      </header>

      <Card padding="sm" className="flex flex-wrap items-center gap-s3">
        <span className="t-caption uppercase tracking-wide text-ink-soft">
          Filter
        </span>
        {FILTER_VALUES.map((f) => {
          const active = f.value === reviewStatus;
          return (
            <Link
              key={f.value}
              href={{
                pathname: '/admin/forms/review-queue',
                query: { reviewStatus: f.value, ...(formType ? { formType } : {}) },
              }}
              className={
                active
                  ? 'inline-flex items-center rounded-sm bg-sage-tint px-s3 py-[6px] t-body-sm font-medium text-sage-deep no-underline'
                  : 'inline-flex items-center rounded-sm border border-surface-3 bg-white px-s3 py-[6px] t-body-sm text-ink-soft no-underline transition-colors duration-fast hover:bg-surface-2'
              }
            >
              {f.label}
            </Link>
          );
        })}
      </Card>

      {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}

      {data ? (
        <>
          {data.submissions.length === 0 ? (
            <Card padding="lg" className="rounded-2xl border border-surface-3 bg-white shadow-sm">
              <h2 className="font-display t-heading-md text-ink">
                {reviewStatus === 'unreviewed'
                  ? 'No submissions waiting for review'
                  : 'No submissions match this filter'}
              </h2>
              <p className="mt-s4 t-body-md text-ink-soft">
                {reviewStatus === 'unreviewed'
                  ? 'New forms appear here as clients submit them.'
                  : 'Try a different filter to see other submissions.'}
              </p>
            </Card>
          ) : (
            <Card
              padding="sm"
              className="overflow-hidden rounded-2xl border border-surface-3 bg-white p-0 shadow-sm"
            >
              <ReviewQueueTable rows={data.submissions} />
            </Card>
          )}

          {data.cursor ? (
            <div className="flex items-center gap-s4">
              <Link
                href={{
                  pathname: '/admin/forms/review-queue',
                  query: { ...baseQuery, cursor: data.cursor },
                }}
                className="t-body-sm text-accent no-underline hover:underline"
              >
                Next page →
              </Link>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ReviewQueueTable({ rows }: { rows: ReviewQueueRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse">
        <thead>
          <tr className="border-b border-surface-3 bg-surface-2 text-left">
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Submitted</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Form</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Client</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Service / appt</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Status</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Reviewed by</th>
            <th className="t-eyebrow px-s4 py-s3 text-right text-ink-soft">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-surface-3 last:border-b-0 transition-colors duration-fast hover:bg-surface-2"
            >
              <td className="px-s4 py-s3 t-body-sm">
                <div
                  className="text-ink"
                  title={r.submittedAt ? formatDateTime(r.submittedAt) : ''}
                >
                  {formatRelative(r.submittedAt)}
                </div>
              </td>
              <td className="px-s4 py-s3 t-body-sm">
                <div className="flex flex-col gap-s1">
                  <span className="font-medium text-ink">
                    {r.definitionTitle}
                  </span>
                  <Badge tone="neutral" className="self-start">
                    {formTypeLabel(r.definitionFormType)}
                  </Badge>
                </div>
              </td>
              <td className="px-s4 py-s3 t-body-sm">
                {r.clientId ? (
                  <Link
                    href={`/admin/clients/${r.clientId}` as Route}
                    className="text-accent no-underline hover:underline"
                  >
                    {r.clientName ?? 'Client'}
                  </Link>
                ) : (
                  <span className="text-ink-soft">—</span>
                )}
              </td>
              <td className="px-s4 py-s3 t-body-sm">
                {r.appointmentServiceName ? (
                  <div className="flex flex-col gap-s1">
                    <span className="text-ink">{r.appointmentServiceName}</span>
                    {r.appointmentScheduledStartAt ? (
                      <span className="t-caption text-ink-soft">
                        {formatDateTime(r.appointmentScheduledStartAt)}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-ink-soft">—</span>
                )}
              </td>
              <td className="px-s4 py-s3">
                <Badge tone={reviewStatusTone(r.reviewStatus)}>
                  {reviewStatusLabel(r.reviewStatus)}
                </Badge>
              </td>
              <td className="px-s4 py-s3 t-body-sm text-ink-soft">
                {r.reviewedByStaffName ? (
                  <div className="flex flex-col gap-s1">
                    <span className="text-ink">{r.reviewedByStaffName}</span>
                    {r.reviewedAt ? (
                      <span className="t-caption">
                        {formatRelative(r.reviewedAt)}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-s4 py-s3 text-right">
                <Link
                  href={`/admin/forms/review-queue/${r.id}` as Route}
                  className="inline-flex items-center rounded-md bg-accent px-s4 py-[8px] text-[13px] font-medium text-white no-underline transition-colors duration-fast hover:bg-accent-mid"
                >
                  Review →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
