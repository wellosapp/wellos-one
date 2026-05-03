'use client';

import type { StaffBookingBookingAlert } from '@/lib/staff-booking/client-context-types';

export function QuickBookAlertAckSection({
  items,
  ackChecked,
  onAckChange,
  fieldErrors,
}: {
  items: StaffBookingBookingAlert[];
  ackChecked: Record<string, boolean>;
  onAckChange: (alertId: string, checked: boolean) => void;
  fieldErrors?: Record<string, string>;
}) {
  if (items.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-amber/40 bg-amber-pale/50 px-s3 py-s3"
      role="group"
      aria-label="Alerts requiring acknowledgment"
    >
      <p className="t-body-sm font-semibold text-amber-900">
        Acknowledge before booking
      </p>
      <ul className="mt-s2 flex flex-col gap-s3">
        {items.map((a) => {
          const fieldKey = `ack_alert_${a.id}`;
          return (
            <li key={a.id}>
              <label className="flex cursor-pointer gap-s2 items-start">
                <input
                  type="checkbox"
                  name={fieldKey}
                  value="on"
                  checked={ackChecked[a.id] ?? false}
                  onChange={(e) => onAckChange(a.id, e.target.checked)}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="t-body-sm font-medium text-ink">
                    {a.title || a.category}
                  </span>
                  {a.body ? (
                    <span className="mt-s1 block t-caption text-ink-soft">
                      {a.body}
                    </span>
                  ) : null}
                  {fieldErrors?.[fieldKey] ? (
                    <span className="mt-s1 block t-caption text-red">
                      {fieldErrors[fieldKey]}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
