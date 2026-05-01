import type { ClientTimelineResponse } from '@/lib/api/timeline';

import { ClientAlertStack } from './ClientAlertStack';
import { TimelineAppointmentCard } from './TimelineAppointmentCard';

// Top-level timeline view. Renders the alert stack, then a vertical list of
// appointment cards. Pagination control is left to the page layer (skip /
// take Next/Prev links). Per walkthrough §5 + §6.
//
// Empty state: explicit message rather than blank — solo dev pre-launch
// often has clients with no visit history yet.

export function ClientVisitTimeline({
  data,
}: {
  data: ClientTimelineResponse;
}) {
  return (
    <div className="flex flex-col gap-s6">
      <ClientAlertStack alerts={data.alerts} />

      {data.visits.length === 0 ? (
        <div className="rounded-md border border-surface-3 bg-surface-1 p-s6 text-center">
          <p className="t-body-md text-ink-soft">
            No visits yet for this client.
          </p>
          <p className="t-body-sm text-ink-soft">
            Once an appointment is booked, the visit will appear here with all
            linked notes, triage answers, and SOAP records.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-s4">
          {data.visits.map((visit) => (
            <li key={visit.appointment.id} className="list-none">
              <TimelineAppointmentCard visit={visit} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
