'use client';

import Link from 'next/link';
import type { Route } from 'next';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from 'react';

import { CalendarMonthView } from '@/app/admin/calendar/CalendarMonthView';
import { CalendarViewToggle } from '@/app/admin/calendar/CalendarViewToggle';
import { CalendarWeekView } from '@/app/admin/calendar/CalendarWeekView';
import { Badge, Button } from '@/components/ui';
import type { PublicBookingCatalogResponse } from '@/lib/api/public-booking-server';
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
import {
  SlotHoldApiError,
  acquireSlotHold,
  getOrCreateBookingFingerprint,
  releaseSlotHold,
  type SlotHoldResponse,
} from '@/lib/api/slot-holds';

import { InstallPromptBanner } from '@/app/_pwa/InstallPromptBanner';

import {
  loadPublicAvailabilityAction,
  submitPublicBookingAction,
  type PublicBookingRequiredForm,
} from './_actions';
import { SlotHoldTimer } from './SlotHoldTimer';
import { WaitlistSignupSheet } from './WaitlistSignupSheet';

const BOOK = '/book';

interface BookPageBodyProps {
  date: Date;
  dateParam: string;
  view: CalendarViewMode;
  tenantSlug: string;
  initialCatalog: PublicBookingCatalogResponse | null;
  initialCatalogError: string | null;
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatSlotLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function BookPageBody({
  date,
  dateParam,
  view,
  tenantSlug,
  initialCatalog,
  initialCatalogError,
}: BookPageBodyProps) {
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

  const emptyStaff = useMemo(() => new Map(), []);
  const emptyService = useMemo(() => new Map(), []);

  const hrefSelected = useCallback(
    (appointmentId: string, tab?: string) => {
      return buildCalendarUrl(BOOK, {
        date: dateParam,
        view: 'day',
        selected: appointmentId,
        tab: tab && tab !== 'overview' ? tab : undefined,
        ...(tenantSlug ? { tenant: tenantSlug } : {}),
      });
    },
    [dateParam, tenantSlug],
  );

  const hrefWithTenant = useCallback(
    (
      path: typeof BOOK,
      params: Omit<Parameters<typeof buildCalendarUrl>[1], 'tenant'>,
    ) => {
      return buildCalendarUrl(path, {
        ...params,
        ...(tenantSlug ? { tenant: tenantSlug } : {}),
      });
    },
    [tenantSlug],
  );

  // --- Public booking (day view) ---
  const catalog = initialCatalog;
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    null,
  );
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const [slots, setSlots] = useState<
    Array<{ startAt: string; endAt: string }>
  >([]);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(
    null,
  );
  const [guestFirst, setGuestFirst] = useState('');
  const [guestLast, setGuestLast] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestNote, setGuestNote] = useState('');
  const [bookingMessage, setBookingMessage] = useState<string | null>(null);
  /** PR 8 — when set, the booking was rejected with FORMS_REQUIRED. UI shows
   *  an amber alert listing each unsatisfied form. */
  const [requiredFormsBlock, setRequiredFormsBlock] = useState<
    PublicBookingRequiredForm[] | null
  >(null);
  const [bookingDone, setBookingDone] = useState<{
    id: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    /** R2 §11.2 — when set, booking entered `requested`, not `confirmed`. */
    requested?: boolean;
  } | null>(null);

  const [loadingSlots, setLoadingSlots] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  const [pendingBook, startBookTransition] = useTransition();

  // R2 §9 slot hold. While the user is on step 3+ (time picked, filling
  // details), we hold the slot server-side for 7 minutes. The hold expires
  // on its own; we also explicitly release when the user picks a different
  // time, navigates away, or the timer fires.
  const [activeHold, setActiveHold] = useState<SlotHoldResponse | null>(null);
  const [holdMessage, setHoldMessage] = useState<string | null>(null);
  const [acquiringHold, setAcquiringHold] = useState(false);

  useEffect(() => {
    if (!catalog?.locations.length) {
      setSelectedLocationId(null);
      return;
    }
    setSelectedLocationId((prev) => {
      if (prev && catalog.locations.some((l) => l.id === prev)) return prev;
      return catalog.locations[0]?.id ?? null;
    });
  }, [catalog]);

  const selectedService = useMemo(
    () => catalog?.services.find((s) => s.id === selectedServiceId) ?? null,
    [catalog, selectedServiceId],
  );

  const staffChoices = useMemo(() => {
    if (!catalog || !selectedService) return [];
    const idSet = new Set(selectedService.staffIds);
    return catalog.staff.filter((s) => idSet.has(s.id));
  }, [catalog, selectedService]);

  useEffect(() => {
    if (!selectedServiceId) {
      setSelectedStaffId(null);
      return;
    }
    setSelectedStaffId((prev) => {
      if (prev && staffChoices.some((s) => s.id === prev)) return prev;
      return staffChoices[0]?.id ?? null;
    });
  }, [selectedServiceId, staffChoices]);

  useEffect(() => {
    if (
      !tenantSlug ||
      !selectedServiceId ||
      !selectedStaffId ||
      !selectedLocationId ||
      !catalog
    ) {
      setSlots([]);
      setSlotsError(null);
      setSelectedSlotStart(null);
      setLoadingSlots(false);
      return;
    }

    const loc = catalog.locations.find((l) => l.id === selectedLocationId);
    let cancelled = false;
    setLoadingSlots(true);
    setSlotsError(null);

    void loadPublicAvailabilityAction({
      tenantSlug,
      staffId: selectedStaffId,
      serviceId: selectedServiceId,
      locationId: selectedLocationId,
      date: dateParam,
      tz: loc?.timezone,
    }).then((res) => {
      if (cancelled) return;
      setLoadingSlots(false);
      if (res.ok) {
        setSlots(res.slots);
      } else {
        setSlots([]);
        setSlotsError(res.message);
      }
      setSelectedSlotStart(null);
    });

    return () => {
      cancelled = true;
    };
  }, [
    tenantSlug,
    selectedServiceId,
    selectedStaffId,
    selectedLocationId,
    dateParam,
    catalog,
  ]);

  // Pick-a-time handler. Acquires a server-side hold; on conflict, surfaces
  // a banner and keeps the previous selection cleared so the user picks again.
  const handlePickSlot = useCallback(
    async (slotStart: string) => {
      setHoldMessage(null);
      if (!tenantSlug || !selectedLocationId || !selectedStaffId || !selectedServiceId) {
        // Should be unreachable — the slot button only renders once these
        // are set — but guard anyway to keep the hold call well-formed.
        setSelectedSlotStart(slotStart);
        return;
      }

      // Release any previous hold before reserving a new one.
      const prior = activeHold;
      setActiveHold(null);
      if (prior) {
        void releaseSlotHold(prior.holdId);
      }

      setAcquiringHold(true);
      try {
        const fingerprint = getOrCreateBookingFingerprint();
        const hold = await acquireSlotHold({
          tenantSlug,
          locationId: selectedLocationId,
          serviceId: selectedServiceId,
          staffId: selectedStaffId,
          startsAt: slotStart,
          fingerprint,
        });
        setActiveHold(hold);
        setSelectedSlotStart(slotStart);
      } catch (err) {
        setSelectedSlotStart(null);
        if (err instanceof SlotHoldApiError && err.isConflict()) {
          setHoldMessage(
            'This time was just taken. Refresh the list and pick a nearby opening.',
          );
        } else if (err instanceof SlotHoldApiError) {
          setHoldMessage(err.message);
        } else {
          setHoldMessage(
            'Could not reserve this time. Check your connection and try again.',
          );
        }
      } finally {
        setAcquiringHold(false);
      }
    },
    [tenantSlug, selectedLocationId, selectedStaffId, selectedServiceId, activeHold],
  );

  const handleHoldExpired = useCallback(() => {
    // Server already moved the row to `expired` via TTL — local cleanup only.
    setActiveHold(null);
    setSelectedSlotStart(null);
    setHoldMessage('This time was released. Pick a new opening.');
  }, []);

  // Best-effort release on page unload so concurrent bookers see the slot
  // free up immediately instead of waiting on TTL.
  useEffect(() => {
    if (!activeHold) return undefined;
    const holdId = activeHold.holdId;
    const onUnload = () => {
      void releaseSlotHold(holdId);
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [activeHold]);

  // If the upstream selection (service/staff/location/date) changes and
  // clears the selected slot, the hold is now pointing at a stale slot —
  // release it so the table doesn't fill up with orphaned active rows.
  useEffect(() => {
    if (selectedSlotStart) return;
    if (!activeHold) return;
    const holdId = activeHold.holdId;
    setActiveHold(null);
    void releaseSlotHold(holdId);
  }, [selectedSlotStart, activeHold]);

  // PR 2 (geofence epic) — mark the visitor so a future /book visit will
  // qualify as "returning." The install banner reads this key to decide
  // whether to surface itself. First visit writes; subsequent visits show.
  useEffect(() => {
    try {
      window.localStorage.setItem('wellos.has-visited', 'true');
    } catch {
      // localStorage disabled / quota — banner just never appears for this
      // user. Acceptable fallback.
    }
  }, []);

  const onSubmitBooking = () => {
    setBookingMessage(null);
    setRequiredFormsBlock(null);
    if (
      !tenantSlug ||
      !selectedLocationId ||
      !selectedStaffId ||
      !selectedServiceId ||
      !selectedSlotStart
    ) {
      setBookingMessage('Pick a service, provider, time, and your contact info.');
      return;
    }
    if (!guestFirst.trim() || !guestEmail.trim()) {
      setBookingMessage('Name and email are required.');
      return;
    }

    const idempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    startBookTransition(() => {
      void (async () => {
        const res = await submitPublicBookingAction({
          tenantSlug,
          guest: {
            firstName: guestFirst.trim(),
            lastName: guestLast.trim() || undefined,
            email: guestEmail.trim(),
            phone: guestPhone.trim() || undefined,
          },
          locationId: selectedLocationId,
          staffId: selectedStaffId,
          serviceId: selectedServiceId,
          scheduledStartAt: selectedSlotStart,
          notes: guestNote.trim() || undefined,
          idempotencyKey,
        });
        if (res.ok) {
          setBookingDone({
            id: res.result.appointment.id,
            scheduledStartAt: res.result.appointment.scheduledStartAt,
            scheduledEndAt: res.result.appointment.scheduledEndAt,
            requested:
              res.result.bookingPolicy === 'request_approval' ||
              res.result.appointment.state === 'requested',
          });
          setBookingMessage(null);
          setRequiredFormsBlock(null);
          // The appointment row now holds the DB-level exclusion, so the
          // hold is redundant. Release it so the row doesn't linger in
          // `active` until TTL. (A future PR can wire holdId into the
          // confirm endpoint and mark it `consumed` server-side.)
          const finishedHold = activeHold;
          setActiveHold(null);
          if (finishedHold) {
            void releaseSlotHold(finishedHold.holdId);
          }
          return;
        }
        // PR 8 — FORMS_REQUIRED renders as a distinct amber alert listing
        // each unsatisfied form. Other failures keep the red banner copy.
        if (res.requiredForms && res.requiredForms.length > 0) {
          setRequiredFormsBlock(res.requiredForms);
          setBookingMessage(null);
          return;
        }
        setBookingMessage(res.message);
      })();
    });
  };

  const summaryServiceName = selectedService?.name ?? '—';
  const summaryStaffName =
    catalog?.staff.find((s) => s.id === selectedStaffId)?.displayName ?? '—';
  const summaryWhen = selectedSlotStart
    ? `${formatDateLong(new Date(selectedSlotStart))} · ${formatSlotLabel(selectedSlotStart)}`
    : '—';
  // R2 §11.2 — request_approval changes the confirm copy + post-submit message.
  const isRequestApproval =
    selectedService?.bookingPolicy === 'request_approval';

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-surface-3 bg-white px-s8">
        <Link
          href={hrefWithTenant(BOOK, { date: dateParam, view }) as Route}
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
        {/* PR 2 (geofence epic) — returning-client install nudge. Banner
            internally gates on flag + has-visited + dismissal + standalone,
            so caller doesn't conditionally render. */}
        <div className="mb-s6">
          <InstallPromptBanner surface="returning-client" tone="neutral" />
        </div>

        {!tenantSlug ? (
          <div
            className="mb-s6 rounded-2xl border border-amber-200 bg-amber-50 px-s5 py-s4 t-body-md text-ink"
            role="status"
          >
            Add{' '}
            <code className="rounded bg-white px-s2 py-s1 t-caption">
              ?tenant=your-tenant-slug
            </code>{' '}
            to the URL (or set{' '}
            <code className="rounded bg-white px-s2 py-s1 t-caption">
              NEXT_PUBLIC_BOOKING_TENANT_SLUG
            </code>{' '}
            for local demos). Slugs match{' '}
            <code className="rounded bg-white px-s2 py-s1 t-caption">
              tenants.slug
            </code>{' '}
            in Postgres.
          </div>
        ) : null}

        {tenantSlug && initialCatalogError ? (
          <div
            className="mb-s6 rounded-2xl border border-red-200 bg-red-50 px-s5 py-s4 t-body-md text-red-900"
            role="alert"
          >
            {initialCatalogError}
          </div>
        ) : null}

        <section className="grid gap-s5 rounded-3xl border border-surface-3 bg-gradient-to-br from-white to-accent-pale/30 p-s7 shadow-sm md:grid-cols-[1.2fr_0.8fr] md:items-center">
          <div>
            <span className="t-eyebrow text-accent">Client portal</span>
            <h1 className="mt-s2 t-display-xl text-ink">
              Book your next visit in under a minute.
            </h1>
            <p className="mt-s3 max-w-xl t-body-md text-ink-soft">
              Choose a service, pick a time, and confirm — no password required.
              Payments and confirmation SMS/email ship in a later phase.
            </p>
            <div className="mt-s5 flex flex-wrap gap-s3">
              <Link
                href={
                  hrefWithTenant(BOOK, {
                    date: dateParam,
                    view: 'day',
                  }) as Route
                }
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
            <strong className="t-body-lg text-ink">
              {bookingDone ? 'Booked' : 'Upcoming appointment'}
            </strong>
            <span className="mt-s2 block t-body-md text-ink-soft">
              {bookingDone
                ? `${summaryServiceName} · ${formatSlotLabel(bookingDone.scheduledStartAt)}`
                : tenantSlug
                  ? 'Pick a time in Day view to reserve your slot.'
                  : 'Set a tenant slug to load live catalog data.'}
            </span>
            <span className="mt-s1 block t-body-md text-ink-soft">
              {bookingDone
                ? `Confirmation id ${bookingDone.id.slice(0, 8)}…`
                : `${summaryStaffName} · Live catalog`}
            </span>
            <div className="mt-s4 flex flex-wrap gap-s2">
              <Badge tone={bookingDone ? 'accent' : 'neutral'}>
                {bookingDone
                  ? bookingDone.requested
                    ? 'Pending approval'
                    : 'Confirmed'
                  : 'Draft'}
              </Badge>
              <Badge tone="neutral">Magic link manage — TODO</Badge>
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
                  <Link
                    href={hrefWithTenant(BOOK, {
                      date: toDateParam(shiftAnchorDate(date, view, 'prev')),
                      view,
                    }) as Route}
                    className="no-underline"
                  >
                    <Button variant="ghost" size="sm">
                      {view === 'day' && (
                        <>← {formatDateShort(addDays(date, -1))}</>
                      )}
                      {view === 'week' && <>← Previous week</>}
                      {view === 'month' && <>← Previous month</>}
                    </Button>
                  </Link>
                  <Link
                    href={hrefWithTenant(BOOK, {
                      date: toDateParam(new Date()),
                      view,
                    }) as Route}
                    className="no-underline"
                  >
                    <Button variant="ghost" size="sm">
                      {view === 'month'
                        ? 'This month'
                        : view === 'week'
                          ? 'This week'
                          : 'Today'}
                    </Button>
                  </Link>
                  <Link
                    href={hrefWithTenant(BOOK, {
                      date: toDateParam(shiftAnchorDate(date, view, 'next')),
                      view,
                    }) as Route}
                    className="no-underline"
                  >
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
                      <Link
                        href={
                          hrefWithTenant(BOOK, {
                            date: toDateParam(addDays(date, -1)),
                            view: 'day',
                          }) as Route
                        }
                        className="no-underline"
                      >
                        <Button variant="ghost" size="sm">
                          Day ←
                        </Button>
                      </Link>
                      <Link
                        href={
                          hrefWithTenant(BOOK, {
                            date: toDateParam(addDays(date, +1)),
                            view: 'day',
                          }) as Route
                        }
                        className="no-underline"
                      >
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
                tenantSlug={tenantSlug || undefined}
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
                  preserveParams={
                    tenantSlug ? { tenant: tenantSlug } : undefined
                  }
                />
              ) : null}
            </div>

            {view !== 'day' && (
              <p className="mt-s5 t-body-md text-ink-soft">
                Choose <strong className="text-ink">Day</strong> view to pick a
                service, provider, and time. Month and week help you scan the
                calendar layout first.
              </p>
            )}
          </section>

          {view === 'day' && (
            <div className="grid gap-s6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div className="rounded-2xl border border-surface-3 bg-white p-s5 shadow-sm">
                <h2 className="t-display-md text-ink">Self-service booking</h2>
                <p className="mt-s2 t-body-md text-ink-soft">
                  Connected to{' '}
                  <code className="rounded bg-surface px-s2 py-s1 t-caption">
                    GET /public/booking/*
                  </code>{' '}
                  on the API. Stripe card capture deferred per Phase 1 slice.
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

                {catalog && catalog.locations.length > 1 ? (
                  <label className="mt-s6 flex max-w-md flex-col gap-s2">
                    <span className="t-caption font-semibold text-ink">
                      Location
                    </span>
                    <select
                      className="rounded-xl border border-surface-3 bg-white px-s3 py-s3 t-body-md text-ink shadow-sm"
                      value={selectedLocationId ?? ''}
                      onChange={(e) =>
                        setSelectedLocationId(e.target.value || null)
                      }
                    >
                      {catalog.locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <div className="mt-s6 grid gap-s4 sm:grid-cols-2">
                  {!catalog?.services.length ? (
                    <p className="t-body-md text-ink-soft sm:col-span-2">
                      No bookable services yet. Add active, public-visible
                      services with assigned staff in admin.
                    </p>
                  ) : (
                    catalog.services.map((svc) => {
                      const selected = selectedServiceId === svc.id;
                      // R2 §11.3 — staff_only services render as contact-only
                      // cards. The Select button is disabled and there is no
                      // policy-bypassing affordance.
                      const staffOnly = svc.bookingPolicy === 'staff_only';
                      const requestApproval =
                        svc.bookingPolicy === 'request_approval';
                      return (
                        <article
                          key={svc.id}
                          className="overflow-hidden rounded-2xl border border-surface-3 bg-surface"
                        >
                          <div className="h-28 bg-gradient-to-br from-accent-pale to-white" />
                          <div className="p-s4">
                            <div className="flex items-baseline justify-between gap-s2">
                              <strong className="t-body-lg text-ink">
                                {svc.name}
                              </strong>
                              {staffOnly ? (
                                <Badge tone="neutral">Contact us</Badge>
                              ) : requestApproval ? (
                                <Badge tone="accent">Request approval</Badge>
                              ) : null}
                            </div>
                            <p className="mt-s2 t-body-sm text-ink-soft">
                              {svc.durationMinutes} min · from{' '}
                              {formatUsd(svc.basePriceCents)}
                              {svc.descriptionShort
                                ? ` · ${svc.descriptionShort}`
                                : ''}
                            </p>
                            <Button
                              variant={selected ? 'accent' : 'ghost'}
                              size="md"
                              className={cn(
                                'mt-s4 w-full',
                                !selected &&
                                  'border border-surface-3 bg-white shadow-sm',
                              )}
                              type="button"
                              disabled={staffOnly}
                              onClick={
                                staffOnly
                                  ? undefined
                                  : () => setSelectedServiceId(svc.id)
                              }
                            >
                              {staffOnly
                                ? 'Contact us to book'
                                : selected
                                  ? 'Selected'
                                  : 'Select'}
                            </Button>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>

                <label className="mt-s8 flex max-w-md flex-col gap-s2">
                  <span className="t-caption font-semibold text-ink">
                    Provider
                  </span>
                  <select
                    className="rounded-xl border border-surface-3 bg-white px-s3 py-s3 t-body-md text-ink shadow-sm"
                    disabled={!staffChoices.length}
                    value={selectedStaffId ?? ''}
                    onChange={(e) =>
                      setSelectedStaffId(e.target.value || null)
                    }
                  >
                    {!staffChoices.length ? (
                      <option value="">Choose a service first</option>
                    ) : (
                      staffChoices.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <h3 className="mt-s8 t-display-sm text-ink">Pick a time</h3>
                <p className="mt-s2 t-body-sm text-ink-soft">
                  Times for{' '}
                  <strong className="text-ink">{formatDateLong(date)}</strong>
                  {loadingSlots ? ' · Loading…' : null}
                </p>
                {slotsError ? (
                  <p className="mt-s2 t-body-sm text-red-700">{slotsError}</p>
                ) : null}
                <div className="mt-s4 grid grid-cols-2 gap-s2 sm:grid-cols-3">
                  {slots.map((slot) => {
                    const active = selectedSlotStart === slot.startAt;
                    return (
                      <button
                        key={slot.startAt}
                        type="button"
                        className={
                          active
                            ? 'rounded-xl border-2 border-accent bg-accent-pale py-s3 t-body-sm font-semibold text-accent'
                            : 'rounded-xl border border-surface-3 bg-white py-s3 t-body-sm font-semibold text-ink shadow-sm'
                        }
                        disabled={acquiringHold && !active}
                        onClick={() => void handlePickSlot(slot.startAt)}
                      >
                        {formatSlotLabel(slot.startAt)}
                      </button>
                    );
                  })}
                </div>
                {activeHold ? (
                  <div className="mt-s4">
                    <SlotHoldTimer
                      expiresAt={activeHold.expiresAt}
                      onExpire={handleHoldExpired}
                    />
                  </div>
                ) : null}
                {holdMessage ? (
                  <p
                    className="mt-s3 rounded-xl border border-amber-200 bg-amber-50 px-s3 py-s3 t-body-sm text-ink"
                    role="alert"
                  >
                    {holdMessage}
                  </p>
                ) : null}
                {!loadingSlots && slots.length === 0 && tenantSlug && catalog ? (
                  <div className="mt-s3 flex flex-col gap-s3 rounded-2xl border border-surface-3 bg-surface px-s4 py-s4">
                    <p className="t-body-sm text-ink-soft">
                      No open slots this day — try another date or provider.
                    </p>
                    {selectedServiceId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        className="self-start border border-surface-3 bg-white shadow-sm"
                        onClick={() => setWaitlistOpen(true)}
                      >
                        Join the waitlist
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                <h3 className="mt-s8 t-display-sm text-ink">Notes</h3>
                <p className="mt-s2 t-body-sm text-ink-soft">
                  Optional message for your provider.
                </p>
                <textarea
                  className="mt-s4 w-full rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink shadow-sm"
                  rows={3}
                  value={guestNote}
                  onChange={(e) => setGuestNote(e.target.value)}
                  placeholder="Allergies, parking, preference for a quiet room…"
                />
              </div>

              <aside className="sticky top-20 rounded-2xl border border-surface-3 bg-white p-s5 shadow-sm lg:top-24">
                <h2 className="t-display-md text-ink">Confirm booking</h2>
                <p className="mt-s2 t-body-md text-ink-soft">
                  Card on file / Stripe SetupIntent — deferred (Epic 4 full spec).
                </p>
                <label className="mt-s5 flex flex-col gap-s2">
                  <span className="t-caption font-semibold text-ink">
                    First name
                  </span>
                  <input
                    className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink shadow-sm"
                    value={guestFirst}
                    onChange={(e) => setGuestFirst(e.target.value)}
                    autoComplete="given-name"
                  />
                </label>
                <label className="mt-s4 flex flex-col gap-s2">
                  <span className="t-caption font-semibold text-ink">
                    Last name
                  </span>
                  <input
                    className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink shadow-sm"
                    value={guestLast}
                    onChange={(e) => setGuestLast(e.target.value)}
                    autoComplete="family-name"
                  />
                </label>
                <div className="mt-s4 grid gap-s4 sm:grid-cols-1">
                  <label className="flex flex-col gap-s2">
                    <span className="t-caption font-semibold text-ink">
                      Email
                    </span>
                    <input
                      className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink shadow-sm"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      autoComplete="email"
                      inputMode="email"
                    />
                  </label>
                  <label className="flex flex-col gap-s2">
                    <span className="t-caption font-semibold text-ink">
                      Phone
                    </span>
                    <input
                      className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink shadow-sm"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      autoComplete="tel"
                    />
                  </label>
                </div>

                <div className="mt-s5 space-y-0 rounded-2xl border border-surface-3 bg-surface px-s4 py-s3">
                  <div className="flex justify-between gap-s3 border-b border-surface-3 py-s2 t-body-sm">
                    <span className="text-ink-soft">Service</span>
                    <strong>{summaryServiceName}</strong>
                  </div>
                  <div className="flex justify-between gap-s3 border-b border-surface-3 py-s2 t-body-sm">
                    <span className="text-ink-soft">Provider</span>
                    <strong>{summaryStaffName}</strong>
                  </div>
                  <div className="flex justify-between gap-s3 py-s2 t-body-sm">
                    <span className="text-ink-soft">When</span>
                    <strong>{summaryWhen}</strong>
                  </div>
                </div>

                {bookingMessage ? (
                  <p
                    className="mt-s4 rounded-xl border border-red-200 bg-red-50 px-s3 py-s3 t-body-sm text-red-900"
                    role="alert"
                  >
                    {bookingMessage}
                  </p>
                ) : null}

                {requiredFormsBlock && requiredFormsBlock.length > 0 ? (
                  <div
                    className="mt-s4 rounded-xl border border-amber-200 bg-amber-50 px-s3 py-s3"
                    role="alert"
                  >
                    <strong className="t-body-sm font-semibold text-ink">
                      Required forms
                    </strong>
                    <p className="mt-s1 t-body-sm text-ink-soft">
                      Please complete{' '}
                      {requiredFormsBlock.length === 1
                        ? 'this form'
                        : 'these forms'}{' '}
                      before booking:
                    </p>
                    <ul className="mt-s2 list-disc pl-s4 t-body-sm text-ink">
                      {requiredFormsBlock.map((f) => (
                        <li key={f.formDefinitionGroupId}>
                          <span className="font-medium">{f.formTitle}</span>{' '}
                          <span className="text-ink-soft">
                            ({f.formType})
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-s2 t-caption text-ink-soft">
                      Contact the studio for a form link, or check your email
                      for previous form messages.
                    </p>
                  </div>
                ) : null}

                {isRequestApproval ? (
                  <p
                    className="mt-s4 rounded-xl border border-amber-200 bg-amber-50 px-s3 py-s3 t-body-sm text-ink"
                    role="status"
                  >
                    This service requires staff approval. You will receive an
                    email when your request is confirmed or declined.
                  </p>
                ) : null}

                <Button
                  variant="accent"
                  size="md"
                  className="mt-s5 w-full"
                  type="button"
                  disabled={pendingBook || !tenantSlug}
                  onClick={() => onSubmitBooking()}
                >
                  {pendingBook
                    ? isRequestApproval
                      ? 'Sending request…'
                      : 'Booking…'
                    : isRequestApproval
                      ? 'Request appointment'
                      : 'Book appointment'}
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
            History from your client account arrives with magic-link login —{' '}
            <strong className="text-ink">TODO</strong>.
          </p>
        </section>
      </main>

      <WaitlistSignupSheet
        open={waitlistOpen}
        onClose={() => setWaitlistOpen(false)}
        tenantSlug={tenantSlug}
        locationId={selectedLocationId}
        serviceId={selectedServiceId}
        serviceName={summaryServiceName}
        staffId={selectedStaffId}
        staffName={summaryStaffName}
        defaultPreferredDate={dateParam}
      />
    </div>
  );
}
