// Forms System PR 10 — small review-state pill for the client-profile Forms
// tab + detail page. Mirrors the review-queue Badge palette but with two
// behaviours:
//   - 'unreviewed'  → amber pill linking to /admin/forms/review-queue/[id]
//   - reviewed/approved/denied/requires_follow_up → non-link pill, with the
//     reviewer name + reviewedAt + notes exposed via `title` on hover.
//   - null / unrecognised → render nothing (form is not on the review track).

import Link from 'next/link';
import type { Route } from 'next';

import { Badge } from '@/components/ui';

interface ReviewStatusPillProps {
  reviewStatus: string | null | undefined;
  submissionId: string;
  reviewedByStaffName?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
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

export function ReviewStatusPill({
  reviewStatus,
  submissionId,
  reviewedByStaffName,
  reviewedAt,
  reviewNotes,
}: ReviewStatusPillProps) {
  if (!reviewStatus) return null;

  if (reviewStatus === 'unreviewed') {
    const href = `/admin/forms/review-queue/${submissionId}` as Route;
    return (
      <Link
        href={href}
        className="no-underline focus-visible:outline-none focus-visible:shadow-focus rounded-sm"
      >
        <Badge tone="amber">Needs review</Badge>
      </Link>
    );
  }

  const tone =
    reviewStatus === 'approved'
      ? 'green'
      : reviewStatus === 'denied'
      ? 'red'
      : reviewStatus === 'requires_follow_up'
      ? 'amber'
      : reviewStatus === 'reviewed'
      ? 'accent'
      : 'neutral';

  const label =
    reviewStatus === 'approved'
      ? 'Approved'
      : reviewStatus === 'denied'
      ? 'Denied'
      : reviewStatus === 'requires_follow_up'
      ? 'Follow-up requested'
      : reviewStatus === 'reviewed'
      ? 'Reviewed'
      : reviewStatus;

  const tooltipParts: string[] = [];
  if (reviewedByStaffName) tooltipParts.push(`by ${reviewedByStaffName}`);
  if (reviewedAt) tooltipParts.push(`on ${formatDateTime(reviewedAt)}`);
  if (reviewNotes) tooltipParts.push(`— ${reviewNotes}`);
  const tooltip = tooltipParts.join(' ') || undefined;

  return (
    <Badge tone={tone} title={tooltip}>
      {label}
    </Badge>
  );
}
