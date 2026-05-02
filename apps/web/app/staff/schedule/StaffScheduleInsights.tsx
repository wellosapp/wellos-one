'use client';

interface StaffScheduleInsightsProps {
  nextClientLabel?: string;
}

export function StaffScheduleInsights({
  nextClientLabel,
}: StaffScheduleInsightsProps) {
  return (
    <section
      aria-label="Schedule insights"
      className="grid gap-s4 md:grid-cols-3"
    >
      <div className="rounded-xl border border-surface-3 bg-white p-s5 shadow-sm">
        <h2 className="t-display-md text-ink">Prep brief</h2>
        <p className="mt-s1 t-body-sm text-ink-soft">
          What matters before your next client.
        </p>
        <div className="mt-s3 rounded-lg border border-surface-3 bg-surface px-s3 py-s3">
          <strong className="t-body-md text-ink">
            {nextClientLabel ?? 'Next visit'}
          </strong>
          <span className="mt-s1 block t-caption text-ink-soft">
            Open the appointment drawer for intake status and alerts.
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-surface-3 bg-white p-s5 shadow-sm">
        <h2 className="t-display-md text-ink">My open gaps</h2>
        <p className="mt-s1 t-body-sm text-ink-soft">
          Tap dashed gaps on your calendar to convert them into bookings.
        </p>
        <div className="mt-s3 rounded-lg border border-surface-3 bg-surface px-s3 py-s3">
          <strong className="t-body-md text-ink">Availability-aware gaps</strong>
          <span className="mt-s1 block t-caption text-ink-soft">
            Gaps are computed between today&apos;s appointments on this view.
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-surface-3 bg-white p-s5 shadow-sm">
        <h2 className="t-display-md text-ink">Today actions</h2>
        <p className="mt-s1 t-body-sm text-ink-soft">Staff-safe shortcuts.</p>
        <div className="mt-s3 grid gap-s2">
          <div className="rounded-lg border border-surface-3 bg-surface px-s3 py-s3">
            <strong className="t-body-md text-ink">Check in</strong>
            <span className="mt-s1 block t-caption text-ink-soft">
              From the appointment drawer when clients arrive.
            </span>
          </div>
          <div className="rounded-lg border border-surface-3 bg-surface px-s3 py-s3">
            <strong className="t-body-md text-ink">Add note</strong>
            <span className="mt-s1 block t-caption text-ink-soft">
              Notes attach to the appointment and client profile.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
