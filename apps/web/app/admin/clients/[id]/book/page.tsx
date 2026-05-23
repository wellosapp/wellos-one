import type { Route } from 'next';

import { CalendarIcon, ClockIcon } from '@/app/admin/_shell/icons';
import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import {
  getAppointment,
  listAppointments,
  listBookingAnswers,
  type Appointment,
  type AppointmentState,
} from '@/lib/api/appointments';
import { getClient } from '@/lib/api/clients';
import { listClientNotes } from '@/lib/api/client-notes';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';

import { loadClientDetail, loadQuickBookCatalog } from '../_data';
import { SectionHeader } from '../_components/SectionHeader';

import {
  AppointmentRow,
  type AppointmentRowService,
  type AppointmentRowStaff,
} from './AppointmentRow';
import { AppointmentsSection } from './AppointmentsSection';
import { BookDrawerMount } from './BookDrawerMount';
import { NewBookingHub } from './NewBookingHub';

// /admin/clients/:id/book — comprehensive appointment lens. Lists ALL
// appointments for the client (upcoming + past) with each row clickable to
// open the existing /admin/calendar AppointmentDrawer in-place via the
// `?selected=<id>` URL state. Quick Book stays as a secondary action at the
// bottom. See C:/Users/johnn/.claude/plans/giggly-humming-harp.md.

type BookSearchParams = {
  selected?: string;
  tab?: string;
  date?: string;
  view?: string;
  quickbook?: string;
};

const ACTIVE_UPCOMING_STATES = new Set<AppointmentState>([
  'requested',
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
]);

const TERMINAL_STATES = new Set<AppointmentState>([
  'completed',
  'cancelled',
  'no_show',
]);

export default async function ClientBookTabPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<BookSearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const client = await loadClientDetail(id);
  const { directory } = await loadQuickBookCatalog();

  // Pull ALL appointments for the client — no date filter. Take 100 covers
  // the foreseeable history for MVP without paging.
  let allAppointments: Appointment[] = [];
  let listError: string | null = null;
  try {
    const res = await listAppointments({ clientId: id, take: 100 });
    allAppointments = res.appointments;
  } catch (err) {
    if (err instanceof ApiError) {
      listError = err.message;
    } else {
      throw err;
    }
  }

  const now = Date.now();
  const upcoming = allAppointments
    .filter((a) => {
      const start = Date.parse(a.scheduledStartAt);
      return (
        start > now &&
        ACTIVE_UPCOMING_STATES.has(a.state) &&
        !TERMINAL_STATES.has(a.state)
      );
    })
    .sort(
      (a, b) =>
        Date.parse(a.scheduledStartAt) - Date.parse(b.scheduledStartAt),
    );

  const past = allAppointments
    .filter((a) => {
      const start = Date.parse(a.scheduledStartAt);
      return start <= now || TERMINAL_STATES.has(a.state);
    })
    .sort(
      (a, b) =>
        Date.parse(b.scheduledStartAt) - Date.parse(a.scheduledStartAt),
    );

  const serviceById = new Map<string, AppointmentRowService>(
    directory.services.map((s) => [
      s.id,
      {
        id: s.id,
        name: s.name,
        durationMinutes: s.durationMinutes,
      },
    ]),
  );
  const staffById = new Map<string, AppointmentRowStaff>(
    directory.staff.map((s) => [
      s.id,
      {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        jobTitle: s.jobTitle,
      },
    ]),
  );

  // Selected-appointment bundle — replicates the calendar's `?selected=`
  // pattern (apps/web/app/admin/calendar/page.tsx). Only fetched when the
  // URL has `?selected=`. Guarded against cross-client navigation: if the
  // appointment doesn't belong to this client, the bundle is dropped.
  type SelectedBundle = {
    appointment: Appointment;
    client: Awaited<ReturnType<typeof getClient>>['client'];
    notes: Awaited<ReturnType<typeof listClientNotes>>['notes'];
    bookingAnswers: Awaited<
      ReturnType<typeof listBookingAnswers>
    >['answers'];
    service: Service | null;
    staff: Staff | null;
  };
  let selectedBundle: SelectedBundle | null = null;
  if (sp.selected) {
    try {
      const apptResp = await getAppointment(sp.selected);
      const appt = apptResp.appointment;
      if (appt.clientId === id) {
        const [clientResp, notesResp, answersResp] = await Promise.all([
          getClient(id),
          listClientNotes(id, { appointmentId: appt.id, take: 50 }),
          listBookingAnswers(appt.id),
        ]);
        selectedBundle = {
          appointment: appt,
          client: clientResp.client,
          notes: notesResp.notes,
          bookingAnswers: answersResp.answers,
          service:
            directory.services.find((s) => s.id === appt.serviceId) ?? null,
          staff: directory.staff.find((s) => s.id === appt.staffId) ?? null,
        };
      }
    } catch {
      // Drawer just doesn't render; the list still does.
      selectedBundle = null;
    }
  }

  function makeSelectedHref(appointmentId: string): Route {
    const next = new URLSearchParams();
    next.set('selected', appointmentId);
    return `/admin/clients/${id}/book?${next.toString()}` as Route;
  }

  return (
    <div className="flex flex-col gap-s6">
      <SectionHeader
        icon={CalendarIcon}
        eyebrow="BOOK"
        headline={`All appointments for ${client.firstName}.`}
        subtitle="Past, upcoming, and quick booking — all in one place. Click any appointment to inspect."
      />

      {listError && <Alert tone="error">{listError}</Alert>}

      <AppointmentsSection
        icon={CalendarIcon}
        eyebrow="UPCOMING"
        count={upcoming.length}
        emptyState="No upcoming appointments."
      >
        {upcoming.map((appt) => (
          <AppointmentRow
            key={appt.id}
            appointment={appt}
            service={serviceById.get(appt.serviceId) ?? null}
            staff={staffById.get(appt.staffId) ?? null}
            selectedHref={makeSelectedHref(appt.id)}
          />
        ))}
      </AppointmentsSection>

      <AppointmentsSection
        icon={ClockIcon}
        eyebrow="PAST"
        count={past.length}
        emptyState="No past appointments yet."
      >
        {past.map((appt) => (
          <AppointmentRow
            key={appt.id}
            appointment={appt}
            service={serviceById.get(appt.serviceId) ?? null}
            staff={staffById.get(appt.staffId) ?? null}
            selectedHref={makeSelectedHref(appt.id)}
          />
        ))}
      </AppointmentsSection>

      <NewBookingHub clientId={id} />

      {selectedBundle && (
        <BookDrawerMount
          appointment={selectedBundle.appointment}
          client={selectedBundle.client}
          notes={selectedBundle.notes}
          bookingAnswers={selectedBundle.bookingAnswers}
          staff={selectedBundle.staff}
          service={selectedBundle.service}
          clientId={id}
        />
      )}
    </div>
  );
}
