// WaitlistPreview — first five active waitlist entries with a deep-link
// per row to the entry detail. Mirrors the design's `.wl-row` shape but
// ported to Tailwind tokens (sage / sand / surface family).

import type { Route } from 'next';
import Link from 'next/link';
import type { WaitlistPreviewRow } from './types';

type WaitlistPreviewProps = {
  rows: WaitlistPreviewRow[];
};

function initialsFor(first: string, last: string | null): string {
  const a = first.trim().charAt(0).toUpperCase();
  const b = (last ?? '').trim().charAt(0).toUpperCase();
  return `${a}${b}`.trim() || '?';
}

export function WaitlistPreview({ rows }: WaitlistPreviewProps) {
  return (
    <section className="flex flex-col gap-s3 rounded-md border border-line bg-surface p-s5 shadow-sm">
      <header className="flex items-center gap-s3">
        <h3 className="t-display-md text-ink">Waitlist</h3>
        <span className="t-body-md text-ink-4">
          {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
        </span>
        <div className="flex-1" />
        <Link
          href={'/admin/waitlist' as Route}
          className="text-[12px] font-medium text-sage-deep hover:text-ink"
        >
          View all &rarr;
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="py-s6 text-center font-display italic t-body-md text-ink-4">
          No one on the waitlist.
        </div>
      ) : (
        <div className="flex flex-col">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/admin/waitlist/${row.id}` as Route}
              className="-mx-s2 flex items-center gap-s3 rounded-sm px-s2 py-s2 transition-colors duration-fast hover:bg-sage-tint-2"
            >
              <span className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-full border border-line bg-sand-soft text-[12px] font-semibold text-ink">
                {initialsFor(row.clientFirstName, row.clientLastName)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="t-body-sm truncate font-semibold text-ink">
                  {row.clientFirstName}
                  {row.clientLastName ? ` ${row.clientLastName}` : ''}
                </span>
                <span className="truncate text-[11.5px] text-ink-4">
                  {row.serviceName} &middot; {row.preferenceLabel}
                </span>
              </span>
              <span className="flex-shrink-0 text-[11px] text-ink-4 tabular-nums">
                {row.createdAtLabel}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
