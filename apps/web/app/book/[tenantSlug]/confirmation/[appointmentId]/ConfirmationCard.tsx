'use client';

import { useState } from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import { NotYouModal } from './NotYouModal';

// Visual card for the public booking confirmation (docs/04-booking-flow.md
// §B Step 5). Headline copy varies by matchStrength: 'strong' returns
// "Welcome back, X." per the spec; everything else gets "You're all set,
// X." per Flow A's Step 5.

export type ConfirmationData = {
  appointmentId: string;
  state: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  service: { name: string };
  staff: { firstName: string };
  client: { firstName: string };
  clientMatchDisputed: boolean;
  matchStrength: 'strong' | 'weak' | 'name_only' | 'ambiguous' | null;
  tenant: { name: string; timezone: string };
  cancellationDeadline: string;
  cancellationFeeCents: number;
};

interface ConfirmationCardProps {
  data: ConfirmationData;
  tenantSlug: string;
  appointmentId: string;
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatWhen(iso: string, timezone: string): string {
  return new Date(iso).toLocaleString(undefined, {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDeadline(iso: string, timezone: string): string {
  return new Date(iso).toLocaleString(undefined, {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ConfirmationCard({
  data,
  tenantSlug: _tenantSlug,
  appointmentId,
}: ConfirmationCardProps) {
  // tenantSlug is currently unused by the modal (API resolves by cuid),
  // but it's part of the URL so we accept + retain it for future hooks.
  void _tenantSlug;

  const [modalOpen, setModalOpen] = useState(false);
  // Local mirror of the disputed flag — flips immediately after a
  // successful dispute submission so the footer copy updates without a
  // round-trip re-fetch.
  const [disputed, setDisputed] = useState<boolean>(data.clientMatchDisputed);

  const headline =
    data.matchStrength === 'strong'
      ? `Welcome back, ${data.client.firstName}.`
      : `You're all set, ${data.client.firstName}.`;

  const isRequested = data.state === 'requested';
  const isConfirmed = data.state === 'confirmed';

  const whenText = formatWhen(data.scheduledStartAt, data.tenant.timezone);
  const deadlineText = formatDeadline(
    data.cancellationDeadline,
    data.tenant.timezone,
  );

  // Cancellation disclosure copy mirrors the spec's wording variants.
  const cancellationCopy =
    data.cancellationFeeCents > 0
      ? `Free to cancel or reschedule until ${deadlineText}. A ${formatUsd(
          data.cancellationFeeCents,
        )} fee applies after that.`
      : `Free to cancel or reschedule until ${deadlineText}.`;

  return (
    <section className="rounded-2xl border border-surface-3 bg-white p-s7 shadow-sm">
      <span className="t-eyebrow text-accent">
        {isRequested ? 'Request received' : 'Confirmed'}
      </span>
      <h1 className="mt-s2 t-display-xl text-ink">{headline}</h1>

      {isRequested ? (
        <p className="mt-s3 t-body-md text-ink-soft">
          {data.tenant.name} will review your request and confirm by email.
        </p>
      ) : null}

      <div className="mt-s6 space-y-s2 rounded-2xl border border-surface-3 bg-surface px-s5 py-s4">
        <div className="flex justify-between gap-s3 border-b border-surface-3 py-s2 t-body-sm">
          <span className="text-ink-soft">Service</span>
          <strong className="text-ink">{data.service.name}</strong>
        </div>
        <div className="flex justify-between gap-s3 border-b border-surface-3 py-s2 t-body-sm">
          <span className="text-ink-soft">Provider</span>
          <strong className="text-ink">{data.staff.firstName}</strong>
        </div>
        <div className="flex justify-between gap-s3 py-s2 t-body-sm">
          <span className="text-ink-soft">When</span>
          <strong className="text-ink">{whenText}</strong>
        </div>
      </div>

      {isConfirmed || isRequested ? (
        <p className="mt-s5 t-body-md text-ink-soft">{cancellationCopy}</p>
      ) : null}

      <div className="mt-s6 flex flex-wrap gap-s3">
        <Button
          variant="ghost"
          size="md"
          type="button"
          disabled
          title="Calendar download arrives with the magic-link booking management surface."
          className={cn('border border-surface-3 bg-white shadow-sm')}
        >
          Add to calendar
        </Button>
        <Button
          variant="ghost"
          size="md"
          type="button"
          disabled
          title="Available soon"
          className={cn('border border-surface-3 bg-white shadow-sm')}
        >
          Manage booking
        </Button>
      </div>

      <footer className="mt-s8 border-t border-surface-3 pt-s5 t-body-sm text-ink-soft">
        {disputed ? (
          <p>We&apos;ve flagged this for the staff team to review.</p>
        ) : (
          <p>
            Booking as{' '}
            <strong className="text-ink">{data.client.firstName}</strong> — not
            you?{' '}
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className={cn(
                'inline-flex items-center font-medium text-accent underline underline-offset-2',
                'hover:text-accent-mid focus-visible:outline-none focus-visible:shadow-focus',
              )}
            >
              This isn&apos;t me
            </button>
          </p>
        )}
      </footer>

      <NotYouModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        appointmentId={appointmentId}
        clientFirstName={data.client.firstName}
        onResolved={() => setDisputed(true)}
      />
    </section>
  );
}
