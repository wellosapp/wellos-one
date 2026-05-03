'use client';

import type { StaffBookingFormSummary } from '@/lib/staff-booking/client-context-types';

import { bookingFormStatusLabel } from './booking-form-helpers';

export function QuickBookFormsAckSection({
  items,
  checked,
  onChange,
  fieldErrors,
}: {
  items: StaffBookingFormSummary[];
  checked: boolean;
  onChange: (checked: boolean) => void;
  fieldErrors?: Record<string, string>;
}) {
  if (items.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-amber/40 bg-amber-pale/50 px-s3 py-s3"
      role="group"
      aria-label="Forms requiring acknowledgment before booking"
    >
      <p className="t-body-sm font-semibold text-amber-900">
        Required forms — confirm before booking
      </p>
      <ul className="mt-s2 flex list-inside list-disc flex-col gap-s1 t-caption text-ink">
        {items.map((f) => (
          <li key={f.id}>
            <span className="font-medium">{f.label}</span>
            <span className="text-ink-soft">
              {' '}
              ({bookingFormStatusLabel(f.status)})
            </span>
          </li>
        ))}
      </ul>
      <label className="mt-s3 flex cursor-pointer gap-s2 items-start">
        <input
          type="checkbox"
          name="ack_required_forms"
          value="1"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1"
        />
        <span className="t-body-sm text-ink">
          I have reviewed these form requirements and will ensure completion
          before visit where required.
        </span>
      </label>
      {fieldErrors?.ack_required_forms ? (
        <span className="mt-s2 block t-caption text-red">
          {fieldErrors.ack_required_forms}
        </span>
      ) : null}
    </div>
  );
}
