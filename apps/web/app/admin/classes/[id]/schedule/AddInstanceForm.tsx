'use client';

// useFormState (react-dom) is the React-18 equivalent of useActionState
// (react), which only exists in React 19. Next.js 14 ships React 18 at
// runtime — ESLint blocks useActionState from react.
import { useFormState, useFormStatus } from 'react-dom';

import {
  Alert,
  Button,
  FormField,
  Input,
  Select,
} from '@/components/ui';

import type {
  CreateInstanceActionState,
  ScheduleFormValues,
} from './_actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="accent" size="md" loading={pending}>
      {pending ? 'Scheduling…' : 'Schedule class'}
    </Button>
  );
}

type StaffOption = {
  id: string;
  firstName: string;
  lastName: string | null;
  jobTitle: string | null;
};

type LocationOption = {
  id: string;
  name: string;
};

type Props = {
  action: (
    prev: CreateInstanceActionState,
    formData: FormData,
  ) => Promise<CreateInstanceActionState>;
  instructors: StaffOption[];
  locations: LocationOption[];
  initial?: ScheduleFormValues;
};

export function AddInstanceForm({
  action,
  instructors,
  locations,
  initial,
}: Props) {
  const [state, formAction] = useFormState<CreateInstanceActionState, FormData>(
    action,
    { ok: false },
  );

  // After a successful submit the action clears values; otherwise re-display
  // the user's last input.
  const values = state.ok ? {} : (state.values ?? initial ?? {});
  const fieldErrors = state.fieldErrors ?? {};

  const noInstructors = instructors.length === 0;
  const noLocations = locations.length === 0;

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-s5">
      {state.ok && (
        <Alert tone="success">Class instance scheduled.</Alert>
      )}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      {noInstructors && (
        <Alert tone="warning">
          No eligible instructors assigned to this class yet. Add at least one
          instructor on the class detail page before scheduling.
        </Alert>
      )}
      {noLocations && (
        <Alert tone="warning">
          No locations configured for this tenant.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
        <FormField label="Date" required error={fieldErrors.date}>
          <Input
            type="date"
            name="date"
            required
            defaultValue={values.date ?? ''}
            error={Boolean(fieldErrors.date)}
          />
        </FormField>

        <FormField label="Start time" required error={fieldErrors.time}>
          <Input
            type="time"
            name="time"
            required
            defaultValue={values.time ?? ''}
            error={Boolean(fieldErrors.time)}
          />
        </FormField>
      </div>

      <FormField
        label="Instructor"
        required
        error={fieldErrors.staffId}
        hint="Only instructors assigned to this class show up here."
      >
        <Select
          name="staffId"
          required
          defaultValue={values.staffId ?? ''}
          disabled={noInstructors}
          className="w-full max-w-md"
        >
          <option value="">Select an instructor</option>
          {instructors.map((s) => {
            const name = `${s.firstName}${s.lastName ? ' ' + s.lastName : ''}`;
            return (
              <option key={s.id} value={s.id}>
                {name}
                {s.jobTitle ? ` · ${s.jobTitle}` : ''}
              </option>
            );
          })}
        </Select>
      </FormField>

      <FormField label="Location" required error={fieldErrors.locationId}>
        <Select
          name="locationId"
          required
          defaultValue={values.locationId ?? ''}
          disabled={noLocations}
          className="w-full max-w-md"
        >
          <option value="">Select a location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </FormField>

      <fieldset className="flex flex-col gap-s3 rounded-md border border-surface-3 px-s4 pb-s4 pt-s2">
        <legend className="t-eyebrow px-s2 text-ink-soft">
          Overrides (optional)
        </legend>
        <p className="t-caption text-ink-soft">
          Leave blank to inherit from the class template. Useful for one-off
          workshops with different capacity than the regular class.
        </p>
        <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
          <FormField
            label="Capacity override"
            error={fieldErrors.capacityOverride}
            hint="Override the class's max capacity for this instance only."
          >
            <Input
              type="number"
              name="capacityOverride"
              inputMode="numeric"
              min={1}
              max={500}
              step={1}
              defaultValue={values.capacityOverride ?? ''}
              error={Boolean(fieldErrors.capacityOverride)}
            />
          </FormField>

          <FormField
            label="Waitlist override"
            error={fieldErrors.waitlistOverride}
            hint="Override the class's waitlist limit for this instance only."
          >
            <Input
              type="number"
              name="waitlistOverride"
              inputMode="numeric"
              min={0}
              max={500}
              step={1}
              defaultValue={values.waitlistOverride ?? ''}
              error={Boolean(fieldErrors.waitlistOverride)}
            />
          </FormField>
        </div>
      </fieldset>

      <div className="flex gap-s3">
        <SubmitButton />
      </div>
    </form>
  );
}
