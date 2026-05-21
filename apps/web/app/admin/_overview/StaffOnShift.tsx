// StaffOnShift — who's working right now. Sorted live → break → off and
// capped at 8. Each row is a link to that staff member's edit page so the
// admin can adjust their schedule / details in one click.
//
// Status dot colors map to the design's `.status-dot` tokens:
//   live  → sage (with a sage-tint halo)
//   break → sand (with a sand-soft halo)
//   off   → ink-4 (no halo)

import type { Route } from 'next';
import Link from 'next/link';
import type { StaffOnShiftRow } from './types';

type StaffOnShiftProps = {
  rows: StaffOnShiftRow[];
};

const DOT_CLASS: Record<StaffOnShiftRow['status'], string> = {
  live: 'bg-sage shadow-[0_0_0_3px_var(--sage-tint)]',
  break: 'bg-sand shadow-[0_0_0_3px_var(--sand-soft)]',
  off: 'bg-ink-4',
};

function initialsFor(first: string, last: string | null): string {
  const a = first.trim().charAt(0).toUpperCase();
  const b = (last ?? '').trim().charAt(0).toUpperCase();
  return `${a}${b}`.trim() || '?';
}

export function StaffOnShift({ rows }: StaffOnShiftProps) {
  const liveCount = rows.filter((r) => r.status === 'live').length;

  return (
    <section className="flex flex-col gap-s3 rounded-md border border-line bg-surface p-s5 shadow-sm">
      <header className="flex items-center gap-s3">
        <h3 className="t-display-md text-ink">On shift now</h3>
        <span className="t-body-md text-ink-4">
          {liveCount} {liveCount === 1 ? 'live' : 'live'}
        </span>
        <div className="flex-1" />
        <Link
          href={'/admin/staff' as Route}
          className="text-[12px] font-medium text-sage-deep hover:text-ink"
        >
          Roster &rarr;
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="py-s6 text-center font-display italic t-body-md text-ink-4">
          No staff working right now.
        </div>
      ) : (
        <div className="flex flex-col">
          {rows.map((row) => (
            <Link
              key={row.staffId}
              href={`/admin/staff/${row.staffId}` as Route}
              className="grid grid-cols-[34px_1fr_auto] items-center gap-s3 border-t border-line-soft py-s2 transition-colors duration-fast first:border-t-0 hover:bg-sage-tint-2"
            >
              <span className="grid h-[34px] w-[34px] place-items-center rounded-full border border-line bg-sage-tint text-[12px] font-semibold text-sage-deep">
                {initialsFor(row.firstName, row.lastName)}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="t-body-sm flex items-center gap-[6px] font-semibold text-ink">
                  <span
                    aria-hidden="true"
                    className={`inline-block h-[8px] w-[8px] flex-shrink-0 rounded-full ${DOT_CLASS[row.status]}`}
                  />
                  <span className="truncate">
                    {row.firstName}
                    {row.lastName ? ` ${row.lastName}` : ''}
                  </span>
                </span>
                <span className="truncate text-[11.5px] text-ink-4">
                  {row.shiftLabel} &middot; {row.loadLabel}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
