'use client';

import { Badge, Button } from '@/components/ui';

import type { ManageAppointmentView } from './_api';
import {
  formatFullWhen,
  formatRange,
  isPastCancellationDeadline,
} from './format';

interface ViewCardProps {
  token: string;
  view: ManageAppointmentView;
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function ViewCard({ token, view }: ViewCardProps) {
  const { appointment, rescheduleAllowed, cancelAllowed } = view;
  const pastDeadline = isPastCancellationDeadline(
    appointment.cancellationDeadline,
  );
  const feeApplies = pastDeadline && appointment.cancellationFeeCents > 0;
  const cancelled = appointment.state === 'cancelled';

  return (
    <div className="rounded-2xl border border-surface-3 bg-white p-s7 shadow-sm">
      <span className="t-eyebrow text-accent">Manage your visit</span>
      <h1 className="mt-s2 t-display-lg text-ink">
        Hi {appointment.client.firstName} — here is your appointment.
      </h1>
      <p className="mt-s3 t-body-md text-ink-soft">
        {appointment.service.name} with {appointment.staff.firstName}.
      </p>

      <div className="mt-s6 rounded-2xl border border-surface-3 bg-surface px-s5 py-s4">
        <div className="flex justify-between gap-s3 border-b border-surface-3 py-s2 t-body-sm">
          <span className="text-ink-soft">When</span>
          <strong className="text-ink">
            {formatFullWhen(appointment.scheduledStartAt)}
          </strong>
        </div>
        <div className="flex justify-between gap-s3 border-b border-surface-3 py-s2 t-body-sm">
          <span className="text-ink-soft">Time</span>
          <strong className="text-ink">
            {formatRange(
              appointment.scheduledStartAt,
              appointment.scheduledEndAt,
            )}{' '}
            · {appointment.service.durationMinutes} min
          </strong>
        </div>
        <div className="flex justify-between gap-s3 border-b border-surface-3 py-s2 t-body-sm">
          <span className="text-ink-soft">Service</span>
          <strong className="text-ink">{appointment.service.name}</strong>
        </div>
        <div className="flex justify-between gap-s3 py-s2 t-body-sm">
          <span className="text-ink-soft">Provider</span>
          <strong className="text-ink">{appointment.staff.firstName}</strong>
        </div>
      </div>

      <div className="mt-s5 flex flex-wrap gap-s2">
        <Badge tone={cancelled ? 'neutral' : 'accent'}>
          {cancelled ? 'Cancelled' : appointment.state.replace('_', ' ')}
        </Badge>
        {feeApplies ? (
          <Badge tone="neutral">
            Cancellation fee: {formatUsd(appointment.cancellationFeeCents)}
          </Badge>
        ) : null}
      </div>

      {cancelled ? (
        <p className="mt-s5 t-body-md text-ink-soft">
          This appointment has been cancelled. Contact the business if this was
          a mistake.
        </p>
      ) : (
        <div className="mt-s6 flex flex-wrap gap-s3">
          {rescheduleAllowed ? (
            // typedRoutes doesn't know about dynamic [token] sub-views via
            // searchParams — use plain anchors for the mode switch.
            <a
              href={`/manage/${encodeURIComponent(token)}?mode=reschedule`}
              className="no-underline"
            >
              <Button variant="accent" size="md" type="button">
                Reschedule
              </Button>
            </a>
          ) : null}
          {cancelAllowed ? (
            <a
              href={`/manage/${encodeURIComponent(token)}?mode=cancel`}
              className="no-underline"
            >
              <Button
                variant="ghost"
                size="md"
                type="button"
                className="border border-surface-3 bg-white shadow-sm"
              >
                Cancel appointment
              </Button>
            </a>
          ) : null}
        </div>
      )}

      {!rescheduleAllowed && !cancelAllowed && !cancelled ? (
        <p className="mt-s5 t-body-md text-ink-soft">
          This appointment can&apos;t be changed online — contact the business if you
          need help.
        </p>
      ) : null}
    </div>
  );
}
