'use client';

import { useEffect, useRef, useState } from 'react';
// useFormState + useFormStatus from react-dom — see memory
// feedback_react18_useformstate.md (Next 14 ships React 18; useActionState
// from `react` exists at typecheck time but throws at runtime).
import { useFormState, useFormStatus } from 'react-dom';

import { Alert, Button, FormField, Input, Select } from '@/components/ui';
import { cn } from '@/lib/cn';

import {
  createServiceFormRuleAction,
  updateServiceFormRuleAction,
  type RuleActionState,
} from './_actions';

import type {
  FormAssignmentRule,
  RequiredLevel,
  Timing,
} from '@/lib/api/service-form-rules';

// One picker option for an attachable form group. The detail page server-loads
// the tenant's published IntakeFormDefinitions and collapses by groupId.
export interface FormGroupOption {
  groupId: string;
  title: string;
  formType: string;
}

interface Props {
  serviceId: string;
  /** Options minus any group already attached to this service. */
  availableGroups: FormGroupOption[];
  /** Set in edit mode. Form picker is disabled and pre-filled. */
  rule?: FormAssignmentRule;
  onClose: () => void;
}

const REQUIRED_LEVELS: { value: RequiredLevel; label: string; hint: string }[] = [
  {
    value: 'optional',
    label: 'Optional',
    hint: "Sent if auto-send is on. Client can skip without blocking the appointment.",
  },
  {
    value: 'soft_required',
    label: 'Soft required',
    hint:
      "Sent automatically. We'll warn if it's not complete before the appointment but won't block.",
  },
  {
    value: 'hard_required',
    label: 'Hard required',
    hint:
      'Sent automatically. Hard-required blocking is coming in a follow-up PR (PR 8). For now, behaves like soft-required.',
  },
];

const TIMINGS: { value: Timing; label: string; hint: string }[] = [
  {
    value: 'before_booking',
    label: 'Before booking',
    hint:
      "Form must be completed during the booking flow before confirmation. (Coming in PR 8 — currently behaves like 'before appointment'.)",
  },
  {
    value: 'before_appointment',
    label: 'Before appointment',
    hint:
      'Form is sent right after booking. Client has until the appointment to complete it.',
  },
  {
    value: 'optional',
    label: 'Optional (send manually)',
    hint:
      'Form is attached but not sent automatically. Send manually from the appointment detail page.',
  },
];

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" loading={pending}>
      {pending ? 'Saving…' : label}
    </Button>
  );
}

export function AttachFormModal({
  serviceId,
  availableGroups,
  rule,
  onClose,
}: Props) {
  const isEdit = rule !== undefined;
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Esc + body-scroll-lock + focus, mirroring CloneFromTemplateButton's modal.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  const boundAction = isEdit
    ? updateServiceFormRuleAction.bind(null, serviceId, rule.id)
    : createServiceFormRuleAction.bind(null, serviceId);

  const [state, formAction] = useFormState<RuleActionState, FormData>(
    boundAction,
    { ok: false },
  );

  // Close on successful save. Render keys off `state.ok` so the modal closes
  // after the action resolves and re-rendering the parent picks up the new
  // server-fetched list.
  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  const [requiredLevel, setRequiredLevel] = useState<RequiredLevel>(
    rule?.requiredLevel ?? 'soft_required',
  );
  const [timing, setTiming] = useState<Timing>(
    rule?.timing ?? 'before_appointment',
  );
  const [expires, setExpires] = useState<string>(
    rule?.expiresAfterDays !== null && rule?.expiresAfterDays !== undefined
      ? String(rule.expiresAfterDays)
      : '',
  );

  // Default group selection: first available in create mode; the rule's
  // group in edit mode (we render the locked title from the rule).
  const initialGroupId = isEdit
    ? rule.formDefinitionGroupId
    : availableGroups[0]?.groupId ?? '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:py-s6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attach-form-title"
    >
      <button
        type="button"
        aria-label="Close attach form modal"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/[0.42] backdrop-blur-[3px]"
      />
      <div
        className={cn(
          'relative z-10 flex w-full max-w-[640px] flex-col overflow-hidden',
          'bg-surface-1 shadow-lg',
          'sm:rounded-2xl',
          'max-h-full sm:max-h-[92vh]',
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-s4 border-b border-surface-3 bg-white px-s6 py-s4">
          <div className="flex flex-col gap-s1">
            <h2 id="attach-form-title" className="t-display-md text-ink">
              {isEdit ? 'Edit attached form' : 'Attach a form'}
            </h2>
            <p className="t-body-sm text-ink-soft">
              {isEdit
                ? 'Update how this form is sent and required for the service.'
                : 'Pick a form and choose how it behaves when a client books this service.'}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close attach form modal"
            className={cn(
              'inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-soft',
              'transition-colors duration-fast hover:bg-surface-2 hover:text-ink',
              'focus-visible:outline-none focus-visible:shadow-focus',
            )}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <form
          action={formAction}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          <div className="flex flex-col gap-s5 px-s6 py-s5">
            {state.error ? (
              <Alert tone="error" title="Could not save">
                {state.error}
              </Alert>
            ) : null}

            {/* Form picker — disabled in edit mode. */}
            <FormField htmlFor="formDefinitionGroupId" label="Form">
              {isEdit ? (
                <>
                  <div className="rounded-md border border-surface-3 bg-surface-2 px-s3 py-s2 t-body-md text-ink">
                    {rule.formTitle}
                  </div>
                  <input
                    type="hidden"
                    name="formDefinitionGroupId"
                    value={rule.formDefinitionGroupId}
                  />
                  <p className="t-caption text-ink-soft">
                    The form a rule points at can&apos;t be changed. Delete this
                    rule and add a new one to switch forms.
                  </p>
                </>
              ) : availableGroups.length === 0 ? (
                <Alert tone="warning">
                  No published forms available to attach. Publish a form from{' '}
                  <code>/admin/intake-forms</code> first.
                </Alert>
              ) : (
                <Select
                  id="formDefinitionGroupId"
                  name="formDefinitionGroupId"
                  defaultValue={initialGroupId}
                  required
                >
                  {availableGroups.map((g) => (
                    <option key={g.groupId} value={g.groupId}>
                      {g.title}
                      {g.formType && g.formType !== 'unknown'
                        ? ` (${g.formType})`
                        : ''}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>

            {/* Required level radios. */}
            <fieldset className="flex flex-col gap-s2">
              <legend className="t-body-md font-medium text-ink">
                Required level
              </legend>
              {REQUIRED_LEVELS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    'flex cursor-pointer gap-s3 rounded-md border border-surface-3 bg-white px-s4 py-s3',
                    'hover:border-accent/50',
                    requiredLevel === opt.value
                      ? 'border-accent ring-1 ring-accent/30'
                      : '',
                  )}
                >
                  <input
                    type="radio"
                    name="requiredLevel"
                    value={opt.value}
                    checked={requiredLevel === opt.value}
                    onChange={() => setRequiredLevel(opt.value)}
                    className="mt-1"
                  />
                  <span className="flex flex-col gap-s1">
                    <span className="t-body-md font-medium text-ink">
                      {opt.label}
                    </span>
                    <span className="t-caption text-ink-soft">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {/* Timing radios. */}
            <fieldset className="flex flex-col gap-s2">
              <legend className="t-body-md font-medium text-ink">Timing</legend>
              {TIMINGS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    'flex cursor-pointer gap-s3 rounded-md border border-surface-3 bg-white px-s4 py-s3',
                    'hover:border-accent/50',
                    timing === opt.value
                      ? 'border-accent ring-1 ring-accent/30'
                      : '',
                  )}
                >
                  <input
                    type="radio"
                    name="timing"
                    value={opt.value}
                    checked={timing === opt.value}
                    onChange={() => setTiming(opt.value)}
                    className="mt-1"
                  />
                  <span className="flex flex-col gap-s1">
                    <span className="t-body-md font-medium text-ink">
                      {opt.label}
                    </span>
                    <span className="t-caption text-ink-soft">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="flex flex-col gap-s3">
              <label className="flex items-center gap-s2 t-body-md text-ink">
                <input
                  type="checkbox"
                  name="sendAutomaticallyAfterBooking"
                  value="1"
                  defaultChecked={rule?.sendAutomaticallyAfterBooking ?? true}
                />
                Send automatically after booking
              </label>

              <label className="flex items-center gap-s2 t-body-md text-ink">
                <input
                  type="checkbox"
                  name="requireProviderReview"
                  value="1"
                  defaultChecked={rule?.requireProviderReview ?? false}
                />
                Require provider review
              </label>
            </div>

            <FormField
              htmlFor="expiresAfterDays"
              label="Expires after"
              hint="Number of days from send until the link expires. Leave blank for never."
            >
              <div className="flex items-center gap-s2">
                <Input
                  id="expiresAfterDays"
                  name="expiresAfterDays"
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                  placeholder="Never"
                  className="max-w-[160px]"
                />
                <span className="t-body-sm text-ink-soft">days</span>
              </div>
            </FormField>

            {isEdit ? (
              <label className="flex items-center gap-s2 t-body-md text-ink">
                <input
                  type="checkbox"
                  name="active"
                  value="1"
                  defaultChecked={rule.active}
                />
                Active
              </label>
            ) : null}
          </div>

          <footer className="sticky bottom-0 flex shrink-0 items-center justify-end gap-s2 border-t border-surface-3 bg-white px-s6 py-s4">
            <Button type="button" variant="ghost" size="md" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton label={isEdit ? 'Save changes' : 'Attach form'} />
          </footer>
        </form>
      </div>
    </div>
  );
}
