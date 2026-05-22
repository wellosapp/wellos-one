'use client';

import type { Appointment, AppointmentState } from '@/lib/api/appointments';

interface AdminCalendarInsightsProps {
  appointments: Appointment[];
}

function countByState(
  appointments: Appointment[],
): Record<AppointmentState, number> {
  const base: Record<AppointmentState, number> = {
    requested: 0,
    scheduled: 0,
    confirmed: 0,
    checked_in: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    no_show: 0,
  };
  for (const a of appointments) {
    base[a.state] += 1;
  }
  return base;
}

export function AdminCalendarInsights({
  appointments,
}: AdminCalendarInsightsProps) {
  const counts = countByState(appointments);
  const actionable =
    counts.requested +
    counts.scheduled +
    counts.confirmed +
    counts.checked_in +
    counts.in_progress;

  return (
    <div className="grid gap-s4 md:grid-cols-3">
      <div className="rounded-xl border border-surface-3 bg-white p-s5 shadow-sm">
        <h2 className="t-display-md text-ink">Needs attention</h2>
        <p className="mt-s1 t-body-sm text-ink-soft">
          Operational items surfaced for admin.
        </p>
        <div className="mt-s3 grid gap-s2">
          <div className="rounded-lg border border-surface-3 bg-surface px-s3 py-s3">
            <strong className="t-body-md text-ink">Forms & intake</strong>
            <span className="mt-s1 block t-caption text-ink-soft">
              Complete booking questionnaires from the appointment drawer.
            </span>
          </div>
          <div className="rounded-lg border border-surface-3 bg-surface px-s3 py-s3">
            <strong className="t-body-md text-ink">Schedule hygiene</strong>
            <span className="mt-s1 block t-caption text-ink-soft">
              Resolve overlaps when external calendar sync is enabled.
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-surface-3 bg-white p-s5 shadow-sm">
        <h2 className="t-display-md text-ink">Recent activity</h2>
        <p className="mt-s1 t-body-sm text-ink-soft">
          Audit-friendly calendar actions.
        </p>
        <div className="mt-s3 grid gap-s2">
          <div className="rounded-lg border border-surface-3 bg-surface px-s3 py-s3">
            <strong className="t-body-md text-ink">Live updates</strong>
            <span className="mt-s1 block t-caption text-ink-soft">
              Booking changes appear here when activity feeds ship.
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-surface-3 bg-white p-s5 shadow-sm">
        <h2 className="t-display-md text-ink">Today stats</h2>
        <p className="mt-s1 t-body-sm text-ink-soft">
          Snapshot for the visible day on this calendar.
        </p>
        <div className="mt-s3 grid gap-s2">
          <div className="rounded-lg border border-surface-3 bg-surface px-s3 py-s3">
            <strong className="t-body-md text-ink">
              {appointments.length} appointment
              {appointments.length === 1 ? '' : 's'}
            </strong>
            <span className="mt-s1 block t-caption text-ink-soft">
              {counts.completed} completed · {counts.confirmed} confirmed ·{' '}
              {counts.checked_in} checked in
              {actionable > 0 ? ` · ${actionable} active` : ''}
            </span>
          </div>
          <div className="rounded-lg border border-surface-3 bg-surface px-s3 py-s3">
            <strong className="t-body-md text-ink">Open gaps</strong>
            <span className="mt-s1 block t-caption text-ink-soft">
              Tap dashed gaps on the grid to quick book.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
