'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Alert, Button, Card } from '@/components/ui';
import type { Appointment, BookingAnswer } from '@/lib/api/appointments';
import type { ListRosterResponse } from '@/lib/api/class-bookings';
import type { ClassInstanceWithRelations } from '@/lib/api/class-instances';
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

import { AppointmentDrawer } from './AppointmentDrawer';
import { BlockTimeSheet } from './BlockTimeSheet';
import { ClassInstanceDrawer } from './ClassInstanceDrawer';
import { deleteStaffScheduleBlockAction } from './_actions';
import { selectNextUpAppointmentId } from './calendar-selection';
import { CalendarDensityWave } from './CalendarDensityWave';
import { CalendarInsightsPanel } from './CalendarInsightsPanel';
import { CalendarLeftRail } from './CalendarLeftRail';
import { CalendarMonthView } from './CalendarMonthView';
import { CalendarRiverGrid, RIVER_LAYOUT } from './CalendarRiverGrid';
import type { StaffLoadRow } from './CalendarStaffLoadStrip';
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
  /** Phase 2a — class instances overlapping the fetch window; filtered to day-local in the grid. */
  classInstances: ClassInstanceWithRelations[];
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
  /** Phase 2a — class instance drawer drilldown (separate from appointment selection). */
  selectedClassInstance: ClassInstanceWithRelations | null;
  /** Phase 3a — bookings + waitlist for the open class-instance drawer. */
  selectedClassInstanceRoster: ListRosterResponse | null;
  selectedClassInstanceError: string | null;
  /**
   * Tenant's bookingCancellationWindowHours (R2 §12 tenant booking settings).
   * Passed to the class-instance drawer's CancelBookingButton so the confirm
   * UI can show "Free cancellation until N hours before class" + matches the
   * late-cancel flag the API records (Phase 3c).
   */
  cancellationWindowHours: number;
  activeTab: string;
  quickBookOpen: boolean;
  blockTimeOpen: boolean;
  pulseOpen: boolean;
  densityBins: { hour: number; count: number }[];
  staffLoad: StaffLoadRow[];
}

export function CalendarDayView({
  date,
  dateParam,
  view,
  staff,
  services,
  appointments,
  classInstances,
  scheduleBlocksByStaff,
  clientDisplayNames,
  locations,
  selected,
  selectedError,
  selectedClassInstance,
  selectedClassInstanceRoster,
  selectedClassInstanceError,
  cancellationWindowHours,
  activeTab,
  quickBookOpen,
  blockTimeOpen,
  pulseOpen,
  densityBins,
  staffLoad,
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

  // Phase 2a — class instance selection lives on its own `?classInstance=`
  // param so it doesn't collide with appointment selection. buildCalendarUrl
  // doesn't know about this param yet — append it manually.
  const hrefSelectedClassInstance = useCallback(
    (instanceId: string): string => {
      const base = buildCalendarUrl(ADMIN_CAL, {
        date: dateParam,
        view,
        quickbook: qb,
        blocktime: bt,
      });
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}classInstance=${encodeURIComponent(instanceId)}`;
    },
    [dateParam, view, qb, bt],
  );

  const hrefCloseClassInstance = useCallback((): string => {
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

  const hrefTogglePulse = useMemo(() => {
    // Toggling ?pulse via buildCalendarUrl — when open, drop the flag.
    const url = buildCalendarUrl(ADMIN_CAL, {
      date: dateParam,
      view,
      quickbook: qb,
      blocktime: bt,
    });
    if (pulseOpen) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}pulse=1`;
  }, [dateParam, view, qb, bt, pulseOpen]);

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

  const visibleDayClassInstances = useMemo(() => {
    return classInstances.filter((c) => {
      const start = new Date(c.scheduledStartAt);
      return (
        start.getFullYear() === date.getFullYear() &&
        start.getMonth() === date.getMonth() &&
        start.getDate() === date.getDate()
      );
    });
  }, [classInstances, date]);

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
  const handleCloseClassInstanceDrawer = useCallback(() => {
    router.push(hrefCloseClassInstance() as Route);
  }, [router, hrefCloseClassInstance]);

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

  const selectedStaffForRail = selected
    ? (staffById.get(selected.appointment.staffId) ?? null)
    : null;
  const selectedServiceForRail = selected
    ? (serviceById.get(selected.appointment.serviceId) ?? null)
    : null;
  const selectedClientName = selected
    ? [selected.client.firstName, selected.client.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || undefined
    : undefined;

  const toolbar = (
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
      hrefTogglePulse={hrefTogglePulse}
      pulseOpen={pulseOpen}
    />
  );

  const emptyStaff = (
    <Card padding="lg">
      <p className="t-body-md text-ink-soft">
        No active staff yet. Add a staff member to start booking appointments.
      </p>
      <div className="mt-s3">
        <Link href="/admin/staff/new" className="no-underline">
          <Button variant="primary" size="sm">
            Add staff
          </Button>
        </Link>
      </div>
    </Card>
  );

  // Day-view centre column: toolbar + insights panel + density wave + river.
  const dayCentre = (
    <div className="flex min-w-0 flex-1 flex-col gap-s5">
      {toolbar}
      {selectedError && <Alert tone="error">{selectedError}</Alert>}
      <CalendarInsightsPanel
        appointments={insightAppointments}
        open={pulseOpen}
      />
      {staff.length === 0 ? (
        emptyStaff
      ) : (
        <>
          <CalendarDensityWave
            bins={densityBins}
            startHour={RIVER_LAYOUT.ANCHOR_HOUR}
            pxPerHour={RIVER_LAYOUT.PX_PER_HOUR}
            nameColumnWidth={RIVER_LAYOUT.NAME_COL_WIDTH}
          />
          <CalendarRiverGrid
            date={date}
            staff={staff}
            serviceById={serviceById}
            appointments={visibleDayAppointments}
            classInstances={visibleDayClassInstances}
            scheduleBlocksByStaff={scheduleBlocksByStaff}
            hrefSelected={hrefSelected}
            selectedAppointmentId={selected?.appointment.id ?? null}
            hrefSelectedClassInstance={hrefSelectedClassInstance}
            selectedClassInstanceId={selectedClassInstance?.id ?? null}
            clientDisplayNames={clientDisplayNames}
            hrefQuickBook={hrefQuickBook}
            nextAppointmentId={nextAppointmentId}
            onDeleteScheduleBlock={handleDeleteBlock}
          />
        </>
      )}

      {visibleDayAppointments.length === 0 && staff.length > 0 && (
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
    </div>
  );

  // Week/Month centre column — unchanged shape; no rail, no density wave.
  const weekOrMonthCentre = (
    <div className="flex min-w-0 flex-col gap-s5">
      {toolbar}
      {selectedError && <Alert tone="error">{selectedError}</Alert>}
      {staff.length === 0 ? (
        emptyStaff
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
    </div>
  );

  const sidePanels = sidePanelsOpen ? (
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
  ) : null;

  const drawer =
    drawerOpen && selected ? (
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
    ) : null;

  const classInstanceDrawer = selectedClassInstance ? (
    <ClassInstanceDrawer
      instance={selectedClassInstance}
      roster={selectedClassInstanceRoster}
      cancellationWindowHours={cancellationWindowHours}
      onClose={handleCloseClassInstanceDrawer}
    />
  ) : null;

  // Surface the class-instance lookup error (e.g. 404 from a stale URL) as a
  // banner in the day view rather than silently dropping the param.
  const classInstanceErrorBanner = selectedClassInstanceError ? (
    <Alert tone="error">{selectedClassInstanceError}</Alert>
  ) : null;

  if (view === 'day') {
    return (
      <div className="flex flex-col gap-s5">
        {classInstanceErrorBanner}
        <div className="flex flex-col gap-s5 lg:flex-row lg:items-start">
          <CalendarLeftRail
            staffLoad={staffLoad}
            selectedAppointment={selected?.appointment}
            selectedClientFirstName={selectedClientName}
            selectedServiceName={selectedServiceForRail?.name}
            selectedStaffFirstName={selectedStaffForRail?.firstName}
          />
          {dayCentre}
          {sidePanels}
        </div>
        {drawer}
        {classInstanceDrawer}
      </div>
    );
  }

  // Week / month layout stays the same — no rail, no density wave.
  return (
    <div
      className={
        sidePanelsOpen
          ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start'
          : 'flex flex-col gap-s5'
      }
    >
      {classInstanceErrorBanner}
      {weekOrMonthCentre}
      {sidePanels}
      {drawer}
      {classInstanceDrawer}
    </div>
  );
}
