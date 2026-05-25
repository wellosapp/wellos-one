'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Button, FormField, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { PublicClassInstanceDto } from '@/lib/api/public-booking-server';

import { submitPublicClassBookingAction } from './_actions';
import { ctaForInstance } from './ClassInstanceCard';

// Phase 3b — guest booking modal for a single class instance. Client
// component (form state + transition). Idempotency key is generated on
// submit so re-clicking "Book" without changing inputs replays the cached
// response server-side.

type Props = {
  instance: PublicClassInstanceDto;
  tenantSlug: string;
  closeHref: string;
  // Used for the cancellation-policy hint copy. Phase 3b only displays the
  // window; enforcement lands in Phase 3c (magic-link cancel flow).
  cancellationWindowHours?: number;
};

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; tone: 'booking' | 'waitlist'; copy: string };

function formatWhen(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dayPart = start.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const startTime = start.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const endTime = end.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${dayPart} · ${startTime} – ${endTime}`;
}

function formatPrice(cents: number): string {
  if (cents === 0) return 'Free';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatConfirmation(startIso: string): string {
  const start = new Date(startIso);
  const weekday = start.toLocaleDateString(undefined, { weekday: 'long' });
  const time = start.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `We'll see you ${weekday} at ${time}.`;
}

export function BookClassModal({
  instance,
  tenantSlug,
  closeHref,
  cancellationWindowHours,
}: Props) {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });
  const [pending, startTransition] = useTransition();

  // Esc-to-close.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push(closeHref as Route);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router, closeHref]);

  // Body scroll lock while modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const cta = ctaForInstance(instance);
  const submitLabel =
    cta.variant === 'outlined' ? 'Join waitlist' : 'Book class';
  const isFull = cta.variant === 'disabled';

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isFull) return;
    setState({ kind: 'idle' });

    if (!firstName.trim() || !email.trim()) {
      setState({
        kind: 'error',
        message: 'First name and email are required.',
      });
      return;
    }

    // Generated client-side via crypto.randomUUID — the server's
    // withIdempotency middleware caches the response under this key for
    // 24h, so accidental double-clicks replay the same response.
    const idempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    startTransition(() => {
      void (async () => {
        const res = await submitPublicClassBookingAction({
          tenantSlug,
          classInstanceId: instance.id,
          idempotencyKey,
          guest: {
            firstName: firstName.trim(),
            lastName: lastName.trim() || undefined,
            email: email.trim(),
            phone: phone.trim() || undefined,
          },
        });

        if (!res.ok) {
          setState({ kind: 'error', message: res.message });
          return;
        }

        if (res.result.kind === 'booking') {
          setState({
            kind: 'success',
            tone: 'booking',
            copy: `Confirmed! ${formatConfirmation(instance.scheduledStartAt)}`,
          });
        } else {
          setState({
            kind: 'success',
            tone: 'waitlist',
            copy: `You're #${res.result.position} on the waitlist. We'll notify you if a spot opens.`,
          });
        }
      })();
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Book class"
    >
      <Link
        href={closeHref as Route}
        aria-label="Close booking modal"
        className="absolute inset-0 cursor-default bg-ink/[0.42] backdrop-blur-[3px]"
      />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-lg sm:rounded-2xl">
        <header className="flex shrink-0 items-start justify-between gap-s4 border-b border-surface-3 bg-white px-s6 py-s5">
          <div className="flex flex-col gap-s1">
            <h2 className="t-display-md text-ink">{instance.class.name}</h2>
            <span className="t-body-sm text-ink-soft">
              {formatWhen(
                instance.scheduledStartAt,
                instance.scheduledEndAt,
              )}
            </span>
            <span className="t-body-sm text-ink-soft">
              {instance.location.name}
            </span>
          </div>
          <Link
            href={closeHref as Route}
            aria-label="Close"
            className={cn(
              'inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-soft',
              'transition-colors duration-fast hover:bg-surface-2 hover:text-ink',
            )}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </Link>
        </header>

        <div className="flex-1 overflow-y-auto px-s6 py-s5">
          {state.kind === 'success' ? (
            <div
              className={cn(
                'rounded-2xl border px-s5 py-s5 t-body-md',
                state.tone === 'booking'
                  ? 'border-accent-mid bg-accent-pale text-ink'
                  : 'border-amber-200 bg-amber-50 text-ink',
              )}
              role="status"
            >
              {state.copy}
            </div>
          ) : (
            <form
              id="class-booking-form"
              onSubmit={onSubmit}
              className="flex flex-col gap-s4"
              noValidate
            >
              <dl className="grid grid-cols-2 gap-s3 rounded-xl bg-surface-2 px-s4 py-s3 t-body-sm">
                <div>
                  <dt className="text-ink-soft">Duration</dt>
                  <dd className="text-ink">
                    {instance.class.durationMinutes} min
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Price</dt>
                  <dd className="text-ink">
                    {formatPrice(instance.class.basePriceCents)}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-soft">Instructor</dt>
                  <dd className="text-ink">
                    {[instance.staff.firstName, instance.staff.lastName]
                      .filter(Boolean)
                      .join(' ') || 'Staff'}
                  </dd>
                </div>
                {cta.urgency ? (
                  <div>
                    <dt className="text-ink-soft">Availability</dt>
                    <dd className="font-medium text-amber-700">{cta.urgency}</dd>
                  </div>
                ) : null}
              </dl>

              {cancellationWindowHours !== undefined ? (
                <p className="t-body-sm text-ink-soft">
                  Free cancellation up to {cancellationWindowHours} hour
                  {cancellationWindowHours === 1 ? '' : 's'} before class.
                </p>
              ) : null}

              <div className="grid gap-s3 sm:grid-cols-2">
                <FormField label="First name" htmlFor="class-first-name" required>
                  <Input
                    id="class-first-name"
                    name="firstName"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </FormField>
                <FormField label="Last name" htmlFor="class-last-name">
                  <Input
                    id="class-last-name"
                    name="lastName"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </FormField>
              </div>

              <FormField label="Email" htmlFor="class-email" required>
                <Input
                  id="class-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </FormField>

              <FormField label="Phone" htmlFor="class-phone">
                <Input
                  id="class-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </FormField>

              {state.kind === 'error' ? (
                <div
                  className="rounded-md border border-red-200 bg-red-50 px-s4 py-s3 t-body-sm text-red-900"
                  role="alert"
                >
                  {state.message}
                </div>
              ) : null}

              <p className="t-body-sm text-ink-soft">
                Payment will be collected at class. Online payments coming
                soon.
              </p>
            </form>
          )}
        </div>

        <footer className="shrink-0 border-t border-surface-3 bg-white px-s6 py-s5">
          {state.kind === 'success' ? (
            <Link
              href={closeHref as Route}
              className={cn(
                'inline-flex w-full items-center justify-center rounded-md bg-accent px-s5 py-[10px] t-body-md font-medium text-white no-underline',
                'transition-[background-color] duration-fast hover:bg-accent-mid',
              )}
            >
              Done
            </Link>
          ) : (
            <Button
              type="submit"
              form="class-booking-form"
              variant="accent"
              size="md"
              loading={pending}
              disabled={isFull}
              className="w-full"
            >
              {isFull ? 'Class full' : submitLabel}
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
