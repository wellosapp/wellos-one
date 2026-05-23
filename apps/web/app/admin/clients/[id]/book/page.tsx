import { CalendarIcon } from '@/app/admin/_shell/icons';
import { ApiError } from '@/lib/api/client';
import {
  listAppointments,
  type Appointment,
  type AppointmentState,
} from '@/lib/api/appointments';
import {
  getClientTimeline,
  type ClientTimelineVisit,
} from '@/lib/api/timeline';

import { loadClientDetail, loadQuickBookCatalog } from '../_data';
import { SectionHeader } from '../_components/SectionHeader';
import { NewBookingHub } from './NewBookingHub';
import { RecentVisitsPreview } from './RecentVisitsPreview';
import {
  UpcomingList,
  type UpcomingItem,
} from './UpcomingList';
import type {
  UpcomingService,
  UpcomingStaff,
} from './UpcomingAppointmentCard';

// /admin/clients/:id/book — upcoming + new-booking hub + recent-visits
// preview. See docs/00 + the approved plan
// (C:/Users/johnn/.claude/plans/giggly-humming-harp.md).

const ACTIVE_UPCOMING_STATES = new Set<AppointmentState>([
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
]);

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export default async function ClientBookTabPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await loadClientDetail(id);
  const { directory, directoryError } = await loadQuickBookCatalog();

  // Upcoming window: now → +90 days. listAppointments returns the row
  // shape only — not joined service/staff — so we hydrate from the
  // catalog directory at render time below.
  const now = new Date();
  const horizon = new Date(now.getTime() + NINETY_DAYS_MS);

  let upcomingRows: Appointment[] = [];
  try {
    const res = await listAppointments({
      clientId: id,
      from: now.toISOString(),
      to: horizon.toISOString(),
      take: 50,
    });
    upcomingRows = res.appointments;
  } catch (err) {
    // Graceful fallback — the page still renders the booking hub and
    // recent-visits preview even if the appointments endpoint blips.
    if (!(err instanceof ApiError)) throw err;
    upcomingRows = [];
  }

  const serviceById = new Map<string, UpcomingService>(
    directory.services.map((s) => [
      s.id,
      {
        id: s.id,
        name: s.name,
        durationMinutes: s.durationMinutes,
      },
    ]),
  );
  const staffById = new Map<string, UpcomingStaff>(
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

  const upcoming: UpcomingItem[] = upcomingRows
    .filter((a) => ACTIVE_UPCOMING_STATES.has(a.state))
    .map((appointment) => ({
      appointment,
      service: serviceById.get(appointment.serviceId) ?? null,
      staff: staffById.get(appointment.staffId) ?? null,
    }));

  let recent: ClientTimelineVisit[] = [];
  try {
    const timeline = await getClientTimeline(id, { take: 2 });
    recent = timeline.visits;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    recent = [];
  }

  const summary = {
    id: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    banned: client.banned,
    deletedAt: client.deletedAt,
    tags: client.tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
    })),
  };

  return (
    <div className="flex flex-col gap-s6">
      <SectionHeader
        icon={CalendarIcon}
        eyebrow="BOOK"
        headline="What's next for this client."
        subtitle={`Upcoming appointments and quick booking for ${client.firstName}.`}
      />

      <UpcomingList appointments={upcoming} clientId={id} />

      <NewBookingHub
        summary={summary}
        directory={directory}
        directoryError={directoryError}
      />

      <RecentVisitsPreview visits={recent} clientId={id} />
    </div>
  );
}
