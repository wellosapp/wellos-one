import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import {
  getAppointment,
  listAppointments,
  listBookingAnswers,
} from '@/lib/api/appointments';
import {
  listStaffScheduleBlocks,
  type StaffScheduleBlock,
} from '@/lib/api/staff-schedule-blocks';
import { listClientNotes } from '@/lib/api/client-notes';
import { getClient } from '@/lib/api/clients';
import { listServices } from '@/lib/api/services';
import { listStaff } from '@/lib/api/staff';
import { getWhoami } from '@/lib/api/whoami';
import { parseDateParam, toDateParam } from '@/lib/calendar';
import {
  appointmentFetchBounds,
  appointmentFetchTake,
  parseViewParam,
} from '@/lib/calendar-view';

import { CalendarDayView } from './CalendarDayView';

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
};

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

  // Fetch the directory data + appointments + whoami in parallel. If any
  // fail with a 403 we surface a single error UI instead of cascading.
  let directoryError: string | null = null;
  let staffData: Awaited<ReturnType<typeof listStaff>> | null = null;
  let servicesData: Awaited<ReturnType<typeof listServices>> | null = null;
  let appointmentsData: Awaited<ReturnType<typeof listAppointments>> | null = null;
  let whoami: Awaited<ReturnType<typeof getWhoami>> | null = null;

  try {
    [staffData, servicesData, appointmentsData, whoami] = await Promise.all([
      listStaff({ active: true, take: 100 }),
      listServices({ active: true, take: 200 }),
      listAppointments({ from: fromIso, to: toIso, take }),
      getWhoami(),
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

  return (
    <CalendarDayView
      date={date}
      dateParam={dateStr}
      view={view}
      staff={staffRows}
      services={servicesData?.services ?? []}
      appointments={appts}
      scheduleBlocksByStaff={scheduleBlocksByStaff}
      clientDisplayNames={clientDisplayNames}
      locations={whoami?.locations ?? []}
      selected={selectedBundle}
      selectedError={selectedError}
      activeTab={sp.tab ?? 'overview'}
      quickBookOpen={sp.quickbook === '1'}
      blockTimeOpen={sp.blocktime === '1'}
    />
  );
}
