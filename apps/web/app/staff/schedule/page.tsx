import { currentUser } from '@clerk/nextjs/server';

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
import {
  appointmentFetchBounds,
  appointmentFetchTake,
  parseViewParam,
} from '@/lib/calendar-view';

import { StaffScheduleView } from './StaffScheduleView';

type SearchParams = {
  date?: string;
  view?: string;
  selected?: string;
  tab?: string;
  quickbook?: string;
};

export default async function StaffSchedulePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const date = parseDateParam(sp.date);
  const dateStr = toDateParam(date);
  const view = parseViewParam(sp.view);

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;

  const { fromIso, toIso } = appointmentFetchBounds(date, view);
  const take = appointmentFetchTake(view);

  let directoryError: string | null = null;
  let staffData: Awaited<ReturnType<typeof listStaff>> | null = null;
  let servicesData: Awaited<ReturnType<typeof listServices>> | null = null;
  let appointmentsData: Awaited<ReturnType<typeof listAppointments>> | null =
    null;
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
      throw err;
    }
  }

  if (directoryError) {
    return (
      <div className="flex flex-col gap-s4">
        <h1 className="t-display-lg">My schedule</h1>
        <Alert tone="error">{directoryError}</Alert>
      </div>
    );
  }

  const staffList = staffData?.staff ?? [];
  const me =
    email === null
      ? null
      : staffList.find((s) => s.email?.toLowerCase() === email) ?? null;

  if (!me) {
    return (
      <div className="flex flex-col gap-s4">
        <h1 className="t-display-lg">My schedule</h1>
        <Alert tone="warning">
          {email
            ? 'No staff profile matches your Work email yet. Ask an admin to add your email on your staff profile.'
            : 'Sign in to view your schedule.'}
        </Alert>
      </div>
    );
  }

  const myAppointments =
    appointmentsData?.appointments.filter((a) => a.staffId === me.id) ?? [];

  let selectedBundle:
    | {
        appointment: Awaited<ReturnType<typeof getAppointment>>['appointment'];
        client: Awaited<ReturnType<typeof getClient>>['client'];
        notes: Awaited<ReturnType<typeof listClientNotes>>['notes'];
        bookingAnswers: Awaited<ReturnType<typeof listBookingAnswers>>['answers'];
      }
    | null = null;
  let selectedError: string | null = null;
  if (sp.selected) {
    try {
      const apptResp = await getAppointment(sp.selected);
      const appt = apptResp.appointment;
      if (appt.staffId !== me.id) {
        selectedError = 'That appointment is not on your schedule.';
      } else {
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
      }
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

  const clientIds = [...new Set(myAppointments.map((a) => a.clientId))];
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

  return (
    <StaffScheduleView
      date={date}
      dateParam={dateStr}
      view={view}
      me={me}
      services={servicesData?.services ?? []}
      appointments={myAppointments}
      clientDisplayNames={clientDisplayNames}
      locations={whoami?.locations ?? []}
      selected={selectedBundle}
      selectedError={selectedError}
      activeTab={sp.tab ?? 'overview'}
      quickBookOpen={sp.quickbook === '1'}
    />
  );
}
