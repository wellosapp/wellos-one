'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { Alert, Button, FormField, Input } from '@/components/ui';
import { DAY_KEYS, DAY_LABELS, type DayKey } from '@/lib/staff-days';

import type { ActionState, StaffFormValues } from './_actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" loading={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

type ServiceOption = {
  id: string;
  name: string;
  color: string | null;
};

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: StaffFormValues;
  services: ServiceOption[];
  submitLabel?: string;
  successMessage?: string;
};

export function StaffForm({
  action,
  initial,
  services,
  submitLabel = 'Save',
  successMessage = 'Saved.',
}: Props) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, { ok: false });

  const values = state.values ?? initial ?? {};
  const fieldErrors = state.fieldErrors ?? {};
  const initialServiceIds = new Set(values.serviceIds ?? []);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-s5">
      {state.ok && <Alert tone="success">{successMessage}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
        <FormField label="First name" required error={fieldErrors.firstName}>
          <Input
            type="text"
            name="firstName"
            required
            maxLength={80}
            defaultValue={values.firstName ?? ''}
            error={Boolean(fieldErrors.firstName)}
          />
        </FormField>
        <FormField label="Last name" error={fieldErrors.lastName}>
          <Input
            type="text"
            name="lastName"
            maxLength={80}
            defaultValue={values.lastName ?? ''}
            error={Boolean(fieldErrors.lastName)}
          />
        </FormField>
        <FormField label="Email" error={fieldErrors.email}>
          <Input
            type="email"
            name="email"
            defaultValue={values.email ?? ''}
            error={Boolean(fieldErrors.email)}
          />
        </FormField>
        <FormField label="Phone" error={fieldErrors.phone}>
          <Input
            type="tel"
            name="phone"
            defaultValue={values.phone ?? ''}
            error={Boolean(fieldErrors.phone)}
          />
        </FormField>
        <FormField label="Job title" error={fieldErrors.jobTitle} className="md:col-span-2">
          <Input
            type="text"
            name="jobTitle"
            placeholder="Massage Therapist"
            maxLength={120}
            defaultValue={values.jobTitle ?? ''}
            error={Boolean(fieldErrors.jobTitle)}
          />
        </FormField>
      </div>

      <fieldset className="flex flex-col gap-s3 rounded-md border border-surface-3 px-s4 pb-s4 pt-s2">
        <legend className="t-eyebrow px-s2 text-ink-soft">Working hours</legend>
        <p className="t-body-sm text-ink-soft">
          Single shift per day for now. 24-hour HH:MM format. Mark closed for off days.
        </p>
        <div className="flex flex-col gap-s2">
          {DAY_KEYS.map((day) => (
            <DayRow
              key={day}
              day={day}
              row={values.workingHours?.[day]}
              error={fieldErrors[`workingHours_${day}`]}
            />
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
        <FormField
          label="Hourly rate (USD)"
          error={fieldErrors.hourlyRateDollars}
          hint="Optional. Stored as cents server-side."
        >
          <Input
            type="number"
            name="hourlyRateDollars"
            inputMode="decimal"
            min={0}
            step={0.01}
            defaultValue={values.hourlyRateDollars ?? ''}
            error={Boolean(fieldErrors.hourlyRateDollars)}
          />
        </FormField>
        <FormField
          label="Commission rate (%)"
          error={fieldErrors.commissionRatePct}
          hint="Optional. 0–100, two decimals."
        >
          <Input
            type="number"
            name="commissionRatePct"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.01}
            defaultValue={values.commissionRatePct ?? ''}
            error={Boolean(fieldErrors.commissionRatePct)}
          />
        </FormField>
      </div>

      <FormField label="Active" error={fieldErrors.active}>
        <label className="flex items-center gap-s2">
          <input
            type="checkbox"
            name="active"
            value="1"
            defaultChecked={values.active ?? true}
            className="h-[18px] w-[18px] cursor-pointer accent-accent"
          />
          <span className="t-body-md text-ink-soft">
            Bookable on the public schedule
          </span>
        </label>
      </FormField>

      <fieldset className="flex flex-col gap-s3 rounded-md border border-surface-3 px-s4 pb-s4 pt-s2">
        <legend className="t-eyebrow px-s2 text-ink-soft">Services this staff can perform</legend>
        {services.length === 0 ? (
          <p className="t-body-sm text-ink-soft">
            No services exist yet. Create some on the Services page first.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-s2 md:grid-cols-2">
            {services.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-s2 rounded-sm px-s2 py-s1 transition-colors duration-fast hover:bg-surface-2"
              >
                <input
                  type="checkbox"
                  name="serviceIds"
                  value={s.id}
                  defaultChecked={initialServiceIds.has(s.id)}
                  className="h-[18px] w-[18px] cursor-pointer accent-accent"
                />
                {s.color && (
                  <span
                    aria-hidden="true"
                    className="inline-block h-[12px] w-[12px] shrink-0 rounded-sm border border-surface-3"
                    style={{ backgroundColor: s.color }}
                  />
                )}
                <span className="t-body-md text-ink">{s.name}</span>
              </label>
            ))}
          </div>
        )}
        {fieldErrors.serviceIds && (
          <span className="t-caption text-red font-sans">{fieldErrors.serviceIds}</span>
        )}
      </fieldset>

      <div className="flex gap-s3">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}

type DayRowProps = {
  day: DayKey;
  row: { closed: boolean; start?: string; end?: string } | undefined;
  error: string | undefined;
};

// Mon-Fri default to working (Closed unchecked); Sat-Sun default to closed.
// Most wellness/salon staff work a 5-day week, so this matches the common
// case and lets the admin click "Closed" only for off-pattern schedules.
const DEFAULT_CLOSED_BY_DAY: Record<DayKey, boolean> = {
  mon: false,
  tue: false,
  wed: false,
  thu: false,
  fri: false,
  sat: true,
  sun: true,
};
const DEFAULT_START = '09:00';
const DEFAULT_END = '17:00';

function DayRow({ day, row, error }: DayRowProps) {
  // If `row` is supplied (edit form populated from existing data), trust
  // its closed flag. Otherwise fall back to the day-default above.
  const closed = row?.closed ?? DEFAULT_CLOSED_BY_DAY[day];
  // Pre-populate empty inputs with 09:00 / 17:00 so a new staff form works
  // out of the box without the admin having to type times for every day.
  const startDefault = row?.start ?? (closed ? '' : DEFAULT_START);
  const endDefault = row?.end ?? (closed ? '' : DEFAULT_END);
  return (
    <div className="flex flex-col gap-s1">
      <div className="grid grid-cols-1 items-center gap-s2 md:grid-cols-[120px_auto_1fr_1fr]">
        <span className="t-body-md text-ink">{DAY_LABELS[day]}</span>
        <label className="flex items-center gap-s2 t-body-sm text-ink-soft">
          <input
            type="checkbox"
            name={`workingHours_${day}_closed`}
            value="1"
            defaultChecked={closed}
            className="h-[16px] w-[16px] cursor-pointer accent-accent"
          />
          Closed
        </label>
        <Input
          type="time"
          name={`workingHours_${day}_start`}
          defaultValue={startDefault}
          error={Boolean(error)}
          aria-label={`${DAY_LABELS[day]} start time`}
        />
        <Input
          type="time"
          name={`workingHours_${day}_end`}
          defaultValue={endDefault}
          error={Boolean(error)}
          aria-label={`${DAY_LABELS[day]} end time`}
        />
      </div>
      {error && (
        <span className="t-caption text-red font-sans md:ml-[128px]">{error}</span>
      )}
    </div>
  );
}
