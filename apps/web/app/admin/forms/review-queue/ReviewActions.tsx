'use client';

// useFormState / useFormStatus from react-dom are the React-18 equivalents of
// useActionState (React 19). See memory/feedback_react18_useformstate.md.
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { Button, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ReviewDecision } from '@/lib/api/form-review';

import { submitReviewAction, type ReviewActionState } from './_actions';

const INITIAL: ReviewActionState = { ok: false };

const DECISIONS: ReadonlyArray<{
  value: ReviewDecision;
  label: string;
  description: string;
}> = [
  {
    value: 'approved',
    label: 'Approve',
    description: 'Submission accepted as-is.',
  },
  {
    value: 'denied',
    label: 'Deny',
    description: 'Submission rejected.',
  },
  {
    value: 'requires_follow_up',
    label: 'Requires follow-up',
    description: 'Flag for client clarification.',
  },
  {
    value: 'reviewed',
    label: 'Mark reviewed',
    description: 'Acknowledge without a verdict.',
  },
];

interface ReviewActionsProps {
  submissionId: string;
  currentReviewStatus: string | null;
  currentNotes: string | null;
}

export function ReviewActions({
  submissionId,
  currentReviewStatus,
  currentNotes,
}: ReviewActionsProps) {
  const boundAction = submitReviewAction.bind(null, submissionId);
  const [state, formAction] = useFormState<ReviewActionState, FormData>(
    boundAction,
    INITIAL,
  );

  const [decision, setDecision] = useState<ReviewDecision | ''>(() => {
    // Pre-fill if a prior decision exists (allows revising without re-picking).
    if (
      currentReviewStatus === 'approved' ||
      currentReviewStatus === 'denied' ||
      currentReviewStatus === 'requires_follow_up' ||
      currentReviewStatus === 'reviewed'
    ) {
      return currentReviewStatus;
    }
    return '';
  });

  const submitLabel =
    currentReviewStatus && currentReviewStatus !== 'unreviewed'
      ? 'Update review'
      : 'Submit review';

  return (
    <form action={formAction} className="flex flex-col gap-s4">
      <fieldset className="flex flex-col gap-s3">
        <legend className="t-eyebrow uppercase tracking-wide text-ink-soft">
          Decision
        </legend>
        <div className="flex flex-col gap-s2">
          {DECISIONS.map((d) => {
            const selected = decision === d.value;
            return (
              <label
                key={d.value}
                className={cn(
                  'flex cursor-pointer flex-col gap-s1 rounded-md border px-s4 py-s3 transition-colors duration-fast',
                  selected
                    ? 'border-accent bg-accent-pale/40'
                    : 'border-surface-3 bg-white hover:bg-surface-2',
                )}
              >
                <span className="flex items-center gap-s2">
                  <input
                    type="radio"
                    name="decision"
                    value={d.value}
                    checked={selected}
                    onChange={() => setDecision(d.value)}
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="t-body-md font-medium text-ink">
                    {d.label}
                  </span>
                </span>
                <span className="ml-[24px] t-caption text-ink-soft">
                  {d.description}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-s2">
        <label
          htmlFor="review-notes"
          className="t-eyebrow uppercase tracking-wide text-ink-soft"
        >
          Notes (optional)
        </label>
        <Textarea
          id="review-notes"
          name="notes"
          rows={4}
          defaultValue={currentNotes ?? ''}
          maxLength={2000}
          placeholder="Add context for the audit trail or for the next reviewer."
        />
      </div>

      {state.error ? (
        <p className="t-body-sm text-red" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-body-sm text-green" role="status">
          Review saved.
        </p>
      ) : null}

      <SubmitButton label={submitLabel} disabled={decision === ''} />
    </form>
  );
}

function SubmitButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="accent"
      size="md"
      disabled={pending || disabled}
      loading={pending}
    >
      {label}
    </Button>
  );
}
