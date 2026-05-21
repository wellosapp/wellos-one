'use client';

import { useState, useTransition } from 'react';

import { Button, Textarea } from '@/components/ui';

import type { ManageAppointmentView } from './_api';
import { cancelManageAction } from './_actions';
import {
  formatFullWhen,
  formatRange,
  isPastCancellationDeadline,
} from './format';
import { SuccessCard } from './SuccessCard';

interface CancelCardProps {
  token: string;
  view: ManageAppointmentView;
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function CancelCard({ token, view }: CancelCardProps) {
  const { appointment, cancelAllowed } = view;
  const [reason, setReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const pastDeadline = isPastCancellationDeadline(
    appointment.cancellationDeadline,
  );
  const feeApplies = pastDeadline && appointment.cancellationFeeCents > 0;

  if (done) {
    return (
      <SuccessCard
        token={token}
        title={`Appointment cancelled. Sorry to miss you, ${appointment.client.firstName}.`}
        body={`We've cancelled your ${appointment.service.name} on ${formatFullWhen(
          appointment.scheduledStartAt,
        )}.`}
      />
    );
  }

  if (!cancelAllowed) {
    return (
      <div className="rounded-2xl border border-surface-3 bg-white p-s7 shadow-sm">
        <span className="t-eyebrow text-accent">Cancel</span>
        <h1 className="mt-s2 t-display-md text-ink">
          This appointment can&apos;t be cancelled online.
        </h1>
        <p className="mt-s3 t-body-md text-ink-soft">
          It may already be completed or cancelled. Contact the business if you
          need help.
        </p>
        <div className="mt-s5">
          <a
            href={`/manage/${encodeURIComponent(token)}`}
            className="no-underline"
          >
            <Button
              variant="ghost"
              size="md"
              type="button"
              className="border border-surface-3 bg-white shadow-sm"
            >
              Back
            </Button>
          </a>
        </div>
      </div>
    );
  }

  const onSubmit = () => {
    setErrorMessage(null);
    startTransition(() => {
      void (async () => {
        const res = await cancelManageAction({
          token,
          reason: reason.trim() || undefined,
        });
        if (res.ok) {
          setDone(true);
          return;
        }
        setErrorMessage(res.message);
      })();
    });
  };

  return (
    <div className="rounded-2xl border border-surface-3 bg-white p-s7 shadow-sm">
      <span className="t-eyebrow text-accent">Cancel</span>
      <h1 className="mt-s2 t-display-md text-ink">
        Cancel your appointment?
      </h1>

      <div className="mt-s5 rounded-2xl border border-surface-3 bg-surface px-s5 py-s4">
        <div className="flex justify-between gap-s3 border-b border-surface-3 py-s2 t-body-sm">
          <span className="text-ink-soft">Service</span>
          <strong className="text-ink">{appointment.service.name}</strong>
        </div>
        <div className="flex justify-between gap-s3 border-b border-surface-3 py-s2 t-body-sm">
          <span className="text-ink-soft">Provider</span>
          <strong className="text-ink">{appointment.staff.firstName}</strong>
        </div>
        <div className="flex justify-between gap-s3 py-s2 t-body-sm">
          <span className="text-ink-soft">When</span>
          <strong className="text-ink">
            {formatFullWhen(appointment.scheduledStartAt)} ·{' '}
            {formatRange(
              appointment.scheduledStartAt,
              appointment.scheduledEndAt,
            )}
          </strong>
        </div>
      </div>

      <p
        className={
          feeApplies
            ? 'mt-s4 rounded-xl border border-amber-200 bg-amber-50 px-s4 py-s3 t-body-sm text-ink'
            : 'mt-s4 t-body-sm text-ink-soft'
        }
      >
        {feeApplies
          ? `You're past the cancellation window. A fee of ${formatUsd(
              appointment.cancellationFeeCents,
            )} may apply.`
          : 'Free to cancel — no fee applies.'}
      </p>

      <label className="mt-s5 flex flex-col gap-s2">
        <span className="t-caption font-semibold text-ink">
          Reason (optional)
        </span>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Anything we should know? (optional)"
          maxLength={500}
          rows={3}
        />
      </label>

      {errorMessage ? (
        <p
          className="mt-s4 rounded-xl border border-red-200 bg-red-50 px-s3 py-s3 t-body-sm text-red-900"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-s6 flex flex-wrap gap-s3">
        <Button
          variant="accent"
          size="md"
          type="button"
          loading={pending}
          onClick={onSubmit}
        >
          Yes, cancel this appointment
        </Button>
        <a
          href={`/manage/${encodeURIComponent(token)}`}
          className="no-underline"
        >
          <Button
            variant="ghost"
            size="md"
            type="button"
            className="border border-surface-3 bg-white shadow-sm"
          >
            Keep appointment
          </Button>
        </a>
      </div>
    </div>
  );
}
