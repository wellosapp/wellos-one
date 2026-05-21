'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { Alert, Button, Card, FormField, Input } from '@/components/ui';

import type {
  ActionState,
  StaffBookingPrefsFormValues,
} from './_booking-preferences-actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" loading={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: StaffBookingPrefsFormValues;
};

export function BookingPreferencesCard({ action, initial }: Props) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, {
    ok: false,
  });

  const values = state.values ?? initial;
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <Card padding="lg">
      <form action={formAction} className="flex max-w-3xl flex-col gap-s5">
        <div className="flex flex-col gap-s1">
          <h2 className="t-display-sm">Booking preferences</h2>
          <p className="t-body-sm text-ink-soft">
            Per-staff overrides for the tenant booking defaults. Leave a field
            blank to fall back to the tenant default.
          </p>
        </div>

        {state.ok && <Alert tone="success">Preferences saved.</Alert>}
        {state.error && <Alert tone="error">{state.error}</Alert>}

        <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
          <FormField
            label="Buffer override (minutes)"
            error={fieldErrors.bookingBufferMinutesOverride}
            hint="Override the tenant default buffer for this staff member."
          >
            <Input
              type="number"
              name="bookingBufferMinutesOverride"
              inputMode="numeric"
              min={0}
              step={5}
              defaultValue={values.bookingBufferMinutesOverride ?? ''}
              error={Boolean(fieldErrors.bookingBufferMinutesOverride)}
            />
          </FormField>
          <FormField
            label="Min notice override (hours)"
            error={fieldErrors.bookingMinNoticeHoursOverride}
            hint="Override the tenant minimum booking notice."
          >
            <Input
              type="number"
              name="bookingMinNoticeHoursOverride"
              inputMode="numeric"
              min={0}
              step={1}
              defaultValue={values.bookingMinNoticeHoursOverride ?? ''}
              error={Boolean(fieldErrors.bookingMinNoticeHoursOverride)}
            />
          </FormField>
        </div>

        <FormField label="Calendar sync">
          <label className="flex items-center gap-s2">
            <input
              type="checkbox"
              name="bookingCalendarSyncOptedIn"
              value="1"
              defaultChecked={values.bookingCalendarSyncOptedIn ?? false}
              className="h-[18px] w-[18px] cursor-pointer accent-accent"
            />
            <span className="t-body-md text-ink-soft">
              Opt this staff member in to two-way calendar sync (Google /
              Outlook). Tenant must also have calendar sync enabled.
            </span>
          </label>
        </FormField>

        <div className="flex gap-s3">
          <SubmitButton label="Save preferences" />
        </div>
      </form>
    </Card>
  );
}
