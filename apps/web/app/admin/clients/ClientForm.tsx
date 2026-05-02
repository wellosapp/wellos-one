'use client';

// useFormState (react-dom) is the React-18 equivalent of useActionState
// (react), which only exists in React 19. Next.js 14 ships a React 18
// canary at runtime, so the older hook is what's actually available
// here. Signatures are identical: (action, initialState) => [state, action].
import { useFormState, useFormStatus } from 'react-dom';

import { Alert, Button, FormField, Input, Select, Textarea } from '@/components/ui';
import type {
  ClientWriteBody,
  ClientIntakeStatus,
} from '@/lib/client-shared';

import type { ActionState } from './_actions';

const INTAKE_STATUS_LABELS: Record<ClientIntakeStatus, string> = {
  pending: 'Pending',
  sent: 'Sent',
  completed: 'Completed',
  expired: 'Expired',
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" loading={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

type TagOption = {
  id: string;
  name: string;
  color: string | null;
};

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: Partial<ClientWriteBody>;
  tags: TagOption[];
  submitLabel?: string;
  successMessage?: string;
};

export function ClientForm({
  action,
  initial,
  tags,
  submitLabel = 'Save',
  successMessage = 'Saved.',
}: Props) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, { ok: false });

  // After the action returns with a duplicate warning, re-display the values
  // the user submitted. After success, fall back to the action's echoed
  // values so updated form reflects what was just saved.
  const values = state.values ?? initial ?? {};
  const fieldErrors = state.fieldErrors ?? {};
  const showAcknowledge = Boolean(state.duplicateWarning);
  const initialTagIds = new Set(values.tagIds ?? []);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-s5">
      {state.ok && <Alert tone="success">{successMessage}</Alert>}

      {state.error && (
        <Alert tone="error">
          <div>{state.error}</div>
          {state.duplicateWarning && (
            <div className="mt-s2 t-body-sm">
              {state.duplicateWarning.matchedByEmail > 0 && (
                <div>· {state.duplicateWarning.matchedByEmail} match by email</div>
              )}
              {state.duplicateWarning.matchedByPhone > 0 && (
                <div>· {state.duplicateWarning.matchedByPhone} match by phone</div>
              )}
              <div className="mt-s2">
                Save anyway? Click <strong>{submitLabel}</strong> again — duplicates will be allowed.
              </div>
            </div>
          )}
        </Alert>
      )}

      {showAcknowledge && <input type="hidden" name="acknowledgeDuplicate" value="1" />}

      <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
        <FormField label="First name" required error={fieldErrors.firstName}>
          <Input
            type="text"
            name="firstName"
            required
            defaultValue={values.firstName ?? ''}
            error={Boolean(fieldErrors.firstName)}
          />
        </FormField>
        <FormField label="Last name" error={fieldErrors.lastName}>
          <Input
            type="text"
            name="lastName"
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
        <FormField label="Date of birth" error={fieldErrors.dateOfBirth}>
          <Input
            type="date"
            name="dateOfBirth"
            defaultValue={values.dateOfBirth ?? ''}
            error={Boolean(fieldErrors.dateOfBirth)}
          />
        </FormField>
        <FormField label="Intake status" error={fieldErrors.intakeStatus}>
          <Select
            name="intakeStatus"
            defaultValue={values.intakeStatus ?? 'pending'}
            error={Boolean(fieldErrors.intakeStatus)}
          >
            {(Object.keys(INTAKE_STATUS_LABELS) as ClientIntakeStatus[]).map((s) => (
              <option key={s} value={s}>
                {INTAKE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <fieldset className="flex flex-col gap-s3 rounded-md border border-surface-3 px-s4 pb-s4 pt-s2">
        <legend className="t-eyebrow px-s2 text-ink-soft">Address</legend>
        <FormField label="Line 1" error={fieldErrors.addressLine1}>
          <Input
            type="text"
            name="addressLine1"
            defaultValue={values.addressLine1 ?? ''}
            error={Boolean(fieldErrors.addressLine1)}
          />
        </FormField>
        <FormField label="Line 2" error={fieldErrors.addressLine2}>
          <Input
            type="text"
            name="addressLine2"
            defaultValue={values.addressLine2 ?? ''}
            error={Boolean(fieldErrors.addressLine2)}
          />
        </FormField>
        <div className="grid grid-cols-1 gap-s3 md:grid-cols-[2fr_1fr_1fr]">
          <FormField label="City" error={fieldErrors.city}>
            <Input
              type="text"
              name="city"
              defaultValue={values.city ?? ''}
              error={Boolean(fieldErrors.city)}
            />
          </FormField>
          <FormField label="State" error={fieldErrors.state}>
            <Input
              type="text"
              name="state"
              defaultValue={values.state ?? ''}
              error={Boolean(fieldErrors.state)}
            />
          </FormField>
          <FormField label="Postal code" error={fieldErrors.postalCode}>
            <Input
              type="text"
              name="postalCode"
              defaultValue={values.postalCode ?? ''}
              error={Boolean(fieldErrors.postalCode)}
            />
          </FormField>
        </div>
        <FormField label="Country" error={fieldErrors.country}>
          <Input
            type="text"
            name="country"
            defaultValue={values.country ?? ''}
            error={Boolean(fieldErrors.country)}
          />
        </FormField>
      </fieldset>

      <fieldset className="flex flex-col gap-s3 rounded-md border border-surface-3 px-s4 pb-s4 pt-s2">
        <legend className="t-eyebrow px-s2 text-ink-soft">Emergency contact</legend>
        <div className="grid grid-cols-1 gap-s3 md:grid-cols-2">
          <FormField label="Name" error={fieldErrors.emergencyContactName}>
            <Input
              type="text"
              name="emergencyContactName"
              defaultValue={values.emergencyContactName ?? ''}
              error={Boolean(fieldErrors.emergencyContactName)}
            />
          </FormField>
          <FormField label="Phone" error={fieldErrors.emergencyContactPhone}>
            <Input
              type="tel"
              name="emergencyContactPhone"
              defaultValue={values.emergencyContactPhone ?? ''}
              error={Boolean(fieldErrors.emergencyContactPhone)}
            />
          </FormField>
        </div>
      </fieldset>

      <FormField label="Notes" error={fieldErrors.notes}>
        <Textarea
          name="notes"
          rows={4}
          defaultValue={values.notes ?? ''}
          error={Boolean(fieldErrors.notes)}
        />
      </FormField>

      <fieldset className="flex flex-col gap-s3 rounded-md border border-surface-3 px-s4 pb-s4 pt-s2">
        <legend className="t-eyebrow px-s2 text-ink-soft">Tags</legend>
        {tags.length === 0 ? (
          <p className="t-body-sm text-ink-soft">
            No tags exist yet.{' '}
            <a
              href="/admin/client-tags/new"
              className="text-accent no-underline hover:underline"
            >
              Create one
            </a>{' '}
            to start labeling clients.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-s2 md:grid-cols-2">
            {tags.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-s2 rounded-sm px-s2 py-s1 transition-colors duration-fast hover:bg-surface-2"
              >
                <input
                  type="checkbox"
                  name="tagIds"
                  value={t.id}
                  defaultChecked={initialTagIds.has(t.id)}
                  className="h-[18px] w-[18px] cursor-pointer accent-accent"
                />
                <span className="inline-flex items-center gap-s2">
                  {t.color && (
                    <span
                      aria-hidden="true"
                      className="inline-block h-[12px] w-[12px] rounded-sm border border-surface-3"
                      style={{ backgroundColor: t.color }}
                    />
                  )}
                  <span className="t-body-md text-ink">{t.name}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        {fieldErrors.tagIds && (
          <span className="t-caption text-red font-sans">{fieldErrors.tagIds}</span>
        )}
      </fieldset>

      <div className="flex gap-s3">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
