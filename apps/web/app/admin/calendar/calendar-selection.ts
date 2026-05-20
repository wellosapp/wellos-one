import type { Appointment } from '@/lib/api/appointments';

/**
 * Earliest appointment that has not ended yet (by end time), excluding
 * terminal cancelled/no-show rows — used for the "Next up" badge on the day grid
 * (R2 staff day view). Ties break by start time.
 */
export function selectNextUpAppointmentId(
  appointments: Appointment[],
  now: Date = new Date(),
): string | null {
  const t = now.getTime();
  const eligible = appointments
    .filter((a) => {
      if (a.state === 'cancelled' || a.state === 'no_show') return false;
      return new Date(a.scheduledEndAt).getTime() > t;
    })
    .sort(
      (a, b) =>
        new Date(a.scheduledStartAt).getTime() -
        new Date(b.scheduledStartAt).getTime(),
    );
  return eligible[0]?.id ?? null;
}
