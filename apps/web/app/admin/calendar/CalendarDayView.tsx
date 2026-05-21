'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Alert, Button, Card } from '@/components/ui';
import type { Appointment, BookingAnswer } from '@/lib/api/appointments';
import type { ClientWithTags } from '@/lib/api/clients';
import type { ClientNoteSummary } from '@/lib/api/client-notes';
import type { StaffScheduleBlock } from '@/lib/api/staff-schedule-blocks';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';
import type { WhoamiLocation } from '@/lib/api/whoami';
import {
  addDays,
  formatDateLong,
  formatDateShort,
  toDateParam,
} from '@/lib/calendar';
import {
  buildCalendarUrl,
  shiftAnchorDate,
  type CalendarViewMode,
  weekDayDates,
} from '@/lib/calendar-view';

import { AdminCalendarInsights } from './AdminCalendarInsights';
import { AppointmentDrawer } from './AppointmentDrawer';
import { BlockTimeSheet } from './BlockTimeSheet';
import { deleteStaffScheduleBlockAction } from './_actions';
import { selectNextUpAppointmentId } from './calendar-selection';
import { CalendarGrid } from './CalendarGrid';
import { CalendarMonthView } from './CalendarMonthView';
import { CalendarToolbar } from './CalendarToolbar';
import { CalendarWeekView } from './CalendarWeekView';
import { QuickBookPanel } from './QuickBookPanel';

const ADMIN_CAL = '/admin/calendar';

interface CalendarDayViewProps {
  date: Date;
  dateParam: string;
  view: CalendarViewMode;
  staff: Staff[];
  services: Service[];
  appointments: Appointment[];
  /** Staff id → blocks overlapping the appointment fetch window (day grid filters locally). */
  scheduleBlocksByStaff: Record<string, StaffScheduleBlock[]>;
  clientDisplayNames?: Record<string, string>;
  locations: WhoamiLocation[];
  selected: {
    appointment: Appointment;
    client: ClientWithTags;
    notes: ClientNoteSummary[];
    bookingAnswers: BookingAnswer[];
  } | null;
  selectedError: string | null;
  activeTab: string;
  quickBookOpen: boolean;
  blockTimeOpen: boolean;
  /** 30-min density bins (count of appointments overlapping each bin). */
  densityBins: { hour: number; count: number }[];
}

export function CalendarDayView({
  date,
  dateParam,
  view,
  staff,
  services,
  appointments,
  scheduleBlocksByStaff,
  clientDisplayNames,
  locations,
  selected,
  selectedError,
  activeTab,
  quickBookOpen,
  blockTimeOpen,
  densityBins,
}: CalendarDayViewProps) {
  const router = useRouter();
  const qb = quickBookOpen ? '1' : undefined;
  const bt = blockTimeOpen ? '1' : undefined;

  const hrefSelected = useCallback(
    (appointmentId: string, tab?: string) => {
      return buildCalendarUrl(ADMIN_CAL, {
        date: dateParam,
        view,
        selected: appointmentId,
        tab: tab && tab !== 'overview' ? tab : undefined,
        quickbook: qb,
        blocktime: bt,
      });
    },
    [dateParam, view, qb, bt],
  );

  const hrefCloseDrawer = useCallback((): string => {
    return buildCalendarUrl(ADMIN_CAL, {
      date: dateParam,
      view,
      quickbook: qb,
      blocktime: bt,
    });
  }, [dateParam, view, qb, bt]);

  const hrefQuickBook = useMemo(
    () =>
      buildCalendarUrl(ADMIN_CAL, {
        date: dateParam,
        view,
        quickbook: '1',
        blocktime: bt,
      }),
    [dateParam, view, bt],
  );

  const hrefCloseQuickBook = useMemo(
    () =>
      buildCalendarUrl(ADMIN_CAL, {
        date: dateParam,
        view,
        blocktime: bt,
      }),
    [dateParam, view, bt],
  );

  const hrefOpenBlockTime = useMemo(
    () =>
      buildCalendarUrl(ADMIN_CAL, {
        date: dateParam,
        view,
        quickbook: qb,
        blocktime: '1',
      }),
    [dateParam, view, qb],
  );

  const hrefCloseBlockTime = useMemo(
    () =>
      buildCalendarUrl(ADMIN_CAL, {
        date: dateParam,
        view,
        quickbook: qb,
      }),
    [dateParam, view, qb],
  );

  const visibleDayAppointments = useMemo(() => {
    return appointments.filter((a) => {
      const start = new Date(a.scheduledStartAt);
      return (
        start.getFullYear() === date.getFullYear() &&
        start.getMonth() === date.getMonth() &&
        start.getDate() === date.getDate()
      );
    });
  }, [appointments, date]);

  const nextAppointmentId = useMemo(
    () =>
      view === 'day'
        ? selectNextUpAppointmentId(visibleDayAppointments)
        : null,
    [view, visibleDayAppointments],
  );

  const insightAppointments =
    view === 'day' ? visibleDayAppointments : appointments;

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
    return buildCalendarUrl(ADMIN_CAL, {
      date: toDateParam(d),
      view,
      quickbook: qb,
      blocktime: bt,
    });
  }, [date, view, qb, bt]);

  const nextNav = useMemo(() => {
    const d = shiftAnchorDate(date, view, 'next');
    return buildCalendarUrl(ADMIN_CAL, {
      date: toDateParam(d),
      view,
      quickbook: qb,
      blocktime: bt,
    });
  }, [date, view, qb, bt]);

  const jumpTodayNav = useMemo(() => {
    const t = toDateParam(new Date());
    return buildCalendarUrl(ADMIN_CAL, {
      date: t,
      view,
      quickbook: qb,
      blocktime: bt,
    });
  }, [view, qb, bt]);

  const dayJumpPrev = useMemo(
    () =>
      buildCalendarUrl(ADMIN_CAL, {
        date: toDateParam(addDays(date, -1)),
        view: 'day',
        quickbook: qb,
        blocktime: bt,
      }),
    [date, qb, bt],
  );
  const dayJumpNext = useMemo(
    () =>
      buildCalendarUrl(ADMIN_CAL, {
        date: toDateParam(addDays(date, +1)),
        view: 'day',
        quickbook: qb,
        blocktime: bt,
      }),
    [date, qb, bt],
  );

  const drawerOpen = Boolean(selected);
  const handleCloseDrawer = useCallback(() => {
    router.push(hrefCloseDrawer() as Route);
  }, [router, hrefCloseDrawer]);
  const handleCloseQuickBook = useCallback(() => {
    router.push(hrefCloseQuickBook as Route);
  }, [router, hrefCloseQuickBook]);

  const [, startDeleteBlock] = useTransition();
  const handleDeleteBlock = useCallback(
    (blockId: string) => {
      startDeleteBlock(async () => {
        await deleteStaffScheduleBlockAction(blockId);
        router.refresh();
      });
    },
    [router],
  );

  const sidePanelsOpen = quickBookOpen || blockTimeOpen;

  const mainCol = (
    <div className="flex min-w-0 flex-col gap-s5">
      <CalendarToolbar
        date={date}
        view={view}
        dateParam={dateParam}
        periodTitle={periodTitle}
        prevNav={prevNav}
        nextNav={nextNav}
        jumpTodayNav={jumpTodayNav}
        dayJumpPrev={dayJumpPrev}
        dayJumpNext={dayJumpNext}
        hrefQuickBook={hrefQuickBook}
        quickBookOpen={quickBookOpen}
        hrefOpenBlockTime={hrefOpenBlockTime}
        hrefCloseBlockTime={hrefCloseBlockTime}
        blockTimeOpen={blockTimeOpen}
      />

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
      ) : view === 'day' ? (
        <CalendarGrid
          date={date}
          staff={staff}
          serviceById={serviceById}
          appointments={visibleDayAppointments}
          scheduleBlocksByStaff={scheduleBlocksByStaff}
          hrefSelected={hrefSelected}
          selectedAppointmentId={selected?.appointment.id ?? null}
          clientDisplayNames={clientDisplayNames}
          hrefQuickBook={hrefQuickBook}
          nextAppointmentId={nextAppointmentId}
          onDeleteScheduleBlock={handleDeleteBlock}
          densityBins={densityBins}
        />
      ) : view === 'week' ? (
        <CalendarWeekView
          weekDays={weekDays}
          appointments={appointments}
          staffById={staffById}
          serviceById={serviceById}
          clientDisplayNames={clientDisplayNames}
          hrefSelected={hrefSelected}
          mode="admin"
          scheduleBlocksByStaff={scheduleBlocksByStaff}
          onDeleteScheduleBlock={handleDeleteBlock}
        />
      ) : (
        <CalendarMonthView
          anchorMonth={date}
          appointments={appointments}
          basePath={ADMIN_CAL}
          preserveParams={
            qb || bt
              ? {
                  ...(qb ? { quickbook: qb } : {}),
                  ...(bt ? { blocktime: bt } : {}),
                }
              : undefined
          }
          scheduleBlocksByStaff={scheduleBlocksByStaff}
        />
      )}

      {view === 'day' &&
        visibleDayAppointments.length === 0 &&
        staff.length > 0 && (
          <Card padding="md">
            <p className="t-body-md text-ink-soft">
              No appointments on this day yet. Bookings from Quick Book and the
              public portal appear here once scheduled.
            </p>
            <div className="mt-s3">
              <Link href={hrefQuickBook as Route} className="no-underline">
                <Button variant="accent" size="sm">
                  Open Quick Book
                </Button>
              </Link>
            </div>
          </Card>
        )}

      <div id="calendar-insights" className="scroll-mt-s8 pt-s2">
        <span className="t-eyebrow text-accent">Overview</span>
        <h2 className="sr-only">Calendar insights</h2>
        <AdminCalendarInsights appointments={insightAppointments} />
      </div>
    </div>
  );

  return (
    <div
      className={
        sidePanelsOpen
          ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start'
          : 'flex flex-col gap-s5'
      }
    >
      {mainCol}

      {sidePanelsOpen && (
        <div className="flex flex-col gap-s5 lg:max-w-[360px]">
          {quickBookOpen && (
            <QuickBookPanel
              staff={staff}
              services={services}
              locations={locations}
              dateParam={dateParam}
              onClose={handleCloseQuickBook}
              variant="admin"
            />
          )}
          {blockTimeOpen && (
            <BlockTimeSheet
              staff={staff}
              locations={locations}
              dateParam={dateParam}
              hrefClose={hrefCloseBlockTime}
            />
          )}
        </div>
      )}

      {drawerOpen && selected && (
        <AppointmentDrawer
          appointment={selected.appointment}
          client={selected.client}
          notes={selected.notes}
          bookingAnswers={selected.bookingAnswers}
          staff={staffById.get(selected.appointment.staffId) ?? null}
          service={serviceById.get(selected.appointment.serviceId) ?? null}
          activeTab={activeTab}
          dateParam={dateParam}
          onClose={handleCloseDrawer}
          view={view}
          quickbook={qb}
        />
      )}
    </div>
  );
}
