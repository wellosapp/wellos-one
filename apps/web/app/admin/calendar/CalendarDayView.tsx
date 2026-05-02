'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { Alert, Badge, Button, Card } from '@/components/ui';
import type { Appointment, BookingAnswer } from '@/lib/api/appointments';
import type { ClientWithTags } from '@/lib/api/clients';
import type { ClientNoteSummary } from '@/lib/api/client-notes';
import type { AppointmentMediaResponse } from '@/lib/api/media';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';
import type { WhoamiLocation } from '@/lib/api/whoami';
import {
  addDays,
  formatDateLong,
  formatDateShort,
  isToday,
  toDateParam,
} from '@/lib/calendar';

import { AppointmentDrawer } from './AppointmentDrawer';
import { CalendarGrid } from './CalendarGrid';
import { QuickBookPanel } from './QuickBookPanel';

interface CalendarDayViewProps {
  date: Date;
  dateParam: string;
  staff: Staff[];
  services: Service[];
  appointments: Appointment[];
  locations: WhoamiLocation[];
  selected: {
    appointment: Appointment;
    client: ClientWithTags;
    notes: ClientNoteSummary[];
    bookingAnswers: BookingAnswer[];
    media: AppointmentMediaResponse;
  } | null;
  selectedError: string | null;
  activeTab: string;
  quickBookOpen: boolean;
}

export function CalendarDayView({
  date,
  dateParam,
  staff,
  services,
  appointments,
  locations,
  selected,
  selectedError,
  activeTab,
  quickBookOpen,
}: CalendarDayViewProps) {
  const router = useRouter();

  // Build hrefs that preserve unrelated params. We're a single-tab page so
  // the only state worth preserving is `date` itself; selected / tab /
  // quickbook are all drawer/panel concerns that close together.
  const hrefForDate = useCallback(
    (newDateParam: string): string => {
      const params = new URLSearchParams();
      params.set('date', newDateParam);
      return `/admin/calendar?${params.toString()}`;
    },
    [],
  );

  const hrefSelected = useCallback(
    (appointmentId: string, tab?: string): string => {
      const params = new URLSearchParams();
      params.set('date', dateParam);
      params.set('selected', appointmentId);
      if (tab) params.set('tab', tab);
      return `/admin/calendar?${params.toString()}`;
    },
    [dateParam],
  );

  const hrefCloseDrawer = useCallback((): string => {
    const params = new URLSearchParams();
    params.set('date', dateParam);
    return `/admin/calendar?${params.toString()}`;
  }, [dateParam]);

  const hrefQuickBook = useMemo(() => {
    const params = new URLSearchParams();
    params.set('date', dateParam);
    params.set('quickbook', '1');
    return `/admin/calendar?${params.toString()}`;
  }, [dateParam]);

  const hrefCloseQuickBook = useMemo(() => {
    const params = new URLSearchParams();
    params.set('date', dateParam);
    return `/admin/calendar?${params.toString()}`;
  }, [dateParam]);

  // Filter appointments to those falling on the requested calendar day in
  // BROWSER-local TZ (the date param is the operator's intent). Cancelled
  // visits still render but get a dimmed treatment in the block.
  const visibleAppointments = useMemo(() => {
    return appointments.filter((a) => {
      const start = new Date(a.scheduledStartAt);
      return (
        start.getFullYear() === date.getFullYear() &&
        start.getMonth() === date.getMonth() &&
        start.getDate() === date.getDate()
      );
    });
  }, [appointments, date]);

  // Map staffId → display name once for the grid columns + drawer.
  const staffById = useMemo(() => {
    const m = new Map<string, Staff>();
    for (const s of staff) m.set(s.id, s);
    return m;
  }, [staff]);
  const serviceById = useMemo(() => {
    const m = new Map<string, Service>();
    for (const s of services) m.set(s.id, s);
    return m;
  }, [services]);

  const drawerOpen = Boolean(selected);
  const handleCloseDrawer = useCallback(() => {
    router.push(hrefCloseDrawer() as Route);
  }, [router, hrefCloseDrawer]);
  const handleCloseQuickBook = useCallback(() => {
    router.push(hrefCloseQuickBook as Route);
  }, [router, hrefCloseQuickBook]);

  const prevHref = hrefForDate(toDateParam(addDays(date, -1)));
  const nextHref = hrefForDate(toDateParam(addDays(date, +1)));
  const todayHref = hrefForDate(toDateParam(new Date()));

  return (
    <div className="flex flex-col gap-s4">
      <header className="flex flex-wrap items-center justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Calendar</span>
          <h1 className="t-display-lg flex items-baseline gap-s3">
            {formatDateLong(date)}
            {isToday(date) && (
              <Badge tone="accent" className="self-center">
                Today
              </Badge>
            )}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-s3">
          {/* Day / Week toggle. Week is placeholder per spec L1131. */}
          <div
            role="tablist"
            aria-label="View"
            className="inline-flex rounded-md border border-surface-3 bg-white p-[2px]"
          >
            <button
              role="tab"
              aria-selected="true"
              className="rounded-sm bg-accent px-s3 py-[6px] t-body-sm font-medium text-white"
              type="button"
            >
              Day
            </button>
            <button
              role="tab"
              aria-selected="false"
              aria-disabled="true"
              disabled
              className="rounded-sm px-s3 py-[6px] t-body-sm font-medium text-ink-soft/60 cursor-not-allowed"
              type="button"
              title="Week view coming soon"
            >
              Week
            </button>
          </div>

          {/* All-staff filter is fixed for now; placeholder UI hints at the
              filter expansion that lands with the role-aware staff variant. */}
          <span className="rounded-md border border-surface-3 bg-white px-s3 py-[7px] t-body-sm text-ink-soft">
            All staff
          </span>

          <Link href={hrefQuickBook as Route} className="no-underline">
            <Button variant="accent" size="md">
              + Quick Book
            </Button>
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-s2">
        <Link href={prevHref as Route} className="no-underline">
          <Button variant="ghost" size="sm">
            ← {formatDateShort(addDays(date, -1))}
          </Button>
        </Link>
        <Link href={todayHref as Route} className="no-underline">
          <Button variant="ghost" size="sm">
            Today
          </Button>
        </Link>
        <Link href={nextHref as Route} className="no-underline">
          <Button variant="ghost" size="sm">
            {formatDateShort(addDays(date, +1))} →
          </Button>
        </Link>
      </div>

      {selectedError && <Alert tone="error">{selectedError}</Alert>}

      {staff.length === 0 ? (
        <Card padding="lg">
          <p className="t-body-md text-ink-soft">
            No active staff yet. Add a staff member to start booking
            appointments.
          </p>
          <div className="mt-s3">
            <Link href="/admin/staff/new" className="no-underline">
              <Button variant="primary" size="sm">
                Add staff
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <CalendarGrid
          date={date}
          staff={staff}
          serviceById={serviceById}
          appointments={visibleAppointments}
          hrefSelected={hrefSelected}
          selectedAppointmentId={selected?.appointment.id ?? null}
        />
      )}

      {drawerOpen && selected && (
        <AppointmentDrawer
          appointment={selected.appointment}
          client={selected.client}
          notes={selected.notes}
          bookingAnswers={selected.bookingAnswers}
          media={selected.media}
          staff={staffById.get(selected.appointment.staffId) ?? null}
          service={serviceById.get(selected.appointment.serviceId) ?? null}
          activeTab={activeTab}
          dateParam={dateParam}
          onClose={handleCloseDrawer}
        />
      )}

      {quickBookOpen && (
        <QuickBookPanel
          staff={staff}
          services={services}
          locations={locations}
          dateParam={dateParam}
          onClose={handleCloseQuickBook}
        />
      )}
    </div>
  );
}
