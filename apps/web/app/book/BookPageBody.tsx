'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useMemo } from 'react';

import { CalendarMonthView } from '@/app/admin/calendar/CalendarMonthView';
import { CalendarViewToggle } from '@/app/admin/calendar/CalendarViewToggle';
import { CalendarWeekView } from '@/app/admin/calendar/CalendarWeekView';
import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  addDays,
  formatDateLong,
  formatDateShort,
  isToday,
  toDateParam,
} from '@/lib/calendar';
import {
  buildCalendarUrl,
  shiftAnchorDate,
  type CalendarViewMode,
  weekDayDates,
} from '@/lib/calendar-view';

const BOOK = '/book';

interface BookPageBodyProps {
  date: Date;
  dateParam: string;
  view: CalendarViewMode;
}

// Client self-service booking shell — public booking flow (R2 §4). Wire to
// availability + slot-hold APIs when backend routes are ready.

export function BookPageBody({ date, dateParam, view }: BookPageBodyProps) {
  const weekDays = useMemo(() => weekDayDates(date), [date]);

  const periodTitle = useMemo(() => {
    if (view === 'month') {
      return date.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      });
    }
    if (view === 'week') {
      const a = weekDays[0];
      const b = weekDays[6];
      if (!a || !b) return formatDateLong(date);
      return `${formatDateShort(a)} – ${formatDateShort(b)}`;
    }
    return formatDateLong(date);
  }, [date, view, weekDays]);

  const prevNav = useMemo(() => {
    const d = shiftAnchorDate(date, view, 'prev');
    return buildCalendarUrl(BOOK, { date: toDateParam(d), view });
  }, [date, view]);

  const nextNav = useMemo(() => {
    const d = shiftAnchorDate(date, view, 'next');
    return buildCalendarUrl(BOOK, { date: toDateParam(d), view });
  }, [date, view]);

  const jumpTodayNav = useMemo(() => {
    const t = toDateParam(new Date());
    return buildCalendarUrl(BOOK, { date: t, view });
  }, [view]);

  const dayJumpPrev = useMemo(
    () =>
      buildCalendarUrl(BOOK, {
        date: toDateParam(addDays(date, -1)),
        view: 'day',
      }),
    [date],
  );
  const dayJumpNext = useMemo(
    () =>
      buildCalendarUrl(BOOK, {
        date: toDateParam(addDays(date, +1)),
        view: 'day',
      }),
    [date],
  );

  const emptyStaff = useMemo(() => new Map(), []);
  const emptyService = useMemo(() => new Map(), []);

  const hrefSelected = useCallback((appointmentId: string, tab?: string) => {
    return buildCalendarUrl(BOOK, {
      date: dateParam,
      view: 'day',
      selected: appointmentId,
      tab: tab && tab !== 'overview' ? tab : undefined,
    });
  }, [dateParam]);

  const bookHomeHref = useMemo(
    () => buildCalendarUrl(BOOK, { date: dateParam, view }),
    [dateParam, view],
  );

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-surface-3 bg-white px-s8">
        <Link
          href={bookHomeHref as Route}
          className="t-display-sm font-display font-semibold text-ink no-underline"
        >
          Wellos
        </Link>
        <nav className="hidden items-center gap-s6 md:flex">
          <span className="t-body-md text-ink-soft">Home</span>
          <span className="t-body-md text-ink-soft">My Appointments</span>
          <span className="t-body-md text-ink-soft">Forms</span>
          <span className="t-body-md text-ink-soft">Files</span>
          <span className="t-body-md text-ink-soft">Profile</span>
        </nav>
        <div
          className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-accent-pale t-caption font-bold text-accent"
          aria-hidden
        >
          R
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] px-s6 py-s8 md:px-s8">
        <section className="grid gap-s5 rounded-3xl border border-surface-3 bg-gradient-to-br from-white to-accent-pale/30 p-s7 shadow-sm md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div>
            <span className="t-eyebrow text-accent">Client portal</span>
            <h1 className="mt-s2 t-display-xl text-ink">
              Book your next visit in under a minute.
            </h1>
            <p className="mt-s3 max-w-xl t-body-md text-ink-soft">
              Choose a service, pick a time, and manage your appointment
              without creating a password.
            </p>
            <div className="mt-s5 flex flex-wrap gap-s3">
              <Link
                href={buildCalendarUrl(BOOK, {
                  date: dateParam,
                  view: 'day',
                }) as Route}
                className={cn(
                  'inline-flex items-center justify-center rounded-md bg-accent px-s5 py-[10px] t-body-md font-medium text-white shadow-sm',
                  'transition-[background-color,transform,box-shadow] duration-fast',
                  'hover:-translate-y-px hover:bg-accent-mid hover:shadow-md',
                  'focus-visible:outline-none focus-visible:shadow-focus',
                )}
              >
                Quick Book
              </Link>
              <Link
                href="#history"
                className={cn(
                  'inline-flex items-center justify-center rounded-md border border-surface-3 bg-white px-s5 py-[10px] t-body-md font-medium text-ink shadow-sm',
                  'transition-[background-color,transform,box-shadow] duration-fast',
                  'hover:-translate-y-px hover:bg-surface-2 hover:shadow-md',
                  'focus-visible:outline-none focus-visible:shadow-focus',
                )}
              >
                Book Again
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-surface-3 bg-white p-s5 shadow-sm">
            <strong className="t-body-lg text-ink">Upcoming appointment</strong>
            <span className="mt-s2 block t-body-md text-ink-soft">
              Hydrating Facial · Sat, May 2 at 12:45 PM
            </span>
            <span className="mt-s1 block t-body-md text-ink-soft">
              Sara Thompson · Wellos Studio
            </span>
            <div className="mt-s4 flex flex-wrap gap-s2">
              <Badge tone="accent">Confirmed</Badge>
              <Badge tone="neutral">Add to calendar</Badge>
            </div>
          </div>
        </section>

        <div id="book" className="mt-s6 flex flex-col gap-s6">
          <section className="rounded-2xl border border-surface-3 bg-white p-s5 shadow-sm">
            <header className="flex flex-col gap-s4 md:flex-row md:items-end md:justify-between">
              <div className="flex flex-col gap-s1">
                <span className="t-eyebrow text-accent">Scheduling</span>
                <h2 className="t-display-md flex flex-wrap items-baseline gap-s3 text-ink">
                  {periodTitle}
                  {view === 'day' && isToday(date) && (
                    <Badge tone="accent" className="self-center">
                      Today
                    </Badge>
                  )}
                </h2>
                <div className="flex flex-wrap items-center gap-s3">
                  <Link href={prevNav as Route} className="no-underline">
                    <Button variant="ghost" size="sm">
                      {view === 'day' && (
                        <>← {formatDateShort(addDays(date, -1))}</>
                      )}
                      {view === 'week' && <>← Previous week</>}
                      {view === 'month' && <>← Previous month</>}
                    </Button>
                  </Link>
                  <Link href={jumpTodayNav as Route} className="no-underline">
                    <Button variant="ghost" size="sm">
                      {view === 'month'
                        ? 'This month'
                        : view === 'week'
                          ? 'This week'
                          : 'Today'}
                    </Button>
                  </Link>
                  <Link href={nextNav as Route} className="no-underline">
                    <Button variant="ghost" size="sm">
                      {view === 'day' && (
                        <>{formatDateShort(addDays(date, +1))} →</>
                      )}
                      {view === 'week' && <>Next week →</>}
                      {view === 'month' && <>Next month →</>}
                    </Button>
                  </Link>
                  {view !== 'day' && (
                    <>
                      <span className="text-ink-soft">·</span>
                      <Link href={dayJumpPrev as Route} className="no-underline">
                        <Button variant="ghost" size="sm">
                          Day ←
                        </Button>
                      </Link>
                      <Link href={dayJumpNext as Route} className="no-underline">
                        <Button variant="ghost" size="sm">
                          Day →
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <CalendarViewToggle
                surface="book"
                dateParam={dateParam}
                active={view}
              />
            </header>

            <div className="mt-s5">
              {view === 'week' ? (
                <CalendarWeekView
                  weekDays={weekDays}
                  appointments={[]}
                  staffById={emptyStaff}
                  serviceById={emptyService}
                  hrefSelected={hrefSelected}
                  mode="staff"
                />
              ) : view === 'month' ? (
                <CalendarMonthView
                  anchorMonth={date}
                  appointments={[]}
                  basePath={BOOK}
                />
              ) : null}
            </div>

            {view !== 'day' && (
              <p className="mt-s5 t-body-md text-ink-soft">
                Choose <strong className="text-ink">Day</strong> view to pick a
                service, provider, and time. Month and week help you scan
                availability first.
              </p>
            )}
          </section>

          {view === 'day' && (
            <div className="grid gap-s6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div className="rounded-2xl border border-surface-3 bg-white p-s5 shadow-sm">
                <h2 className="t-display-md text-ink">Self-service booking</h2>
                <p className="mt-s2 t-body-md text-ink-soft">
                  Friendly client booking view. Internal notes and admin controls
                  stay hidden.
                </p>

                <div className="mt-s5 flex flex-wrap gap-s2">
                  {['1 Service', '2 Provider', '3 Time', '4 Confirm'].map(
                    (label, i) => (
                      <span
                        key={label}
                        className={
                          i === 0
                            ? 'rounded-full bg-accent px-s3 py-s2 t-caption font-semibold text-white'
                            : 'rounded-full bg-surface-2 px-s3 py-s2 t-caption font-semibold text-ink-soft'
                        }
                      >
                        {label}
                      </span>
                    ),
                  )}
                </div>

                <div className="mt-s6 grid gap-s4 sm:grid-cols-2">
                  <article className="overflow-hidden rounded-2xl border border-surface-3 bg-surface">
                    <div className="h-28 bg-gradient-to-br from-accent-pale to-white" />
                    <div className="p-s4">
                      <strong className="t-body-lg text-ink">
                        Hydrating Facial
                      </strong>
                      <p className="mt-s2 t-body-sm text-ink-soft">
                        45 minutes · gentle skin refresh.
                      </p>
                      <Badge tone="accent" className="mt-s3">
                        Most booked
                      </Badge>
                      <Button variant="accent" size="md" className="mt-s4 w-full">
                        Select
                      </Button>
                    </div>
                  </article>
                  <article className="overflow-hidden rounded-2xl border border-surface-3 bg-surface">
                    <div className="h-28 bg-gradient-to-br from-accent-pale to-white" />
                    <div className="p-s4">
                      <strong className="t-body-lg text-ink">
                        Deep Tissue Massage
                      </strong>
                      <p className="mt-s2 t-body-sm text-ink-soft">
                        60 minutes · targeted recovery.
                      </p>
                      <Badge tone="neutral" className="mt-s3">
                        Popular
                      </Badge>
                      <Button
                        variant="ghost"
                        size="md"
                        className="mt-s4 w-full border border-surface-3 bg-white shadow-sm"
                      >
                        View details
                      </Button>
                    </div>
                  </article>
                </div>

                <h3 className="mt-s8 t-display-sm text-ink">Pick a time</h3>
                <p className="mt-s2 t-body-sm text-ink-soft">
                  Times shown in your local timezone.
                </p>
                <div className="mt-s4 grid grid-cols-2 gap-s2 sm:grid-cols-3">
                  {['9:00 AM', '12:45 PM', '3:00 PM', '4:15 PM', '5:30 PM'].map(
                    (t, i) => (
                      <button
                        key={t}
                        type="button"
                        className={
                          i === 1
                            ? 'rounded-xl border-2 border-accent bg-accent-pale py-s3 t-body-sm font-semibold text-accent'
                            : 'rounded-xl border border-surface-3 bg-white py-s3 t-body-sm font-semibold text-ink shadow-sm'
                        }
                      >
                        {t}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    className="rounded-xl border border-surface-3 bg-white py-s3 t-body-sm font-semibold text-ink-soft shadow-sm"
                  >
                    Waitlist
                  </button>
                </div>

                <h3 className="mt-s8 t-display-sm text-ink">Quick preferences</h3>
                <p className="mt-s2 t-body-sm text-ink-soft">
                  Optional answers help staff prepare before your visit.
                </p>
                <div className="mt-s4 grid gap-s4 sm:grid-cols-2">
                  <label className="flex flex-col gap-s2">
                    <span className="t-caption font-semibold text-ink">
                      Focus area
                    </span>
                    <select className="rounded-xl border border-surface-3 bg-white px-s3 py-s3 t-body-md text-ink shadow-sm">
                      <option>Face hydration</option>
                      <option>Shoulders / neck</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-s2">
                    <span className="t-caption font-semibold text-ink">
                      Provider preference
                    </span>
                    <select className="rounded-xl border border-surface-3 bg-white px-s3 py-s3 t-body-md text-ink shadow-sm">
                      <option>Best available</option>
                      <option>Sara Thompson</option>
                    </select>
                  </label>
                </div>
                <div className="mt-s4 rounded-2xl border border-dashed border-surface-3 bg-surface px-s4 py-s6 text-center t-body-sm font-semibold text-ink-soft">
                  + Attach reference photo or document
                </div>
              </div>

              <aside className="sticky top-20 rounded-2xl border border-surface-3 bg-white p-s5 shadow-sm lg:top-24">
                <h2 className="t-display-md text-ink">Confirm booking</h2>
                <p className="mt-s2 t-body-md text-ink-soft">
                  Simple summary before you confirm.
                </p>
                <label className="mt-s5 flex flex-col gap-s2">
                  <span className="t-caption font-semibold text-ink">Name</span>
                  <input
                    readOnly
                    className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink"
                    value="Rosa Castillo"
                  />
                </label>
                <div className="mt-s4 grid gap-s4 sm:grid-cols-2">
                  <label className="flex flex-col gap-s2">
                    <span className="t-caption font-semibold text-ink">Email</span>
                    <input
                      readOnly
                      className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink"
                      value="rosa@example.com"
                    />
                  </label>
                  <label className="flex flex-col gap-s2">
                    <span className="t-caption font-semibold text-ink">Phone</span>
                    <input
                      readOnly
                      className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink"
                      value="555-555-5555"
                    />
                  </label>
                </div>
                <label className="mt-s4 flex flex-col gap-s2">
                  <span className="t-caption font-semibold text-ink">
                    Note for your provider
                  </span>
                  <textarea
                    readOnly
                    rows={3}
                    className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink"
                    value="I prefer a quiet room if available."
                  />
                </label>
                <div className="mt-s5 space-y-0 rounded-2xl border border-surface-3 bg-surface px-s4 py-s3">
                  <div className="flex justify-between gap-s3 border-b border-surface-3 py-s2 t-body-sm">
                    <span className="text-ink-soft">Service</span>
                    <strong>Hydrating Facial</strong>
                  </div>
                  <div className="flex justify-between gap-s3 border-b border-surface-3 py-s2 t-body-sm">
                    <span className="text-ink-soft">Provider</span>
                    <strong>Sara Thompson</strong>
                  </div>
                  <div className="flex justify-between gap-s3 border-b border-surface-3 py-s2 t-body-sm">
                    <span className="text-ink-soft">Date</span>
                    <strong>May 2, 12:45 PM</strong>
                  </div>
                  <div className="flex justify-between gap-s3 py-s2 t-body-sm">
                    <span className="text-ink-soft">Policy</span>
                    <strong>Free cancel until Fri 12:45 PM</strong>
                  </div>
                </div>
                <div className="mt-s5 rounded-2xl border border-green/20 bg-green-pale px-s4 py-s4 t-body-sm font-semibold text-green">
                  Your files and notes attach to this visit and your client account.
                </div>
                <Button variant="accent" size="md" className="mt-s5 w-full">
                  Book Appointment
                </Button>
              </aside>
            </div>
          )}
        </div>

        <section
          id="history"
          className="mt-s8 rounded-2xl border border-surface-3 bg-white p-s5 shadow-sm"
        >
          <h2 className="t-display-md text-ink">Book again</h2>
          <p className="mt-s2 t-body-md text-ink-soft">
            Recent visits are easy to repeat.
          </p>
          <div className="mt-s5 grid gap-s3 md:grid-cols-2">
            <div className="rounded-2xl border border-surface-3 bg-surface px-s4 py-s4">
              <strong className="t-body-md text-ink">Hydrating Facial</strong>
              <span className="mt-s1 block t-caption text-ink-soft">
                Last booked May 2 · with Sara Thompson
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="mt-s3 border border-surface-3 bg-white shadow-sm"
              >
                Book again
              </Button>
            </div>
            <div className="rounded-2xl border border-surface-3 bg-surface px-s4 py-s4">
              <strong className="t-body-md text-ink">Deep Tissue Massage</strong>
              <span className="mt-s1 block t-caption text-ink-soft">
                Last booked Apr 18 · with Sara Thompson
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="mt-s3 border border-surface-3 bg-white shadow-sm"
              >
                Book again
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
