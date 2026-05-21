// OutstandingIntake — clients with intake forms still pending or sent.
//
// Each row carries TWO links: the client name links to their profile
// (`/admin/clients/[id]`), and a small 'Resend →' link on the right
// jumps to `/admin/intake-forms` where the actual resend happens. Both
// links share a row but are independently clickable — no nested anchors.

import type { Route } from 'next';
import Link from 'next/link';
import type { OutstandingIntakeRow } from './types';

type OutstandingIntakeProps = {
  rows: OutstandingIntakeRow[];
};

const STATUS_LABEL: Record<OutstandingIntakeRow['status'], string> = {
  pending: 'Pending',
  sent: 'Sent',
};

const STATUS_CLASS: Record<OutstandingIntakeRow['status'], string> = {
  // Pending uses warm/sand because it's "needs your attention".
  pending:
    'bg-sand-soft text-terracotta border border-sand-soft',
  // Sent uses neutral plain tone because we're just waiting on the client.
  sent: 'bg-surface-sunk text-ink-3 border border-line',
};

export function OutstandingIntake({ rows }: OutstandingIntakeProps) {
  return (
    <section className="flex flex-col gap-s3 rounded-md border border-line bg-surface p-s5 shadow-sm">
      <header className="flex items-center gap-s3">
        <h3 className="t-display-md text-ink">Outstanding intake</h3>
        <span className="t-body-md text-ink-4">
          {rows.length} {rows.length === 1 ? 'pending' : 'pending'}
        </span>
        <div className="flex-1" />
        <Link
          href={'/admin/intake-forms' as Route}
          className="text-[12px] font-medium text-sage-deep hover:text-ink"
        >
          View intake forms &rarr;
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="py-s6 text-center font-display italic t-body-md text-ink-4">
          All clients have submitted their intake.
        </div>
      ) : (
        <div className="flex flex-col">
          {rows.map((row) => (
            <div
              key={row.clientId}
              className="flex items-center gap-s3 border-t border-line-soft py-s3 first:border-t-0"
            >
              <Link
                href={`/admin/clients/${row.clientId}` as Route}
                className="t-body-sm min-w-0 flex-1 truncate font-semibold text-ink hover:text-sage-deep"
              >
                {row.clientFirstName}
                {row.clientLastName ? ` ${row.clientLastName}` : ''}
              </Link>
              <span
                className={`inline-flex flex-shrink-0 items-center rounded-full px-s2 py-[2px] text-[11px] font-medium ${STATUS_CLASS[row.status]}`}
              >
                {STATUS_LABEL[row.status]}
              </span>
              <Link
                href={'/admin/intake-forms' as Route}
                className="flex-shrink-0 text-[11.5px] font-medium text-sage-deep hover:text-ink"
              >
                Resend &rarr;
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
