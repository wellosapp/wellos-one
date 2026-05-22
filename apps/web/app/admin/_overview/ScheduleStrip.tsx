// ScheduleStrip — horizontally-scrollable hour track showing today's
// appointments. 7a → 9p, one column per hour @ 70px wide. Appointments
// are absolutely positioned by `startHour` and `durationHours`.
//
// The "NOW" marker is a 2px terracotta bar at the current time. Because
// the strip is rendered on the server, we read `new Date()` once and
// the position is stable for that render — the page should refetch on
// a timer if it needs live tracking.

import type { Route } from 'next';
import Link from 'next/link';
import type { ScheduleAppointment } from './types';

type ScheduleStripProps = {
  appointments: ScheduleAppointment[];
  dateLabel: string;
};

const START_HOUR = 7;
const END_HOUR = 21;
const HOUR_WIDTH = 70;
const TRACK_HEIGHT = 110;

function formatHour(h: number): string {
  const period = h >= 12 ? 'p' : 'a';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${period}`;
}

function formatNowLabel(decimal: number): string {
  const h = Math.floor(decimal);
  const m = Math.floor((decimal - h) * 60);
  const period = h >= 12 ? 'p' : 'a';
  const h12 = ((h + 11) % 12) + 1;
  return `NOW · ${h12}:${m.toString().padStart(2, '0')}${period}`;
}

const BUCKET_CLASSES: Record<ScheduleAppointment['colorBucket'], string> = {
  sage: 'bg-sage-tint border-sage-soft border-l-sage',
  warm: 'bg-[#F4E4DA] border-[#E8C6B1] border-l-terracotta',
  sky: 'bg-sky-soft border-sky-soft border-l-sky',
  plum: 'bg-[#E7DFE6] border-[#D2C2D0] border-l-plum',
  sand: 'bg-sand-soft border-sand-soft border-l-sand',
};

export function ScheduleStrip({
  appointments,
  dateLabel,
}: ScheduleStripProps) {
  const hours: number[] = [];
  for (let h = START_HOUR; h < END_HOUR; h++) hours.push(h);
  const trackWidth = hours.length * HOUR_WIDTH;

  const now = new Date();
  const nowDecimal = now.getHours() + now.getMinutes() / 60;
  const showNow = nowDecimal >= START_HOUR && nowDecimal < END_HOUR;
  const nowLeft = (nowDecimal - START_HOUR) * HOUR_WIDTH;

  return (
    <section className="flex flex-col gap-s3 rounded-md border border-line bg-surface p-s5 shadow-sm">
      <header className="flex items-center gap-s3">
        <h3 className="t-display-md text-ink">Today&rsquo;s schedule</h3>
        <span className="t-body-md text-ink-4">
          {dateLabel} · {appointments.length}{' '}
          {appointments.length === 1 ? 'appointment' : 'appointments'}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-[2px] rounded-sm bg-surface-sunk p-[3px]">
          <span
            aria-pressed="true"
            className="rounded-sm bg-surface-2 px-s3 py-[6px] text-[12px] font-medium text-ink shadow-sm"
          >
            Day
          </span>
          <Link
            href={'/admin/calendar?view=week' as Route}
            className="rounded-sm px-s3 py-[6px] text-[12px] font-medium text-ink-3 hover:text-ink"
          >
            Week
          </Link>
          <Link
            href={'/admin/calendar?view=staff' as Route}
            className="rounded-sm px-s3 py-[6px] text-[12px] font-medium text-ink-3 hover:text-ink"
          >
            Staff
          </Link>
        </div>
        <Link
          href={'/admin/calendar' as Route}
          className="text-[12px] font-medium text-sage-deep hover:text-ink"
        >
          Open calendar &rarr;
        </Link>
      </header>

      {appointments.length === 0 ? (
        <div className="py-s8 text-center font-display italic t-body-md text-ink-4">
          No bookings on the calendar today.
        </div>
      ) : (
        <div className="-mx-s2 overflow-x-auto pb-s2">
          <div
            className="relative px-s2"
            style={{ width: trackWidth, minHeight: TRACK_HEIGHT }}
          >
            {/* Hour columns — dashed leading border + label */}
            <div className="absolute inset-0 flex">
              {hours.map((h) => (
                <div
                  key={h}
                  className="relative border-l border-dashed border-line"
                  style={{ width: HOUR_WIDTH }}
                >
                  <span className="absolute left-[8px] top-[4px] font-mono text-[11px] text-ink-4 tabular-nums">
                    {formatHour(h)}
                  </span>
                </div>
              ))}
            </div>

            {/* Appointments */}
            {appointments.map((appt) => {
              const left = (appt.startHour - START_HOUR) * HOUR_WIDTH + 6;
              const width = appt.durationHours * HOUR_WIDTH - 6;
              return (
                <div
                  key={appt.id}
                  className={`absolute top-[28px] flex flex-col gap-[2px] overflow-hidden rounded-sm border border-l-[3px] px-s2 py-[6px] ${BUCKET_CLASSES[appt.colorBucket]}`}
                  style={{ left, width, height: 56 }}
                >
                  <div className="t-body-sm truncate font-semibold text-ink">
                    {appt.clientFirstName}
                  </div>
                  <div className="t-caption truncate font-medium text-ink-3">
                    {appt.staffFirstName} &middot; {appt.serviceName}
                  </div>
                </div>
              );
            })}

            {/* NOW marker */}
            {showNow ? (
              <div
                className="pointer-events-none absolute top-[22px] z-[3]"
                style={{ left: nowLeft, bottom: 4 }}
              >
                <span className="absolute -left-[3px] top-0 block h-[8px] w-[8px] rounded-full bg-terracotta" />
                <span className="block h-full w-[2px] bg-terracotta" />
                <span className="absolute -left-[16px] -top-[16px] whitespace-nowrap rounded-sm bg-surface px-[5px] py-[1px] text-[10px] font-semibold uppercase tracking-[0.04em] text-terracotta">
                  {formatNowLabel(nowDecimal)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
