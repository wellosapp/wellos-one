'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { deleteStaffScheduleBlockAction } from '@/app/admin/calendar/_actions';
import { AppointmentDrawer } from '@/app/admin/calendar/AppointmentDrawer';
import { CalendarGrid } from '@/app/admin/calendar/CalendarGrid';
import { CalendarMonthView } from '@/app/admin/calendar/CalendarMonthView';
import { CalendarViewToggle } from '@/app/admin/calendar/CalendarViewToggle';
import { CalendarWeekView } from '@/app/admin/calendar/CalendarWeekView';
import { QuickBookPanel } from '@/app/admin/calendar/QuickBookPanel';
import { Alert, Badge, Button, Card } from '@/components/ui';
import type { Appointment, BookingAnswer } from '@/lib/api/appointments';
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
  formatTimeLocal,
  gapsBetweenAppointments,
  isToday,
  toDateParam,
} from '@/lib/calendar';
import {
  buildCalendarUrl,
  shiftAnchorDate,
  type CalendarViewMode,
  weekDayDates,
} from '@/lib/calendar-view';

import { StaffScheduleInsights } from './StaffScheduleInsights';

const STAFF_SCHED = '/staff/schedule';

interface StaffScheduleViewProps {
  date: Date;
  dateParam: string;
  view: CalendarViewMode;
  me: Staff;
  services: Service[];
  appointments: Appointment[];
  scheduleBlocksByStaff: Record<string, StaffScheduleBlock[]>;
  /**
   * Phase 4 of the Classes epic — scheduled class instances the staff
   * member is teaching in the visible window. Listed above the calendar
   * with click-through to /staff/classes/[instanceId]. Full chip render
   * inside the day/week/month views is a follow-up.
   */
  classInstances: ClassInstanceWithRelations[];
  clientDisplayNames: Record<string, string>;
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
}

function initials(staff: Staff): string {
  const a = staff.firstName?.[0] ?? '';
  const b = staff.lastName?.[0] ?? '';
  return (a + b).toUpperCase() || '?';
}

export function StaffScheduleView({
  date,
  dateParam,
  view,
  me,
  services,
  appointments,
  scheduleBlocksByStaff,
  classInstances,
  clientDisplayNames,
  locations,
  selected,
  selectedError,
  activeTab,
  quickBookOpen,
}: StaffScheduleViewProps) {
  const router = useRouter();
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
  const qb = quickBookOpen ? '1' : undefined;

  const hrefSelected = useCallback(
    (appointmentId: string, tab?: string) => {
      return buildCalendarUrl(STAFF_SCHED, {
        date: dateParam,
        view,
        selected: appointmentId,
        tab: tab && tab !== 'overview' ? tab : undefined,
        quickbook: qb,
      });
    },
    [dateParam, view, qb],
  );

  const hrefCloseDrawer = useCallback(
    () =>
      buildCalendarUrl(STAFF_SCHED, { date: dateParam, view, quickbook: qb }),
    [dateParam, view, qb],
  );

  const hrefQuickBook = useMemo(
    () =>
      buildCalendarUrl(STAFF_SCHED, {
        date: dateParam,
        view,
        quickbook: '1',
      }),
    [dateParam, view],
  );

  const hrefCloseQuickBook = useMemo(
    () => buildCalendarUrl(STAFF_SCHED, { date: dateParam, view }),
    [dateParam, view],
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

  const myDayAppointments = useMemo(
    () => visibleDayAppointments.filter((a) => a.staffId === me.id),
    [visibleDayAppointments, me.id],
  );

  const gapCount = useMemo(
    () => gapsBetweenAppointments(myDayAppointments).length,
    [myDayAppointments],
  );

  const nextAppointmentId = useMemo(() => {
    if (view !== 'day') return null;
    const nowMs = Date.now();
    const upcoming = [...myDayAppointments]
      .filter((a) => new Date(a.scheduledStartAt).getTime() > nowMs)
      .sort(
        (a, b) =>
          new Date(a.scheduledStartAt).getTime() -
          new Date(b.scheduledStartAt).getTime(),
      );
    return upcoming[0]?.id ?? null;
  }, [myDayAppointments, view]);

  const nextStart = useMemo(() => {
    const id = nextAppointmentId;
    if (!id) return null;
    const appt = myDayAppointments.find((a) => a.id === id);
    return appt ? appt.scheduledStartAt : null;
  }, [nextAppointmentId, myDayAppointments]);

  const nextClientLabel = useMemo(() => {
    if (!nextAppointmentId) return undefined;
    const appt = myDayAppointments.find((a) => a.id === nextAppointmentId);
    if (!appt) return undefined;
    const name = clientDisplayNames[appt.clientId];
    return name
      ? `${name} · ${formatTimeLocal(appt.scheduledStartAt)}`
      : formatTimeLocal(appt.scheduledStartAt);
  }, [nextAppointmentId, myDayAppointments, clientDisplayNames]);

  const serviceById = useMemo(() => {
    const m = new Map<string, Service>();
    for (const s of services) m.set(s.id, s);
    return m;
  }, [services]);

  const staffById = useMemo(() => new Map([[me.id, me]]), [me]);

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
    return buildCalendarUrl(STAFF_SCHED, {
      date: toDateParam(d),
      view,
      quickbook: qb,
    });
  }, [date, view, qb]);

  const nextNav = useMemo(() => {
    const d = shiftAnchorDate(date, view, 'next');
    return buildCalendarUrl(STAFF_SCHED, {
      date: toDateParam(d),
      view,
      quickbook: qb,
    });
  }, [date, view, qb]);

  const jumpTodayNav = useMemo(() => {
    const t = toDateParam(new Date());
    return buildCalendarUrl(STAFF_SCHED, { date: t, view, quickbook: qb });
  }, [view, qb]);

  const dayJumpPrev = useMemo(
    () =>
      buildCalendarUrl(STAFF_SCHED, {
        date: toDateParam(addDays(date, -1)),
        view: 'day',
        quickbook: qb,
      }),
    [date, qb],
  );
  const dayJumpNext = useMemo(
    () =>
      buildCalendarUrl(STAFF_SCHED, {
        date: toDateParam(addDays(date, +1)),
        view: 'day',
        quickbook: qb,
      }),
    [date, qb],
  );

  const drawerOpen = Boolean(selected);
  const handleCloseDrawer = useCallback(() => {
    router.push(hrefCloseDrawer() as Route);
  }, [router, hrefCloseDrawer]);
  const handleCloseQuickBook = useCallback(() => {
    router.push(hrefCloseQuickBook as Route);
  }, [router, hrefCloseQuickBook]);

  const bannerLine = useMemo(() => {
    if (view === 'day') {
      return [
        `${myDayAppointments.length} appointment${myDayAppointments.length === 1 ? '' : 's'}`,
        `${gapCount} open gap${gapCount === 1 ? '' : 's'}`,
        nextStart
          ? `next up at ${formatTimeLocal(nextStart)}`
          : 'no more visits today',
      ].join(' · ');
    }
    if (view === 'week') {
      return `${appointments.length} visit${appointments.length === 1 ? '' : 's'} this week`;
    }
    return `${appointments.length} visit${appointments.length === 1 ? '' : 's'} this month`;
  }, [
    view,
    myDayAppointments.length,
    gapCount,
    nextStart,
    appointments.length,
  ]);

  const mainCol = (
    <div className="flex min-w-0 flex-col gap-s5">
      <header className="flex flex-col gap-s4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">My schedule</span>
          <h1 className="t-display-lg flex flex-wrap items-baseline gap-s3">
            {periodTitle}
            {view === 'day' && isToday(date) && (
              <Badge tone="accent" className="self-center">
                Today
              </Badge>
            )}
          </h1>
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
                {view === 'day' && <>{formatDateShort(addDays(date, +1))} →</>}
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

        <div className="flex flex-wrap items-center gap-s3">
          <CalendarViewToggle
            surface="staff"
            dateParam={dateParam}
            active={view}
            quickBookOpen={quickBookOpen}
          />
          <Link href={hrefQuickBook as Route} className="no-underline">
            <Button variant="accent" size="md">
              + Quick Book
            </Button>
          </Link>
        </div>
      </header>

      {selectedError && <Alert tone="error">{selectedError}</Alert>}

      <div className="flex flex-wrap items-center gap-s4 rounded-xl border border-surface-3 bg-surface px-s4 py-s4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-pale t-body-md font-bold text-accent">
          {initials(me)}
        </div>
        <div>
          <strong className="t-body-lg text-ink">
            {me.firstName}
            {me.lastName ? ` ${me.lastName}` : ''}
          </strong>
          <span className="mt-s1 block t-caption text-ink-soft">{bannerLine}</span>
        </div>
      </div>

      <StaffClassInstancesList classInstances={classInstances} />

      {view === 'day' ? (
        <CalendarGrid
          date={date}
          staff={[me]}
          serviceById={serviceById}
          appointments={myDayAppointments}
          scheduleBlocksByStaff={scheduleBlocksByStaff}
          hrefSelected={hrefSelected}
          selectedAppointmentId={selected?.appointment.id ?? null}
          clientDisplayNames={clientDisplayNames}
          hrefQuickBook={hrefQuickBook}
          nextAppointmentId={nextAppointmentId}
          onDeleteScheduleBlock={handleDeleteBlock}
        />
      ) : view === 'week' ? (
        <CalendarWeekView
          weekDays={weekDays}
          appointments={appointments}
          staffById={staffById}
          serviceById={serviceById}
          clientDisplayNames={clientDisplayNames}
          hrefSelected={hrefSelected}
          mode="staff"
          scheduleBlocksByStaff={scheduleBlocksByStaff}
          onDeleteScheduleBlock={handleDeleteBlock}
        />
      ) : (
        <CalendarMonthView
          anchorMonth={date}
          appointments={appointments}
          basePath={STAFF_SCHED}
          preserveParams={qb ? { quickbook: qb } : undefined}
          scheduleBlocksByStaff={scheduleBlocksByStaff}
        />
      )}

      <StaffScheduleInsights nextClientLabel={nextClientLabel} />
    </div>
  );

  return (
    <div
      className={
        quickBookOpen
          ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start'
          : 'flex flex-col gap-s5'
      }
    >
      {mainCol}

      {quickBookOpen && (
        <QuickBookPanel
          staff={[me]}
          services={services}
          locations={locations}
          dateParam={dateParam}
          onClose={handleCloseQuickBook}
          variant="staff"
          lockedStaffId={me.id}
        />
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
          calendarBasePath="/staff/schedule"
          view={view}
          quickbook={qb}
        />
      )}
    </div>
  );
}

// Phase 4 of the Classes epic — list of class instances the staff member is
// teaching in the visible window. Click-through to /staff/classes/[instanceId]
// for check-in. Inline here rather than a separate component file because the
// shape is dead simple; if the surface grows (recurrence indicators,
// per-instance roster snippets), pull this out.
function StaffClassInstancesList({
  classInstances,
}: {
  classInstances: ClassInstanceWithRelations[];
}) {
  if (classInstances.length === 0) return null;
  // Sort by start time so the list reads in time order regardless of API
  // order. The API does return them sorted, but defending against a future
  // re-order is cheap.
  const ordered = [...classInstances].sort(
    (a, b) =>
      new Date(a.scheduledStartAt).getTime() -
      new Date(b.scheduledStartAt).getTime(),
  );
  return (
    <Card padding="md" className="flex flex-col gap-s3">
      <div className="flex items-baseline justify-between">
        <h2 className="t-display-sm">Classes you&apos;re teaching</h2>
        <span className="t-caption text-ink-soft">
          {ordered.length} class{ordered.length === 1 ? '' : 'es'}
        </span>
      </div>
      <ul className="flex flex-col gap-s2">
        {ordered.map((inst) => {
          const start = new Date(inst.scheduledStartAt);
          const startLabel = start.toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
          return (
            <li key={inst.id}>
              <Link
                href={`/staff/classes/${inst.id}` as Route}
                className="flex flex-wrap items-center gap-s3 rounded-md border border-surface-3 bg-surface px-s3 py-s3 no-underline transition-colors duration-fast hover:bg-surface-2"
              >
                <span
                  className="h-8 w-1.5 shrink-0 rounded-sm"
                  style={{
                    backgroundColor:
                      inst.class.color ?? 'var(--color-accent)',
                  }}
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="t-body-md text-ink">{inst.class.name}</span>
                  <span className="t-caption text-ink-soft">
                    {startLabel} · {inst.location.name}
                  </span>
                </div>
                <Badge tone="accent">Check in</Badge>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
