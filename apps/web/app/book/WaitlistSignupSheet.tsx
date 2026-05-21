'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import { submitPublicWaitlistAction } from './_actions';

// R2 §10 — public waitlist signup. Rendered as a centered modal overlay
// from BookPageBody. The parent controls open/close and wires the
// service / staff / location pre-fills so the user doesn't have to
// re-pick what they already selected on the booking page.

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'any';

const TIME_OF_DAY_CHOICES: Array<{ value: TimeOfDay; label: string }> = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'any', label: 'Any time' },
];

interface WaitlistSignupSheetProps {
  open: boolean;
  onClose: () => void;
  tenantSlug: string;
  locationId: string | null;
  serviceId: string | null;
  serviceName: string;
  staffId: string | null;
  staffName: string;
  /** Pre-fill from a date the user was browsing (YYYY-MM-DD). */
  defaultPreferredDate?: string;
}

export function WaitlistSignupSheet({
  open,
  onClose,
  tenantSlug,
  locationId,
  serviceId,
  serviceName,
  staffId,
  staffName,
  defaultPreferredDate,
}: WaitlistSignupSheetProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [startDate, setStartDate] = useState(defaultPreferredDate ?? '');
  const [endDate, setEndDate] = useState('');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('any');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [doneTtl, setDoneTtl] = useState<string | null>(null);

  if (!open) return null;

  const ready =
    Boolean(tenantSlug) &&
    Boolean(locationId) &&
    Boolean(serviceId) &&
    name.trim().length > 0 &&
    (email.trim().length > 0 || phone.trim().length > 0) &&
    smsOptIn;

  const reset = () => {
    setName('');
    setEmail('');
    setPhone('');
    setStartDate(defaultPreferredDate ?? '');
    setEndDate('');
    setTimeOfDay('any');
    setSmsOptIn(false);
    setNotes('');
    setErrorMessage(null);
    setDoneTtl(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = () => {
    setErrorMessage(null);
    if (!tenantSlug || !locationId || !serviceId) {
      setErrorMessage('Pick a service and location first.');
      return;
    }
    if (!name.trim()) {
      setErrorMessage('Name is required.');
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setErrorMessage(
        'Provide an email or phone so we can reach you about an opening.',
      );
      return;
    }
    if (!smsOptIn) {
      setErrorMessage('You need to opt in to SMS to join the waitlist.');
      return;
    }

    // ISO 8601 with a fixed UTC midnight — the server doesn't render this,
    // it just stores the window. Booking surfaces interpret in location TZ.
    const preferredStart = startDate
      ? new Date(`${startDate}T00:00:00.000Z`).toISOString()
      : undefined;
    const preferredEnd = endDate
      ? new Date(`${endDate}T23:59:59.000Z`).toISOString()
      : undefined;

    startTransition(() => {
      void (async () => {
        const res = await submitPublicWaitlistAction({
          tenantSlug,
          locationId,
          serviceId,
          staffId: staffId ?? undefined,
          contactName: name.trim(),
          contactEmail: email.trim() || undefined,
          contactPhone: phone.trim() || undefined,
          preferredStart,
          preferredEnd,
          preferredTimeOfDay: timeOfDay,
          smsOptIn,
          notes: notes.trim() || undefined,
        });
        if (res.ok) {
          setDoneTtl(res.result.ttlExpiresAt);
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
      aria-label="Join the waitlist"
    >
      <button
        type="button"
        aria-label="Close waitlist overlay"
        onClick={handleClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative z-10 w-full max-w-[520px] rounded-t-3xl bg-white shadow-lg sm:rounded-3xl">
        <header className="flex items-start justify-between gap-s4 border-b border-surface-3 px-s6 py-s5">
          <div className="flex flex-col gap-s1">
            <span className="t-eyebrow text-accent">Waitlist</span>
            <h2 className="t-display-md text-ink">Join the waitlist</h2>
            <p className="t-body-sm text-ink-soft">
              {serviceName} · {staffName === '—' ? 'Any provider' : staffName}
            </p>
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
          {doneTtl ? (
            <div className="flex flex-col gap-s3">
              <p className="t-body-md text-ink">
                You&apos;re on the list. We&apos;ll reach out as soon as a slot
                opens up.
              </p>
              <p className="t-body-sm text-ink-soft">
                Your waitlist entry stays active until{' '}
                <strong className="text-ink">
                  {new Date(doneTtl).toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </strong>
                .
              </p>
              <Button
                variant="primary"
                size="md"
                type="button"
                className="mt-s4 w-full"
                onClick={handleClose}
              >
                Done
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-s4">
              <label className="flex flex-col gap-s2">
                <span className="t-caption font-semibold text-ink">
                  Your name
                </span>
                <input
                  className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink shadow-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
              <div className="grid gap-s4 sm:grid-cols-2">
                <label className="flex flex-col gap-s2">
                  <span className="t-caption font-semibold text-ink">
                    Email
                  </span>
                  <input
                    className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink shadow-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                  />
                </label>
                <label className="flex flex-col gap-s2">
                  <span className="t-caption font-semibold text-ink">
                    Phone
                  </span>
                  <input
                    className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink shadow-sm"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </label>
              </div>
              <p className="t-body-sm text-ink-soft">
                We need at least one — email or phone — so we can reach you.
              </p>

              <div className="grid gap-s4 sm:grid-cols-2">
                <label className="flex flex-col gap-s2">
                  <span className="t-caption font-semibold text-ink">
                    Earliest date
                  </span>
                  <input
                    type="date"
                    className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink shadow-sm"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-s2">
                  <span className="t-caption font-semibold text-ink">
                    Latest date
                  </span>
                  <input
                    type="date"
                    className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink shadow-sm"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </label>
              </div>

              <div className="flex flex-col gap-s2">
                <span className="t-caption font-semibold text-ink">
                  Preferred time of day
                </span>
                <div className="flex flex-wrap gap-s2">
                  {TIME_OF_DAY_CHOICES.map((choice) => {
                    const active = timeOfDay === choice.value;
                    return (
                      <button
                        key={choice.value}
                        type="button"
                        onClick={() => setTimeOfDay(choice.value)}
                        className={cn(
                          'rounded-full px-s4 py-s2 t-body-sm font-medium transition-colors duration-fast',
                          active
                            ? 'bg-accent text-white shadow-sm'
                            : 'border border-surface-3 bg-white text-ink-soft hover:bg-surface-2 hover:text-ink',
                        )}
                      >
                        {choice.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-start gap-s3 rounded-xl border border-surface-3 bg-surface px-s4 py-s3">
                <input
                  type="checkbox"
                  checked={smsOptIn}
                  onChange={(e) => setSmsOptIn(e.target.checked)}
                  className="mt-1"
                />
                <span className="t-body-sm text-ink">
                  Text me when a slot opens.{' '}
                  <span className="text-ink-soft">
                    Standard SMS rates may apply. Reply STOP to opt out.
                  </span>
                </span>
              </label>

              <label className="flex flex-col gap-s2">
                <span className="t-caption font-semibold text-ink">
                  Notes
                </span>
                <textarea
                  className="rounded-xl border border-surface-3 px-s3 py-s3 t-body-md text-ink shadow-sm"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything we should know — preferred staff, accessibility, etc."
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

              <Button
                variant="accent"
                size="md"
                type="button"
                className="mt-s2 w-full"
                disabled={pending || !ready}
                onClick={onSubmit}
              >
                {pending ? 'Joining waitlist…' : 'Join the waitlist'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
