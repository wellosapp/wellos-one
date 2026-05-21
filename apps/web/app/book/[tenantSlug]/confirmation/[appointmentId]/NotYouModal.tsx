'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import { submitDisputeMatchAction } from './_actions';

// "This isn't me" modal (docs/04-booking-flow.md §B + "Not You?" escape
// hatch). Two paths per spec:
//   1. "I'm new" → form (must use the same booking email) →
//      POST dispute-match with branch='i_am_new'.
//   2. "I'm [First Name] — use that account" → magic-link verification
//      is deferred to the magic-link epic. Per the PR brief, the click
//      posts branch='wrong_person' to flag for staff review.

type Step = 'choice' | 'i_am_new' | 'i_am_new_done' | 'wrong_person_done';

interface NotYouModalProps {
  open: boolean;
  onClose: () => void;
  appointmentId: string;
  clientFirstName: string;
  /** Fires after the API call returns 2xx for either branch. */
  onResolved: () => void;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random()}`;
}

export function NotYouModal({
  open,
  onClose,
  appointmentId,
  clientFirstName,
  onResolved,
}: NotYouModalProps) {
  const [step, setStep] = useState<Step>('choice');
  const [pending, startTransition] = useTransition();

  // "I'm new" form state.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailMismatch, setEmailMismatch] = useState(false);

  if (!open) return null;

  const reset = () => {
    setStep('choice');
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setErrorMessage(null);
    setEmailMismatch(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submitWrongPerson = () => {
    setErrorMessage(null);
    startTransition(() => {
      void (async () => {
        const res = await submitDisputeMatchAction({
          appointmentId,
          branch: 'wrong_person',
          idempotencyKey: newIdempotencyKey(),
        });
        if (res.ok) {
          onResolved();
          setStep('wrong_person_done');
          return;
        }
        // ALREADY_DISPUTED also resolves the user-visible state, so treat
        // it as a done-screen rather than an error.
        if (res.code === 'ALREADY_DISPUTED') {
          onResolved();
          setStep('wrong_person_done');
          return;
        }
        setErrorMessage(res.message);
      })();
    });
  };

  const submitIamNew = () => {
    setErrorMessage(null);
    setEmailMismatch(false);
    if (!firstName.trim()) {
      setErrorMessage('First name is required.');
      return;
    }
    if (!email.trim()) {
      setErrorMessage('Email is required.');
      return;
    }
    startTransition(() => {
      void (async () => {
        const res = await submitDisputeMatchAction({
          appointmentId,
          branch: 'i_am_new',
          idempotencyKey: newIdempotencyKey(),
          newClient: {
            firstName: firstName.trim(),
            lastName: lastName.trim() || undefined,
            email: email.trim(),
            phone: phone.trim() || undefined,
          },
        });
        if (res.ok) {
          onResolved();
          setStep('i_am_new_done');
          return;
        }
        if (res.code === 'EMAIL_MISMATCH') {
          setEmailMismatch(true);
          setErrorMessage(res.message);
          return;
        }
        setErrorMessage(res.message);
      })();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[3px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="This isn't me"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={handleClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative z-10 w-full max-w-[520px] rounded-t-3xl bg-white shadow-lg sm:rounded-3xl">
        <header className="flex items-start justify-between gap-s4 border-b border-surface-3 px-s6 py-s5">
          <div className="flex flex-col gap-s1">
            <span className="t-eyebrow text-accent">Account check</span>
            <h2 className="t-display-md text-ink">
              {step === 'choice' && 'Quick question'}
              {step === 'i_am_new' && 'Tell us a bit about you'}
              {step === 'i_am_new_done' && 'Re-attached to a new account'}
              {step === 'wrong_person_done' && 'Flagged for the staff team'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft',
              'transition-colors duration-fast hover:bg-surface-2 hover:text-ink',
              'focus-visible:outline-none focus-visible:shadow-focus',
            )}
            aria-label="Close"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto px-s6 py-s5">
          {step === 'choice' ? (
            <div className="flex flex-col gap-s4">
              <p className="t-body-md text-ink">
                No problem. Is this your first time booking with us, or are you{' '}
                <strong className="text-ink">{clientFirstName}</strong> and just
                want to use a different account?
              </p>
              {errorMessage ? (
                <p
                  className="rounded-xl border border-red-200 bg-red-50 px-s3 py-s3 t-body-sm text-red-900"
                  role="alert"
                >
                  {errorMessage}
                </p>
              ) : null}
              <div className="flex flex-col gap-s3 sm:flex-row">
                <Button
                  variant="accent"
                  size="md"
                  type="button"
                  className="flex-1"
                  disabled={pending}
                  onClick={() => {
                    setErrorMessage(null);
                    setStep('i_am_new');
                  }}
                >
                  I&apos;m new
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  type="button"
                  className="flex-1 border border-surface-3 bg-white shadow-sm"
                  disabled={pending}
                  onClick={submitWrongPerson}
                >
                  {pending
                    ? 'Submitting…'
                    : `I'm ${clientFirstName} — use that account`}
                </Button>
              </div>
            </div>
          ) : null}

          {step === 'i_am_new' ? (
            <div className="flex flex-col gap-s4">
              <p className="t-body-sm text-ink-soft">
                We&apos;ll attach this appointment to a new account. Use the
                same email you booked with — the system enforces this so we
                don&apos;t move bookings onto a stranger&apos;s inbox.
              </p>
              <div className="grid gap-s4 sm:grid-cols-2">
                <label className="flex flex-col gap-s2">
                  <span className="t-caption font-semibold text-ink">
                    First name
                  </span>
                  <input
                    className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink shadow-sm"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                  />
                </label>
                <label className="flex flex-col gap-s2">
                  <span className="t-caption font-semibold text-ink">
                    Last name
                  </span>
                  <input
                    className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink shadow-sm"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-s2">
                <span className="t-caption font-semibold text-ink">Email</span>
                <input
                  className={cn(
                    'rounded-xl border px-s3 py-s3 t-body-md text-ink shadow-sm',
                    emailMismatch
                      ? 'border-red-300 bg-red-50'
                      : 'border-surface-3',
                  )}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailMismatch) setEmailMismatch(false);
                  }}
                  autoComplete="email"
                  inputMode="email"
                />
                <span className="t-caption text-ink-soft">
                  Must match the email you used to book.
                </span>
              </label>
              <label className="flex flex-col gap-s2">
                <span className="t-caption font-semibold text-ink">
                  Phone (optional)
                </span>
                <input
                  className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink shadow-sm"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                />
              </label>

              {errorMessage ? (
                <p
                  className="rounded-xl border border-red-200 bg-red-50 px-s3 py-s3 t-body-sm text-red-900"
                  role="alert"
                >
                  {errorMessage}
                </p>
              ) : null}

              <div className="flex flex-col gap-s3 sm:flex-row">
                <Button
                  variant="ghost"
                  size="md"
                  type="button"
                  className="flex-1 border border-surface-3 bg-white shadow-sm"
                  disabled={pending}
                  onClick={() => {
                    setErrorMessage(null);
                    setEmailMismatch(false);
                    setStep('choice');
                  }}
                >
                  Back
                </Button>
                <Button
                  variant="accent"
                  size="md"
                  type="button"
                  className="flex-1"
                  disabled={pending}
                  onClick={submitIamNew}
                >
                  {pending ? 'Submitting…' : 'Create new account'}
                </Button>
              </div>
            </div>
          ) : null}

          {step === 'i_am_new_done' ? (
            <div className="flex flex-col gap-s4">
              <p className="t-body-md text-ink">
                Done — this appointment is now on a fresh account. The original
                account&apos;s details are untouched. A new confirmation email
                is on its way.
              </p>
              <Button
                variant="primary"
                size="md"
                type="button"
                className="w-full"
                onClick={handleClose}
              >
                Got it
              </Button>
            </div>
          ) : null}

          {step === 'wrong_person_done' ? (
            <div className="flex flex-col gap-s4">
              <p className="t-body-md text-ink">
                Flagged for the staff team to review. They&apos;ll reach out if
                they need anything else — there&apos;s nothing more for you to
                do right now.
              </p>
              <p className="t-body-sm text-ink-soft">
                Email-based account verification (magic link) arrives in a
                later release. Until then, staff handle account merges
                manually.
              </p>
              <Button
                variant="primary"
                size="md"
                type="button"
                className="w-full"
                onClick={handleClose}
              >
                Got it
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
