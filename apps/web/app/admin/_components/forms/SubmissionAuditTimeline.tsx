// Forms System PR 10 — vertical audit timeline for a single submission.
//
// Renders IntakeFormSubmissionAudit rows in chronological order with a
// small status circle per event. Reads from the same audit rows the
// PR 9 review surface uses; the action label set matches the audit
// enum (created / sent / opened / started / submitted / cancelled /
// expired / reviewed / approved / denied).

import { cn } from '@/lib/cn';
import type { IntakeFormSubmissionAuditDto } from '@/lib/api/intake-forms';

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

// Sage-tinted markers for delivery/lifecycle, amber for review-track events.
function dotClass(action: string): string {
  switch (action) {
    case 'approved':
      return 'bg-green border-green';
    case 'denied':
      return 'bg-red border-red';
    case 'cancelled':
    case 'expired':
      return 'bg-amber border-amber';
    case 'reviewed':
      return 'bg-accent border-accent';
    default:
      return 'bg-sage border-sage';
  }
}

export function SubmissionAuditTimeline({
  audits,
}: {
  audits: IntakeFormSubmissionAuditDto[];
}) {
  if (audits.length === 0) {
    return (
      <p className="t-body-sm text-ink-soft">No events yet.</p>
    );
  }

  return (
    <ol className="flex flex-col">
      {audits.map((a, idx) => {
        const last = idx === audits.length - 1;
        return (
          <li key={a.id} className="relative flex gap-s3 pb-s4 last:pb-0">
            {!last ? (
              <span
                aria-hidden
                className="absolute left-[7px] top-[16px] h-full w-px bg-surface-3"
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'mt-[3px] inline-block h-[15px] w-[15px] flex-shrink-0 rounded-full border-2',
                dotClass(a.action),
              )}
            />
            <div className="flex min-w-0 flex-col gap-s1">
              <span className="t-body-sm font-medium text-ink">
                {actionLabel(a.action)}
              </span>
              <span
                className="t-caption text-ink-soft"
                title={formatDateTime(a.createdAt)}
              >
                {formatRelative(a.createdAt)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
