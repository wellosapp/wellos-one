import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import {
  getAppointment,
  listAppointments,
  listBookingAnswers,
} from '@/lib/api/appointments';
import { listClientNotes } from '@/lib/api/client-notes';
import { getClient } from '@/lib/api/clients';
import { listServices } from '@/lib/api/services';
import { listStaff } from '@/lib/api/staff';
import { getWhoami } from '@/lib/api/whoami';
import { parseDateParam, toDateParam } from '@/lib/calendar';

import { CalendarDayView } from './CalendarDayView';

// /admin/calendar — staff/admin daily-driver UI (E3-S5 T5).
// Server-rendered: parses ?date / ?selected / ?tab / ?quickbook from the
// URL, fetches the day's appointments + the directory data the client
// components need (staff, services, locations), and the selected
// appointment's drilldown data when the drawer is open. Per
// docs/04-booking UI UX Update/wellos_booking_r2_uiux_package
// /wellos_calendar_booking_r2_uiux_buildout.md §5–§6.

type SearchParams = {
  date?: string;
  selected?: string;
  tab?: string;
  quickbook?: string;
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const date = parseDateParam(sp.date);
  const dateStr = toDateParam(date);

  // Pad the appointment window ±14h around the requested date in UTC. The
  // server is UTC; the operator's browser may be ±anywhere. The client-side
  // grid filters to the visible day in browser-local TZ. Over-fetch is
  // bounded — most days have <50 appointments.
  const dayMs = date.getTime();
  const fromIso = new Date(dayMs - 14 * 60 * 60 * 1000).toISOString();
  const toIso = new Date(dayMs + 38 * 60 * 60 * 1000).toISOString();

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
      listAppointments({ from: fromIso, to: toIso, take: 200 }),
      getWhoami(),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      directoryError = 'You do not have admin access to this tenant.';
    } else if (err instanceof ApiError) {
      directoryError = err.message;
    } else {
      throw err;
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
        throw err;
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

  return (
    <CalendarDayView
      date={date}
      dateParam={dateStr}
      staff={staffData?.staff ?? []}
      services={servicesData?.services ?? []}
      appointments={appointmentsData?.appointments ?? []}
      locations={whoami?.locations ?? []}
      selected={selectedBundle}
      selectedError={selectedError}
      activeTab={sp.tab ?? 'overview'}
      quickBookOpen={sp.quickbook === '1'}
    />
  );
}
