'use client';

// useFormState (react-dom) is the React-18 equivalent of useActionState
// (react), which only exists in React 19. Next.js 14 ships a React 18
// canary at runtime, so the older hook is what's actually available
// here. Signatures are identical: (action, initialState) => [state, action].
import { useFormState, useFormStatus } from 'react-dom';

import { Alert, Button, FormField, Input, Select, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ClientWriteBody, ClientIntakeStatus } from '@/lib/api/clients';

import { BellIcon, UserIcon } from '@/app/admin/_shell/icons';

import { SectionSaveFooter } from './[id]/_components/SectionSaveFooter';
import type { ActionState } from './_actions';
import { MailingAddressField } from './_components/MailingAddressField';
import { composeMailingAddress } from './_components/composeMailingAddress';

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
  /** Merged onto the root form element (e.g. drop max-width on wide layouts). */
  formClassName?: string;
  /** Optional id forwarded to the <form>; lets external buttons target it
   *  via the `form="<id>"` attribute (used by SectionSaveFooter on the
   *  Overview tab). */
  id?: string;
  /** When true, the inline submit button at the bottom of the form is
   *  hidden. The Overview tab passes this and supplies its own footer. */
  hideInlineSubmit?: boolean;
  /** When true, the tag checkbox fieldset is hidden. The Overview tab passes
   *  this because Tags renders as a separate card outside the form. The
   *  create page leaves this false so tags are pickable at creation. */
  hideTagsFieldset?: boolean;
};

export function ClientForm({
  action,
  initial,
  tags,
  submitLabel = 'Save',
  successMessage = 'Saved.',
  formClassName,
  id,
  hideInlineSubmit = false,
  hideTagsFieldset = false,
}: Props) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, { ok: false });

  // After the action returns with a duplicate warning, re-display the values
  // the user submitted. After success, fall back to the action's echoed
  // values so updated form reflects what was just saved.
  const values = state.values ?? initial ?? {};
  const fieldErrors = state.fieldErrors ?? {};
  const showAcknowledge = Boolean(state.duplicateWarning);
  const initialTagIds = new Set(values.tagIds ?? []);
  const composedAddress = composeMailingAddress(values);

  return (
    <form
      id={id}
      action={formAction}
      className={cn('flex max-w-3xl flex-col gap-s5', formClassName)}
    >
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

      {/* Contact & profile section */}
      <section
        className={cn(
          'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
        )}
      >
        <header className="border-b border-line bg-surface-sunk/40 px-s6 py-s5">
          <div className="flex items-center gap-s2 t-eyebrow tracking-wide text-sage">
            <UserIcon size={14} />
            <span>CONTACT &amp; PROFILE</span>
          </div>
          <h3 className="mt-s2 font-display text-[20px] leading-tight text-ink">
            Keep contact info current.
          </h3>
          <p className="mt-s2 max-w-2xl t-body-md leading-relaxed text-ink-3">
            Used for reminders, receipts, and appointment messaging. Changes
            save to this client only.
          </p>
        </header>
        <div className="flex flex-col gap-s5 px-s6 py-s5">
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
            <FormField
              label="Preferred name"
              error={fieldErrors.preferredName}
              hint="How they like to be addressed at check-in and in messages."
            >
              <Input
                type="text"
                name="preferredName"
                defaultValue={values.preferredName ?? ''}
                error={Boolean(fieldErrors.preferredName)}
              />
            </FormField>
            <FormField label="Pronouns">
              {/* Coming-soon stub — Client.pronouns is not yet on the schema. No
               *  `name` so this never enters FormData. */}
              <Input
                type="text"
                placeholder="she/her"
                disabled
                aria-disabled="true"
                className="cursor-not-allowed opacity-60"
                title="Coming soon — pronouns will save once schema migration lands"
              />
              <p className="mt-s1 text-[11.5px] italic text-ink-3">
                Coming soon — pronouns will save once schema migration lands.
              </p>
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
            {/* Mailing address sits next to Date of birth per the design.
                Collapsed: single composed-address field. Expanded:
                col-span-2 takes the full grid row so the 6 inputs fit. */}
            <MailingAddressField composedAddress={composedAddress}>
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
            </MailingAddressField>
            {/* Intake status moves to its own row below now that Mailing
                address occupies the right column of the dateOfBirth row. */}
            <FormField
              label="Intake status"
              error={fieldErrors.intakeStatus}
              className="md:col-span-2"
            >
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

          <FormField label="Notes" error={fieldErrors.notes}>
            <Textarea
              name="notes"
              rows={4}
              defaultValue={values.notes ?? ''}
              error={Boolean(fieldErrors.notes)}
            />
          </FormField>
        </div>
      </section>

      {/* Auto-save indicator + Revert + Save changes — design places this
          BETWEEN the Contact card and the Emergency Contact card. The
          buttons target the parent form natively (since they're inside the
          form element), so no form="<id>" attribute is needed. The footer
          only renders on the Overview tab (where `id` is passed); the
          create page leaves `id` undefined and falls back to the inline
          submit button below. */}
      {id ? <SectionSaveFooter formId={id} /> : null}

      {/* Emergency contact section — same form, separate visual card. */}
      <section
        className={cn(
          'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
        )}
      >
        <header className="border-b border-line bg-surface-sunk/40 px-s6 py-s5">
          <div className="flex items-center gap-s2 t-eyebrow tracking-wide text-sage">
            <BellIcon size={14} />
            <span>EMERGENCY CONTACT</span>
          </div>
          <h3 className="mt-s2 font-display text-[20px] leading-tight text-ink">
            Someone to reach in an emergency.
          </h3>
        </header>
        <div className="flex flex-col gap-s4 px-s6 py-s5">
          <div className="grid grid-cols-1 gap-s4 md:grid-cols-2">
            <FormField label="Contact name" error={fieldErrors.emergencyContactName}>
              <Input
                type="text"
                name="emergencyContactName"
                defaultValue={values.emergencyContactName ?? ''}
                error={Boolean(fieldErrors.emergencyContactName)}
              />
            </FormField>
            <FormField label="Relationship">
              {/* Coming-soon stub — Client.emergencyContactRelationship is not
               *  on the schema yet. No `name` so it stays out of FormData. */}
              <Input
                type="text"
                placeholder="e.g. Spouse, Parent, Friend"
                disabled
                aria-disabled="true"
                className="cursor-not-allowed opacity-60"
                title="Coming soon — relationship will save once schema migration lands"
              />
              <p className="mt-s1 text-[11.5px] italic text-ink-3">
                Coming soon — relationship will save once schema migration lands.
              </p>
            </FormField>
          </div>
          <FormField label="Phone" error={fieldErrors.emergencyContactPhone}>
            <Input
              type="tel"
              name="emergencyContactPhone"
              defaultValue={values.emergencyContactPhone ?? ''}
              error={Boolean(fieldErrors.emergencyContactPhone)}
            />
          </FormField>
        </div>
      </section>

      {!hideTagsFieldset && (
        <fieldset className="flex flex-col gap-s3 rounded-xl border border-surface-3 bg-surface/40 px-s5 pb-s5 pt-s3">
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
      )}

      {!hideInlineSubmit && (
        <div className="flex gap-s3">
          <SubmitButton label={submitLabel} />
        </div>
      )}
    </form>
  );
}
