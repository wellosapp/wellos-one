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
import type { ByDay } from '@/lib/api/recurrence-rules';
import { cn } from '@/lib/cn';

import type {
  RecurrenceRuleActionState,
  RecurrenceRuleFormValues,
} from './_actions';

// RecurrenceRuleEditor — Phase 2b of the Classes epic.
// Mounted when the schedule page sees ?newRule=1 (create) or ?ruleId=<id>
// (edit). Either action is bound by the parent server component before
// passing it in here.

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

// Hardcoded set of common US zones at MVP. The full Intl.supportedValuesOf
// list is too long for a usable dropdown; a tenant outside these four can
// be handled by extending this constant. Source of truth for the picker.
const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern (America/New_York)' },
  { value: 'America/Chicago', label: 'Central (America/Chicago)' },
  { value: 'America/Denver', label: 'Mountain (America/Denver)' },
  { value: 'America/Phoenix', label: 'Mountain – Arizona (America/Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (America/Los_Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (America/Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Pacific/Honolulu)' },
];

const ALL_BYDAYS: { code: ByDay; label: string; full: string }[] = [
  { code: 'SU', label: 'S', full: 'Sun' },
  { code: 'MO', label: 'M', full: 'Mon' },
  { code: 'TU', label: 'T', full: 'Tue' },
  { code: 'WE', label: 'W', full: 'Wed' },
  { code: 'TH', label: 'T', full: 'Thu' },
  { code: 'FR', label: 'F', full: 'Fri' },
  { code: 'SA', label: 'S', full: 'Sat' },
];

type Props = {
  mode: 'create' | 'edit';
  action: (
    prev: RecurrenceRuleActionState,
    formData: FormData,
  ) => Promise<RecurrenceRuleActionState>;
  cancelHref: string;
  instructors: StaffOption[];
  locations: LocationOption[];
  initial?: RecurrenceRuleFormValues;
};

function SubmitButton({ mode }: { mode: 'create' | 'edit' }) {
  const { pending } = useFormStatus();
  const labels = {
    create: { idle: 'Save rule', pending: 'Saving…' },
    edit: { idle: 'Save changes', pending: 'Saving…' },
  };
  return (
    <Button type="submit" variant="accent" size="md" loading={pending}>
      {pending ? labels[mode].pending : labels[mode].idle}
    </Button>
  );
}

export function RecurrenceRuleEditor({
  mode,
  action,
  cancelHref,
  instructors,
  locations,
  initial,
}: Props) {
  const [state, formAction] = useFormState<
    RecurrenceRuleActionState,
    FormData
  >(action, { ok: false });

  // Re-display the user's last input on validation error; on success the
  // create action clears values and the edit action keeps the saved set.
  const values =
    state.ok && mode === 'create'
      ? {}
      : (state.values ?? initial ?? {});
  const fieldErrors = state.fieldErrors ?? {};

  const noInstructors = instructors.length === 0;
  const noLocations = locations.length === 0;

  const selectedBydays = new Set<ByDay>(values.byday ?? []);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-s5">
      {state.ok && mode === 'create' && (
        <Alert tone="success">Recurrence rule saved.</Alert>
      )}
      {state.ok && mode === 'edit' && (
        <Alert tone="success">Changes saved.</Alert>
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

      <FormField
        label="Days of the week"
        required
        error={fieldErrors.byday}
        hint="Pick every day this class should run."
      >
        <div className="flex flex-wrap items-center gap-s2">
          {ALL_BYDAYS.map(({ code, label, full }) => {
            const on = selectedBydays.has(code);
            return (
              <label
                key={code}
                className={cn(
                  'inline-flex h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-md',
                  'border-[1.5px] px-s2 t-body-md font-medium',
                  'transition-[background-color,border-color] duration-fast',
                  on
                    ? 'border-accent bg-accent-pale text-accent'
                    : 'border-surface-3 bg-white text-ink-soft hover:border-ink-soft',
                )}
                title={full}
              >
                <input
                  type="checkbox"
                  name="byday"
                  value={code}
                  defaultChecked={on}
                  className="sr-only"
                />
                <span aria-hidden="true">{label}</span>
                <span className="sr-only">{full}</span>
              </label>
            );
          })}
        </div>
      </FormField>

      <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
        <FormField
          label="Start time"
          required
          error={fieldErrors.startTime}
          hint="Local time in the rule's timezone."
        >
          <Input
            type="time"
            name="startTime"
            required
            defaultValue={values.startTime ?? ''}
            error={Boolean(fieldErrors.startTime)}
          />
        </FormField>

        <FormField
          label="Duration (minutes)"
          required
          error={fieldErrors.durationMinutes}
          hint="Length of each class occurrence."
        >
          <Input
            type="number"
            name="durationMinutes"
            inputMode="numeric"
            min={5}
            max={720}
            step={1}
            required
            defaultValue={values.durationMinutes ?? '60'}
            error={Boolean(fieldErrors.durationMinutes)}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
        <FormField
          label="Start date"
          required
          error={fieldErrors.startDate}
        >
          <Input
            type="date"
            name="startDate"
            required
            defaultValue={values.startDate ?? ''}
            error={Boolean(fieldErrors.startDate)}
          />
        </FormField>

        <FormField
          label="End date (optional)"
          error={fieldErrors.endDate}
          hint="Leave blank for an open-ended schedule."
        >
          <Input
            type="date"
            name="endDate"
            defaultValue={values.endDate ?? ''}
            error={Boolean(fieldErrors.endDate)}
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

      <FormField
        label="Timezone"
        required
        error={fieldErrors.timezone}
        hint="DST flips are handled automatically — class still runs at the wall-clock time you set."
      >
        <Select
          name="timezone"
          required
          defaultValue={values.timezone ?? 'America/New_York'}
          className="w-full max-w-md"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </Select>
      </FormField>

      <div className="flex items-center gap-s3">
        <SubmitButton mode={mode} />
        <a
          href={cancelHref}
          className="t-body-md text-ink-soft no-underline hover:underline"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
