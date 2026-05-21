'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { Alert, Button, FormField, Input, Select } from '@/components/ui';

import type { ActionState, BookingSettingsFormValues } from './_actions';

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
  initial: BookingSettingsFormValues;
  submitLabel?: string;
  successMessage?: string;
};

// Section wrapper — mirrors StaffForm's `fieldset` pattern.
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-s3 rounded-md border border-surface-3 px-s4 pb-s4 pt-s2">
      <legend className="t-eyebrow px-s2 text-ink-soft">{title}</legend>
      {description && (
        <p className="t-body-sm text-ink-soft">{description}</p>
      )}
      <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function BookingSettingsForm({
  action,
  initial,
  submitLabel = 'Save settings',
  successMessage = 'Booking settings saved.',
}: Props) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, {
    ok: false,
  });

  const values = state.values ?? initial;
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-s5">
      {state.ok && <Alert tone="success">{successMessage}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <Section
        title="Deposits"
        description="Charge a deposit when a client books. Disabled by default."
      >
        <FormField label="Deposits enabled">
          <label className="flex items-center gap-s2">
            <input
              type="checkbox"
              name="bookingDepositsEnabled"
              value="1"
              defaultChecked={values.bookingDepositsEnabled ?? false}
              className="h-[18px] w-[18px] cursor-pointer accent-accent"
            />
            <span className="t-body-md text-ink-soft">
              Collect a deposit on every public booking
            </span>
          </label>
        </FormField>
        <FormField
          label="Deposit amount (USD)"
          error={fieldErrors.bookingDepositAmountDollars}
          hint="Used only when deposits are enabled."
        >
          <Input
            type="number"
            name="bookingDepositAmountDollars"
            inputMode="decimal"
            min={0}
            step={0.01}
            defaultValue={values.bookingDepositAmountDollars ?? ''}
            error={Boolean(fieldErrors.bookingDepositAmountDollars)}
          />
        </FormField>
      </Section>

      <Section
        title="Cancellation and no-show"
        description="How late a client can cancel without a fee, and what happens if they cancel late or don't show."
      >
        <FormField
          label="Cancellation window (hours)"
          error={fieldErrors.bookingCancellationWindowHours}
        >
          <Input
            type="number"
            name="bookingCancellationWindowHours"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={values.bookingCancellationWindowHours ?? ''}
            error={Boolean(fieldErrors.bookingCancellationWindowHours)}
          />
        </FormField>
        <FormField
          label="Cancellation fee (USD)"
          error={fieldErrors.bookingCancellationFeeDollars}
          hint="Charged for cancellations inside the window above."
        >
          <Input
            type="number"
            name="bookingCancellationFeeDollars"
            inputMode="decimal"
            min={0}
            step={0.01}
            defaultValue={values.bookingCancellationFeeDollars ?? ''}
            error={Boolean(fieldErrors.bookingCancellationFeeDollars)}
          />
        </FormField>
        <FormField
          label="No-show fee (USD)"
          error={fieldErrors.bookingNoShowFeeDollars}
          className="md:col-span-2"
        >
          <Input
            type="number"
            name="bookingNoShowFeeDollars"
            inputMode="decimal"
            min={0}
            step={0.01}
            defaultValue={values.bookingNoShowFeeDollars ?? ''}
            error={Boolean(fieldErrors.bookingNoShowFeeDollars)}
          />
        </FormField>
      </Section>

      <Section
        title="Booking window"
        description="How far ahead clients can book, and how close to the appointment time they can still book it."
      >
        <FormField
          label="Minimum booking notice (hours)"
          error={fieldErrors.bookingMinNoticeHours}
        >
          <Input
            type="number"
            name="bookingMinNoticeHours"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={values.bookingMinNoticeHours ?? ''}
            error={Boolean(fieldErrors.bookingMinNoticeHours)}
          />
        </FormField>
        <FormField
          label="Maximum booking window (days)"
          error={fieldErrors.bookingMaxWindowDays}
        >
          <Input
            type="number"
            name="bookingMaxWindowDays"
            inputMode="numeric"
            min={0}
            step={1}
            defaultValue={values.bookingMaxWindowDays ?? ''}
            error={Boolean(fieldErrors.bookingMaxWindowDays)}
          />
        </FormField>
      </Section>

      <Section
        title="Buffers"
        description="Default buffer between back-to-back appointments. Each staff member can override this on their profile."
      >
        <FormField
          label="Default buffer (minutes)"
          error={fieldErrors.bookingDefaultBufferMinutes}
          className="md:col-span-2"
        >
          <Input
            type="number"
            name="bookingDefaultBufferMinutes"
            inputMode="numeric"
            min={0}
            step={5}
            defaultValue={values.bookingDefaultBufferMinutes ?? ''}
            error={Boolean(fieldErrors.bookingDefaultBufferMinutes)}
          />
        </FormField>
      </Section>

      <Section
        title="Other"
        description="Walk-ins, tipping, and how the booking flow identifies returning clients."
      >
        <FormField label="Walk-ins allowed">
          <label className="flex items-center gap-s2">
            <input
              type="checkbox"
              name="bookingWalkInsAllowed"
              value="1"
              defaultChecked={values.bookingWalkInsAllowed ?? true}
              className="h-[18px] w-[18px] cursor-pointer accent-accent"
            />
            <span className="t-body-md text-ink-soft">
              Staff can book walk-in clients without an appointment
            </span>
          </label>
        </FormField>
        <FormField label="Tips enabled">
          <label className="flex items-center gap-s2">
            <input
              type="checkbox"
              name="bookingTipsEnabled"
              value="1"
              defaultChecked={values.bookingTipsEnabled ?? true}
              className="h-[18px] w-[18px] cursor-pointer accent-accent"
            />
            <span className="t-body-md text-ink-soft">
              Prompt the client for a tip at checkout
            </span>
          </label>
        </FormField>
        <FormField
          label="Client recognition"
          error={fieldErrors.bookingClientRecognitionMode}
          hint="Which fields must match to consider a booking as a returning client."
          className="md:col-span-2"
        >
          <Select
            name="bookingClientRecognitionMode"
            defaultValue={values.bookingClientRecognitionMode ?? 'email_phone'}
            error={Boolean(fieldErrors.bookingClientRecognitionMode)}
          >
            <option value="email_only">Email only</option>
            <option value="email_phone">Email and phone</option>
            <option value="email_name">Email and name</option>
          </Select>
        </FormField>
        <FormField
          label="Override roles"
          error={fieldErrors.bookingOverrideRoles}
          hint="Comma-separated role names allowed to double-book. Defaults to admin,manager."
          className="md:col-span-2"
        >
          <Input
            type="text"
            name="bookingOverrideRoles"
            defaultValue={values.bookingOverrideRoles ?? 'admin,manager'}
            error={Boolean(fieldErrors.bookingOverrideRoles)}
          />
        </FormField>
      </Section>

      <div className="flex gap-s3">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
