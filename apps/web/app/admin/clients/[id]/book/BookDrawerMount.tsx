'use client';

import type { Route } from 'next';
import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { AppointmentDrawer } from '@/app/admin/calendar/AppointmentDrawer';
import type { Appointment, BookingAnswer } from '@/lib/api/appointments';
import type { ClientWithTags } from '@/lib/api/clients';
import type { ClientNoteSummary } from '@/lib/api/client-notes';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';
import { parseViewParam } from '@/lib/calendar-view';

// Thin client shim around the existing AppointmentDrawer (from /admin/calendar)
// so the same drawer can mount on the Book tab. Reads the per-drawer query
// params (`tab`, `view`, `quickbook`, `date`) from the URL and wires
// `onClose` to strip `?selected` while preserving everything else (e.g.
// `?quickbook=1` if the operator opened Quick Book alongside the row).
//
// `calendarBasePath` is set to `/admin/clients/{id}/book` so the drawer's
// internal tab links stay on the Book route instead of bouncing to
// `/admin/calendar`.

export function BookDrawerMount({
  appointment,
  client,
  notes,
  bookingAnswers,
  staff,
  service,
  clientId,
}: {
  appointment: Appointment;
  client: ClientWithTags;
  notes: ClientNoteSummary[];
  bookingAnswers: BookingAnswer[];
  staff: Staff | null;
  service: Service | null;
  clientId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab = searchParams.get('tab') ?? 'overview';
  const view = parseViewParam(searchParams.get('view'));
  const quickbook = searchParams.get('quickbook') ?? undefined;

  // dateParam derived from the selected appointment's start date — used by
  // the drawer when constructing tab hrefs (so navigation stays on the same
  // appointment's day even if the user reloads from a tab link).
  const startedAt = new Date(appointment.scheduledStartAt);
  const y = startedAt.getFullYear();
  const m = String(startedAt.getMonth() + 1).padStart(2, '0');
  const d = String(startedAt.getDate()).padStart(2, '0');
  const dateParam = searchParams.get('date') ?? `${y}-${m}-${d}`;

  const onClose = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('selected');
    next.delete('tab');
    const qs = next.toString();
    router.replace((qs ? `${pathname}?${qs}` : pathname) as Route);
  }, [pathname, router, searchParams]);

  return (
    <AppointmentDrawer
      appointment={appointment}
      client={client}
      notes={notes}
      bookingAnswers={bookingAnswers}
      staff={staff}
      service={service}
      activeTab={tab}
      dateParam={dateParam}
      onClose={onClose}
      calendarBasePath={`/admin/clients/${clientId}/book`}
      view={view}
      quickbook={quickbook}
    />
  );
}
