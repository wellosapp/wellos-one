import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import {
  getAppointment,
  listAppointments,
  listBookingAnswers,
  type Appointment,
} from '@/lib/api/appointments';
import {
  getClassInstanceRoster,
  type ListRosterResponse,
} from '@/lib/api/class-bookings';
import {
  getClassInstance,
  listClassInstances,
} from '@/lib/api/class-instances';
import { getTenantBookingSettings } from '@/lib/api/booking-settings';
import {
  listStaffScheduleBlocks,
  type StaffScheduleBlock,
} from '@/lib/api/staff-schedule-blocks';
import { listClientNotes } from '@/lib/api/client-notes';
import { getClient } from '@/lib/api/clients';
import { listServices } from '@/lib/api/services';
import { listStaff, type Staff } from '@/lib/api/staff';
import { getWhoami } from '@/lib/api/whoami';
import { parseDateParam, toDateParam } from '@/lib/calendar';
import {
  appointmentFetchBounds,
  appointmentFetchTake,
  parseViewParam,
} from '@/lib/calendar-view';
import { DAY_KEYS } from '@/lib/staff-days';

import { CalendarDayView } from './CalendarDayView';
import type { StaffLoadRow } from './CalendarStaffLoadStrip';

function formatCalendarLoadError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  const msg = err instanceof Error ? err.message : String(err);
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL ?? 'https://api.wellos.one (default)';
  if (
    msg === 'fetch failed' ||
    msg.includes('fetch failed') ||
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(msg)
  ) {
    return (
      `Cannot reach the Wellos API at ${apiBase}. ` +
      'For local dev, start the API (`pnpm --filter @wellos/api dev` on port 3001) and set ' +
      '`NEXT_PUBLIC_API_URL=http://localhost:3001` in `apps/web/.env.local`, then restart Next.js.'
    );
  }
  return msg;
}

// /admin/calendar — staff/admin daily-driver UI (E3-S5 T5).
// Server-rendered: parses ?date / ?selected / ?tab / ?quickbook from the
// URL, fetches the day's appointments + the directory data the client
// components need (staff, services, locations), and the selected
// appointment's drilldown data when the drawer is open. Per
// docs/04-booking UI UX Update/wellos_booking_r2_uiux_package
// /wellos_calendar_booking_r2_uiux_buildout.md §5–§6. Component map:
// ./CALENDAR_UI_MAP.md

type SearchParams = {
  date?: string;
  view?: string;
  selected?: string;
  tab?: string;
  quickbook?: string;
  blocktime?: string;
  pulse?: string;
  /** Phase 2a — class instance chip selection (mirrors `selected` but for instances). */
  classInstance?: string;
};

// River day view runs 7am → 8pm in 30-min bins (26 bins). Density bins count
// non-terminal appointments overlapping each bin, for the SVG wave above the
// grid. Pure helper — does not touch the DB; consumes the appointments list
// the page already fetched.
const DENSITY_ANCHOR_HOUR = 7;
const DENSITY_END_HOUR = 20;
const DENSITY_BIN_MINUTES = 30;

function isOnLocalDay(d: Date, day: Date): boolean {
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}

function computeDensityBins(
  appts: Appointment[],
  day: Date,
): { hour: number; count: number }[] {
  const bins: { hour: number; count: number }[] = [];
  for (
    let h = DENSITY_ANCHOR_HOUR;
    h < DENSITY_END_HOUR;
    h += DENSITY_BIN_MINUTES / 60
  ) {
    bins.push({ hour: h, count: 0 });
  }
  for (const a of appts) {
    if (a.state === 'cancelled' || a.state === 'no_show') continue;
    const start = new Date(a.scheduledStartAt);
    if (!isOnLocalDay(start, day)) continue;
    const end = new Date(a.scheduledEndAt);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end.getHours() * 60 + end.getMinutes();
    for (const b of bins) {
      const binStart = b.hour * 60;
      const binEnd = binStart + DENSITY_BIN_MINUTES;
      if (startMin < binEnd && endMin > binStart) b.count += 1;
    }
  }
  return bins;
}

function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  if (h < 0 || h > 24 || min < 0 || min >= 60) return null;
  return h * 60 + min;
}

function availableMinutesForStaff(s: Staff, day: Date): number {
  const wh = s.workingHours;
  if (!wh) return 0;
  const dayIdx = (day.getDay() + 6) % 7; // mon=0..sun=6
  const key = DAY_KEYS[dayIdx];
  if (!key) return 0;
  const shifts = wh[key] ?? [];
  let total = 0;
  for (const shift of shifts) {
    const s1 = parseHHMM(shift.start);
    const e1 = parseHHMM(shift.end);
    if (s1 === null || e1 === null) continue;
    if (e1 > s1) total += e1 - s1;
  }
  return total;
}

function computeStaffLoad(
  appts: Appointment[],
  staff: Staff[],
  day: Date,
): StaffLoadRow[] {
  const rows: StaffLoadRow[] = [];
  for (const s of staff) {
    let bookedMinutes = 0;
    for (const a of appts) {
      if (a.staffId !== s.id) continue;
      if (a.state === 'cancelled' || a.state === 'no_show') continue;
      const start = new Date(a.scheduledStartAt);
      if (!isOnLocalDay(start, day)) continue;
      const end = new Date(a.scheduledEndAt);
      bookedMinutes += Math.max(0, (end.getTime() - start.getTime()) / 60000);
    }
    const availableMinutes = availableMinutesForStaff(s, day);
    const loadPct =
      availableMinutes > 0
        ? Math.min(100, Math.round((bookedMinutes / availableMinutes) * 100))
        : 0;
    rows.push({
      staffId: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      loadPct,
      bookedMinutes: Math.round(bookedMinutes),
      availableMinutes,
    });
  }
  return rows;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const date = parseDateParam(sp.date);
  const dateStr = toDateParam(date);
  const view = parseViewParam(sp.view);

  const { fromIso, toIso } = appointmentFetchBounds(date, view);
  const take = appointmentFetchTake(view);

  // Fetch the directory data + appointments + class instances + whoami in
  // parallel. If any fail with a 403 we surface a single error UI instead
  // of cascading. Class instances are Phase 2a — `scheduled` only here so
  // cancelled rows don't clutter the day grid.
  let directoryError: string | null = null;
  let staffData: Awaited<ReturnType<typeof listStaff>> | null = null;
  let servicesData: Awaited<ReturnType<typeof listServices>> | null = null;
  let appointmentsData: Awaited<ReturnType<typeof listAppointments>> | null = null;
  let classInstancesData: Awaited<ReturnType<typeof listClassInstances>> | null =
    null;
  let whoami: Awaited<ReturnType<typeof getWhoami>> | null = null;
  // Phase 3c — tenant booking settings drive the class-cancel "Free
  // cancellation until N hours before class" caption + late-cancel flag.
  let bookingSettingsData: Awaited<
    ReturnType<typeof getTenantBookingSettings>
  > | null = null;

  try {
    [
      staffData,
      servicesData,
      appointmentsData,
      classInstancesData,
      whoami,
      bookingSettingsData,
    ] = await Promise.all([
      listStaff({ active: true, take: 100 }),
      listServices({ active: true, take: 200 }),
      listAppointments({ from: fromIso, to: toIso, take }),
      listClassInstances({
        fromDate: fromIso,
        toDate: toIso,
        state: 'scheduled',
        take,
      }),
      getWhoami(),
      getTenantBookingSettings(),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      directoryError = 'You do not have access to this tenant.';
    } else if (err instanceof ApiError) {
      directoryError = err.message;
    } else {
      directoryError = formatCalendarLoadError(err);
    }
  }

  // Drawer drilldown — only fetch when ?selected is set so the default page
  // load stays as light as the rest of /admin/*.
  let selectedBundle:
    | {
        appointment: Awaited<ReturnType<typeof getAppointment>>['appointment'];
        client: Awaited<ReturnType<typeof getClient>>['client'];
        notes: Awaited<ReturnType<typeof listClientNotes>>['notes'];
        bookingAnswers: Awaited<ReturnType<typeof listBookingAnswers>>['answers'];
      }
    | null = null;
  let selectedError: string | null = null;
  // Phase 2a — separate class-instance drawer fetch. Mirrors the appointment
  // drilldown pattern but on `?classInstance=<id>`. Phase 3a augments the
  // bundle with the live roster (bookings + waitlist) so the drawer can
  // render real numbers + manage actions without a follow-up round-trip.
  let selectedClassInstance:
    | Awaited<ReturnType<typeof getClassInstance>>['instance']
    | null = null;
  let selectedClassInstanceRoster: ListRosterResponse | null = null;
  let selectedClassInstanceError: string | null = null;
  if (sp.selected && !directoryError) {
    try {
      const apptResp = await getAppointment(sp.selected);
      const appt = apptResp.appointment;
      const [clientResp, notesResp, answersResp] = await Promise.all([
        getClient(appt.clientId),
        listClientNotes(appt.clientId, {
          appointmentId: appt.id,
          take: 50,
        }),
        listBookingAnswers(appt.id),
      ]);
      selectedBundle = {
        appointment: appt,
        client: clientResp.client,
        notes: notesResp.notes,
        bookingAnswers: answersResp.answers,
      };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        selectedError = 'Appointment not found.';
      } else if (err instanceof ApiError) {
        selectedError = err.message;
      } else {
        selectedError = formatCalendarLoadError(err);
      }
    }
  }

  if (sp.classInstance && !directoryError) {
    try {
      const [instanceResp, rosterResp] = await Promise.all([
        getClassInstance(sp.classInstance),
        getClassInstanceRoster(sp.classInstance),
      ]);
      selectedClassInstance = instanceResp.instance;
      selectedClassInstanceRoster = rosterResp;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        selectedClassInstanceError = 'Class instance not found.';
      } else if (err instanceof ApiError) {
        selectedClassInstanceError = err.message;
      } else {
        selectedClassInstanceError = formatCalendarLoadError(err);
      }
    }
  }

  if (directoryError) {
    return (
      <div className="flex flex-col gap-s4">
        <h1 className="t-display-lg">Calendar</h1>
        <Alert tone="error">{directoryError}</Alert>
      </div>
    );
  }

  const appts = appointmentsData?.appointments ?? [];
  const clientIds = [...new Set(appts.map((a) => a.clientId))];
  const clientDisplayNames: Record<string, string> = {};
  await Promise.all(
    clientIds.map(async (id) => {
      try {
        const { client } = await getClient(id);
        const name = [client.firstName, client.lastName].filter(Boolean).join(' ');
        clientDisplayNames[id] = name.trim() || 'Client';
      } catch {
        clientDisplayNames[id] = 'Client';
      }
    }),
  );

  let scheduleBlocksByStaff: Record<string, StaffScheduleBlock[]> = {};
  const staffRows = staffData?.staff ?? [];
  if (staffRows.length > 0 && !directoryError) {
    const blockPairs = await Promise.all(
      staffRows.map(async (s) => {
        try {
          const r = await listStaffScheduleBlocks({
            staffId: s.id,
            from: fromIso,
            to: toIso,
          });
          return [s.id, r.blocks] as const;
        } catch {
          return [s.id, [] as StaffScheduleBlock[]] as const;
        }
      }),
    );
    scheduleBlocksByStaff = Object.fromEntries(blockPairs);
  }

  const densityBins = computeDensityBins(appts, date);
  const staffLoad = computeStaffLoad(appts, staffRows, date);

  return (
    <CalendarDayView
      date={date}
      dateParam={dateStr}
      view={view}
      staff={staffRows}
      services={servicesData?.services ?? []}
      appointments={appts}
      classInstances={classInstancesData?.instances ?? []}
      scheduleBlocksByStaff={scheduleBlocksByStaff}
      clientDisplayNames={clientDisplayNames}
      locations={whoami?.locations ?? []}
      selected={selectedBundle}
      selectedError={selectedError}
      selectedClassInstance={selectedClassInstance}
      selectedClassInstanceRoster={selectedClassInstanceRoster}
      selectedClassInstanceError={selectedClassInstanceError}
      cancellationWindowHours={
        bookingSettingsData?.settings.bookingCancellationWindowHours ?? 24
      }
      activeTab={sp.tab ?? 'overview'}
      quickBookOpen={sp.quickbook === '1'}
      blockTimeOpen={sp.blocktime === '1'}
      pulseOpen={sp.pulse === '1'}
      densityBins={densityBins}
      staffLoad={staffLoad}
    />
  );
}
