import Link from 'next/link';
import type { Route } from 'next';

import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { PublicClassInstanceDto } from '@/lib/api/public-booking-server';

// Phase 3b — single card for a bookable class instance. Capacity-aware CTA
// per spec:
//   spotsLeft >= 5         → "Book class" (primary)
//   1 <= spotsLeft < 5     → "Book" (primary) + urgency hint
//   spotsLeft == 0, waitlist available → "Join waitlist" (outlined)
//   otherwise              → "Class full" (disabled)
//
// Clicking the CTA pushes `?bookInstance=ID` onto the URL — the parent
// component renders the modal off that param.

export type CtaState = {
  label: string;
  variant: 'primary' | 'outlined' | 'disabled';
  urgency?: string;
};

export function ctaForInstance(instance: PublicClassInstanceDto): CtaState {
  const capacity = instance.capacityOverride ?? instance.class.maxCapacity;
  const spotsLeft = Math.max(0, capacity - instance.confirmedBookingCount);

  if (spotsLeft >= 5) {
    return { label: 'Book class', variant: 'primary' };
  }
  if (spotsLeft >= 1) {
    return {
      label: 'Book class',
      variant: 'primary',
      urgency:
        spotsLeft === 1 ? 'Only 1 spot left' : `Only ${spotsLeft} spots left`,
    };
  }

  const waitlistCap =
    instance.waitlistOverride ?? instance.class.waitlistLimit;
  if (instance.class.allowWaitlist && instance.waitlistCount < waitlistCap) {
    return { label: 'Join waitlist', variant: 'outlined' };
  }
  return { label: 'Class full', variant: 'disabled' };
}

function formatPrice(cents: number): string {
  if (cents === 0) return 'Free';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatWhen(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dayPart = start.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
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

function staffName(staff: { firstName: string; lastName: string | null }): string {
  return [staff.firstName, staff.lastName].filter(Boolean).join(' ').trim();
}

type Props = {
  instance: PublicClassInstanceDto;
  bookHref: string;
};

export function ClassInstanceCard({ instance, bookHref }: Props) {
  const cta = ctaForInstance(instance);
  const colorChip = instance.class.color ?? '#cbd5e1';

  return (
    <article className="flex flex-col gap-s3 rounded-2xl border border-surface-3 bg-white p-s5 shadow-sm">
      <div className="flex items-start gap-s3">
        <span
          aria-hidden
          className="mt-[6px] inline-block h-3 w-3 shrink-0 rounded-sm"
          style={{ backgroundColor: colorChip }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-s1">
          <h3 className="t-display-sm font-display text-ink">
            {instance.class.name}
          </h3>
          <span className="t-body-sm text-ink-soft">
            {formatWhen(instance.scheduledStartAt, instance.scheduledEndAt)}
          </span>
        </div>
        <Badge tone="neutral">
          {formatPrice(instance.class.basePriceCents)}
        </Badge>
      </div>

      <dl className="grid gap-s1 t-body-sm text-ink-soft">
        <div className="flex items-center gap-s2">
          <dt className="text-ink-soft">Instructor</dt>
          <dd className="text-ink">{staffName(instance.staff) || 'Staff'}</dd>
        </div>
        <div className="flex items-center gap-s2">
          <dt className="text-ink-soft">Location</dt>
          <dd className="text-ink">{instance.location.name}</dd>
        </div>
        <div className="flex items-center gap-s2">
          <dt className="text-ink-soft">Duration</dt>
          <dd className="text-ink">{instance.class.durationMinutes} min</dd>
        </div>
      </dl>

      {instance.class.shortDescription ? (
        <p className="t-body-sm text-ink-soft">
          {instance.class.shortDescription}
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-s2">
        {cta.urgency ? (
          <span className="t-caption font-medium text-amber-700">
            {cta.urgency}
          </span>
        ) : null}
        {cta.variant === 'disabled' ? (
          <Button variant="ghost" size="md" disabled className="w-full">
            {cta.label}
          </Button>
        ) : (
          <Link
            href={bookHref as Route}
            className={cn(
              'inline-flex w-full items-center justify-center rounded-md t-body-md font-medium no-underline px-s5 py-[10px]',
              'transition-[background-color,transform,box-shadow] duration-fast',
              'hover:-translate-y-px hover:shadow-md',
              'focus-visible:outline-none focus-visible:shadow-focus',
              cta.variant === 'primary'
                ? 'bg-accent text-white hover:bg-accent-mid'
                : 'border border-accent text-accent bg-white hover:bg-accent-pale',
            )}
          >
            {cta.label}
          </Link>
        )}
      </div>
    </article>
  );
}
