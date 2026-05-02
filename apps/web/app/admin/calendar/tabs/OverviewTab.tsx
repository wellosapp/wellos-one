'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Alert, Badge, Button, Card } from '@/components/ui';
import type {
  Appointment,
  AppointmentState,
} from '@/lib/api/appointments';
import type { ClientWithTags } from '@/lib/api/clients';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';
import {
  formatDateTimeLocal,
  formatTimeLocal,
} from '@/lib/calendar';

import { transitionAppointmentAction } from '../_actions';

// Map current state → list of allowed next states. Mirrors the lifecycle
// guard in apps/api/src/services/appointmentService.ts. Server is still
// authoritative — these just hide buttons that would always 400.
const NEXT_STATES: Record<AppointmentState, AppointmentState[]> = {
  scheduled: ['confirmed', 'checked_in', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

const STATE_LABEL: Record<AppointmentState, string> = {
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
  scheduled: 'neutral',
  confirmed: 'accent',
  checked_in: 'amber',
  in_progress: 'amber',
  completed: 'green',
  cancelled: 'red',
  no_show: 'red',
};

const ACTION_LABEL: Record<AppointmentState, string> = {
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
}

export function OverviewTab({
  appointment,
  service,
  staff,
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
          </dl>
        </Card>

        {appointment.notes && (
          <Card padding="md" className="border border-surface-3">
            <div className="flex flex-col gap-s2">
              <span className="t-caption text-ink-soft">Booking notes</span>
              <p className="t-body-md whitespace-pre-wrap text-ink">
                {appointment.notes}
              </p>
            </div>
          </Card>
        )}
      </section>

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

      {allowed.length === 0 && (
        <p className="t-body-sm text-ink-soft italic">
          This appointment has reached a terminal state — no further actions.
        </p>
      )}
    </div>
  );
}
