'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Alert, Badge, Button, Card } from '@/components/ui';
import type {
  Appointment,
  AppointmentState,
} from '@/lib/api/appointments';
import type { ClientNoteSummary } from '@/lib/api/client-notes';
import type { ClientWithTags } from '@/lib/api/clients';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';
import {
  formatDateTimeLocal,
  formatTimeLocal,
} from '@/lib/calendar';

import { cn } from '@/lib/cn';

import {
  approveAppointmentAction,
  declineAppointmentAction,
  transitionAppointmentAction,
} from '../_actions';

// Map current state → list of allowed next states. Mirrors the lifecycle
// guard in apps/api/src/services/appointmentService.ts. Server is still
// authoritative — these just hide buttons that would always 400.
// `requested` is handled by dedicated Approve / Decline buttons below — keep
// it out of the generic transition list so it doesn't render as another chip.
const NEXT_STATES: Record<AppointmentState, AppointmentState[]> = {
  requested: [],
  scheduled: ['confirmed', 'checked_in', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

const STATE_LABEL: Record<AppointmentState, string> = {
  requested: 'Requested',
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

const STATE_BADGE_TONE: Record<
  AppointmentState,
  'neutral' | 'accent' | 'amber' | 'green' | 'red'
> = {
  requested: 'amber',
  scheduled: 'neutral',
  confirmed: 'accent',
  checked_in: 'amber',
  in_progress: 'amber',
  completed: 'green',
  cancelled: 'red',
  no_show: 'red',
};

const ACTION_LABEL: Record<AppointmentState, string> = {
  requested: 'Mark requested',
  scheduled: 'Mark scheduled',
  confirmed: 'Confirm',
  checked_in: 'Check in',
  in_progress: 'Start service',
  completed: 'Complete',
  cancelled: 'Cancel',
  no_show: 'No-show',
};

interface OverviewTabProps {
  appointment: Appointment;
  client: ClientWithTags;
  service: Service | null;
  staff: Staff | null;
  /** CRM notes with `appointmentId` set (e.g. Quick Book visit-linked note). */
  linkedAppointmentNotes?: ClientNoteSummary[];
}

export function OverviewTab({
  appointment,
  service,
  staff,
  linkedAppointmentNotes = [],
}: OverviewTabProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const allowed = NEXT_STATES[appointment.state];

  const fire = (to: AppointmentState) => {
    setError(null);
    startTransition(async () => {
      const result = await transitionAppointmentAction(appointment.id, to);
      if (!result.ok) {
        setError(result.error ?? 'Action failed.');
        return;
      }
      // revalidatePath() runs server-side; nudge the router so the new state
      // streams in.
      router.refresh();
    });
  };

  // R2 §11.2 — staff approve/decline a request_approval booking.
  const fireApprove = () => {
    setError(null);
    startTransition(async () => {
      const result = await approveAppointmentAction(appointment.id);
      if (!result.ok) {
        setError(result.error ?? 'Approve failed.');
        return;
      }
      router.refresh();
    });
  };

  const fireDecline = () => {
    setError(null);
    startTransition(async () => {
      const result = await declineAppointmentAction(appointment.id);
      if (!result.ok) {
        setError(result.error ?? 'Decline failed.');
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-s5">
      {error && <Alert tone="error">{error}</Alert>}

      <section className="flex flex-col gap-s3">
        <div className="flex items-center gap-s2">
          <Badge tone={STATE_BADGE_TONE[appointment.state]}>
            {STATE_LABEL[appointment.state]}
          </Badge>
          {appointment.source && (
            <Badge tone="neutral">via {appointment.source.replace('_', ' ')}</Badge>
          )}
        </div>

        <Card padding="md" className="border border-surface-3">
          <dl className="grid grid-cols-1 gap-s3 sm:grid-cols-2">
            <div className="flex flex-col gap-s1">
              <dt className="t-caption text-ink-soft">Service</dt>
              <dd className="t-body-md text-ink">
                {service?.name ?? 'Unknown service'}
                {service && (
                  <span className="t-body-sm text-ink-soft">
                    {' '}· {service.durationMinutes} min
                  </span>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-s1">
              <dt className="t-caption text-ink-soft">Staff</dt>
              <dd className="t-body-md text-ink">
                {staff
                  ? `${staff.firstName}${staff.lastName ? ' ' + staff.lastName : ''}`
                  : 'Unknown staff'}
              </dd>
            </div>
            <div className="flex flex-col gap-s1">
              <dt className="t-caption text-ink-soft">Starts</dt>
              <dd className="t-body-md text-ink">
                {formatDateTimeLocal(appointment.scheduledStartAt)}
              </dd>
            </div>
            <div className="flex flex-col gap-s1">
              <dt className="t-caption text-ink-soft">Ends</dt>
              <dd className="t-body-md text-ink">
                {formatTimeLocal(appointment.scheduledEndAt)}
              </dd>
            </div>
            <div className="flex flex-col gap-s1">
              <dt className="t-caption text-ink-soft">Booked price</dt>
              <dd className="t-body-md text-ink">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(appointment.bookedBasePriceCents / 100)}
                {service && service.basePriceCents !== appointment.bookedBasePriceCents && (
                  <span className="t-caption text-ink-soft">
                    {' '}
                    (catalog now{' '}
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    }).format(service.basePriceCents / 100)}
                    )
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        {(appointment.notes ||
          linkedAppointmentNotes.length > 0) && (
          <Card padding="md" className="border border-surface-3">
            <div className="flex flex-col gap-s3">
              <span className="t-caption text-ink-soft">Booking notes</span>
              {appointment.notes ? (
                <p className="t-body-md whitespace-pre-wrap text-ink">
                  {appointment.notes}
                </p>
              ) : null}
              {linkedAppointmentNotes.map((n, i) => (
                <div
                  key={n.id}
                  className={cn(
                    'flex flex-col gap-s1',
                    i > 0 || appointment.notes
                      ? 'border-t border-surface-3 pt-s3'
                      : '',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-s2">
                    <Badge tone="neutral">{n.category}</Badge>
                    {n.sourceSurface === 'quick_book' ? (
                      <Badge tone="accent">Quick Book</Badge>
                    ) : null}
                  </div>
                  <p className="t-body-md whitespace-pre-wrap text-ink">{n.body}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </section>

      {appointment.state === 'requested' && (
        <section className="flex flex-col gap-s3">
          <h3 className="t-display-sm text-ink">Request approval</h3>
          <p className="t-body-sm text-ink-soft">
            The client requested this appointment. Approve to confirm, or
            decline to cancel and free the slot.
          </p>
          <div className="flex flex-wrap gap-s2">
            <Button
              variant="accent"
              size="sm"
              disabled={pending}
              loading={pending}
              onClick={fireApprove}
            >
              Approve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              loading={pending}
              onClick={fireDecline}
            >
              Decline
            </Button>
          </div>
        </section>
      )}

      {allowed.length > 0 && (
        <section className="flex flex-col gap-s3">
          <h3 className="t-display-sm text-ink">Actions</h3>
          <div className="flex flex-wrap gap-s2">
            {allowed.map((target) => (
              <Button
                key={target}
                variant={target === 'cancelled' || target === 'no_show' ? 'ghost' : 'accent'}
                size="sm"
                disabled={pending}
                loading={pending}
                onClick={() => fire(target)}
              >
                {ACTION_LABEL[target]}
              </Button>
            ))}
          </div>
        </section>
      )}

      {allowed.length === 0 && appointment.state !== 'requested' && (
        <p className="t-body-sm text-ink-soft italic">
          This appointment has reached a terminal state — no further actions.
        </p>
      )}
    </div>
  );
}
