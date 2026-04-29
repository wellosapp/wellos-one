'use client';

// useFormState (react-dom) is the React-18 equivalent of useActionState
// (react), which only exists in React 19. Next.js 14 ships React 18
// canary at runtime — see hotfix #28 for context.
import { useFormState, useFormStatus } from 'react-dom';

import { Alert, Button, FormField, Input, Textarea } from '@/components/ui';

import type { ActionState, ServiceFormValues } from './_actions';

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
  initial?: ServiceFormValues;
  submitLabel?: string;
  successMessage?: string;
};

export function ServiceForm({
  action,
  initial,
  submitLabel = 'Save',
  successMessage = 'Saved.',
}: Props) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, { ok: false });

  // After validation failure, re-display the values the user submitted.
  // After success, fall back to the action's echoed values so updated form
  // reflects what was just saved.
  const values = state.values ?? initial ?? {};
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-s5">
      {state.ok && <Alert tone="success">{successMessage}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <FormField label="Name" required error={fieldErrors.name}>
        <Input
          type="text"
          name="name"
          required
          maxLength={200}
          defaultValue={values.name ?? ''}
          error={Boolean(fieldErrors.name)}
        />
      </FormField>

      <FormField
        label="Description"
        error={fieldErrors.description}
        hint="Optional. Shown to clients on the booking page."
      >
        <Textarea
          name="description"
          rows={3}
          maxLength={4000}
          defaultValue={values.description ?? ''}
          error={Boolean(fieldErrors.description)}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
        <FormField
          label="Duration (minutes)"
          required
          error={fieldErrors.durationMinutes}
          hint="Booking grid snaps to this. Whole minutes only."
        >
          <Input
            type="number"
            name="durationMinutes"
            inputMode="numeric"
            min={1}
            max={1440}
            step={1}
            required
            defaultValue={values.durationMinutes ?? ''}
            error={Boolean(fieldErrors.durationMinutes)}
          />
        </FormField>

        <FormField
          label="Base price (USD)"
          required
          error={fieldErrors.basePriceDollars}
          hint="Stored as cents server-side. Two decimals."
        >
          <Input
            type="number"
            name="basePriceDollars"
            inputMode="decimal"
            min={0}
            step={0.01}
            required
            defaultValue={values.basePriceDollars ?? ''}
            error={Boolean(fieldErrors.basePriceDollars)}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
        <FormField
          label="Color"
          error={fieldErrors.color}
          hint="6-digit hex like #3D7A5E. Used on the calendar."
        >
          <Input
            type="text"
            name="color"
            placeholder="#3D7A5E"
            maxLength={7}
            defaultValue={values.color ?? ''}
            error={Boolean(fieldErrors.color)}
          />
        </FormField>

        <FormField label="Active" error={fieldErrors.active}>
          <label className="flex h-[50px] items-center gap-s2">
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
      </div>

      <div className="flex gap-s3">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
