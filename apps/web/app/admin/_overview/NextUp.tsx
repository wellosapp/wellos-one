// NextUp — next five upcoming, non-cancelled appointments. Each row is a
// link into the calendar page with `?selected=<appointmentId>` so the
// calendar surface can scroll/highlight the row when it's wired.

import type { Route } from 'next';
import Link from 'next/link';
import { ClockIcon } from '@/app/admin/_shell/icons';
import type { NextUpRow } from './types';

type NextUpProps = {
  rows: NextUpRow[];
};

export function NextUp({ rows }: NextUpProps) {
  return (
    <section className="flex flex-col gap-s3 rounded-md border border-line bg-surface p-s5 shadow-sm">
      <header className="flex items-center gap-s3">
        <h3 className="t-display-md text-ink">Next up</h3>
        <span className="t-body-md text-ink-4">
          {rows.length} {rows.length === 1 ? 'booking' : 'bookings'}
        </span>
        <div className="flex-1" />
        <Link
          href={'/admin/calendar' as Route}
          className="text-[12px] font-medium text-sage-deep hover:text-ink"
        >
          Open calendar &rarr;
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="py-s6 text-center font-display italic t-body-md text-ink-4">
          Nothing scheduled in the next few days.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-s2 md:grid-cols-2 xl:grid-cols-5">
          {rows.map((row) => (
            <Link
              key={row.appointmentId}
              href={
                `/admin/calendar?selected=${row.appointmentId}` as Route
              }
              className="flex flex-col gap-s2 rounded-sm border border-line bg-surface-2 p-s3 transition-colors duration-fast hover:border-sage-soft hover:bg-sage-tint-2"
            >
              <span className="inline-flex w-fit items-center gap-[6px] rounded-full bg-sage-tint px-s2 py-[2px] text-[11px] font-semibold text-sage-deep">
                <ClockIcon size={12} />
                {row.startsAtLabel}
              </span>
              <span className="t-body-sm truncate font-semibold text-ink">
                {row.clientFirstName}
              </span>
              <span className="truncate text-[11.5px] text-ink-4">
                {row.serviceName} &middot; {row.staffFirstName} &middot;{' '}
                {row.durationLabel}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
