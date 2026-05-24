'use client';

import { useState, useTransition } from 'react';

import { Alert, Badge, Button, Drawer, Textarea } from '@/components/ui';
import type {
  ClassInstanceState,
  ClassInstanceWithRelations,
} from '@/lib/api/class-instances';
import { formatDateTimeLocal, formatTimeLocal } from '@/lib/calendar';

import { cancelClassInstanceCalendarAction } from './_actions';

// Phase 2a of the Classes epic. Mirrors AppointmentDrawer's URL-driven
// pattern, but on `?classInstance=<id>` so opening a class chip doesn't
// clobber the appointment selection. Bookings + roster ship in Phase 3 —
// we hard-code 0/X here and add a notice so admins know more is coming.

const STATE_LABELS: Record<ClassInstanceState, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function stateBadge(state: ClassInstanceState) {
  switch (state) {
    case 'scheduled':
      return <Badge tone="neutral">{STATE_LABELS[state]}</Badge>;
    case 'in_progress':
      return <Badge tone="green">{STATE_LABELS[state]}</Badge>;
    case 'completed':
      return <Badge tone="accent">{STATE_LABELS[state]}</Badge>;
    case 'cancelled':
      return <Badge tone="red">{STATE_LABELS[state]}</Badge>;
  }
}

function staffName(staff: ClassInstanceWithRelations['staff']): string {
  return `${staff.firstName}${staff.lastName ? ' ' + staff.lastName : ''}`;
}

interface ClassInstanceDrawerProps {
  instance: ClassInstanceWithRelations;
  onClose: () => void;
}

export function ClassInstanceDrawer({
  instance,
  onClose,
}: ClassInstanceDrawerProps) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isCancelled = instance.state === 'cancelled';
  const capacity =
    instance.capacityOverride ?? instance.class.maxCapacity;
  const waitlistLimit =
    instance.waitlistOverride ?? instance.class.waitlistLimit;

  const handleCancel = () => {
    setCancelError(null);
    startTransition(async () => {
      const res = await cancelClassInstanceCalendarAction({
        instanceId: instance.id,
        reason: cancelReason.trim().length > 0 ? cancelReason.trim() : undefined,
      });
      if (!res.ok) {
        setCancelError(res.error ?? 'Could not cancel class instance.');
        return;
      }
      setConfirmingCancel(false);
      setCancelReason('');
      onClose();
    });
  };

  return (
    <Drawer
      open
      onClose={onClose}
      ariaLabel="Class instance details"
      headerActions={stateBadge(instance.state)}
      title={
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Class instance</span>
          <h2 className="t-display-md text-ink">{instance.class.name}</h2>
        </div>
      }
      subtitle={
        <span>
          {formatDateTimeLocal(instance.scheduledStartAt)} –{' '}
          {formatTimeLocal(instance.scheduledEndAt)}
          {` · ${staffName(instance.staff)}`}
          {` · ${instance.location.name}`}
        </span>
      }
    >
      <div className="flex flex-col gap-s5 px-s6 py-s5">
        <section className="flex flex-col gap-s3">
          <h3 className="t-eyebrow text-ink-soft">Capacity</h3>
          <div className="flex flex-wrap items-center gap-s3">
            <Badge tone="accent">0 of {capacity} booked</Badge>
            <Badge tone="neutral">0 on waitlist (limit {waitlistLimit})</Badge>
          </div>
          <p className="t-caption text-ink-soft">
            Roster + booking management lands in Phase 3.
          </p>
        </section>

        <section className="flex flex-col gap-s2">
          <h3 className="t-eyebrow text-ink-soft">Details</h3>
          <dl className="flex flex-col gap-s2 t-body-md">
            <div className="flex justify-between gap-s4">
              <dt className="text-ink-soft">Class</dt>
              <dd className="text-right text-ink">{instance.class.name}</dd>
            </div>
            <div className="flex justify-between gap-s4">
              <dt className="text-ink-soft">Instructor</dt>
              <dd className="text-right text-ink">{staffName(instance.staff)}</dd>
            </div>
            <div className="flex justify-between gap-s4">
              <dt className="text-ink-soft">Location</dt>
              <dd className="text-right text-ink">{instance.location.name}</dd>
            </div>
            <div className="flex justify-between gap-s4">
              <dt className="text-ink-soft">Duration</dt>
              <dd className="text-right text-ink">
                {instance.class.durationMinutes} min
              </dd>
            </div>
          </dl>
        </section>

        {isCancelled && instance.cancelledReason && (
          <Alert tone="warning">
            <span className="font-semibold">Cancelled.</span>{' '}
            {instance.cancelledReason}
          </Alert>
        )}

        {!isCancelled && (
          <section className="flex flex-col gap-s3">
            <h3 className="t-eyebrow text-ink-soft">Actions</h3>
            {cancelError && <Alert tone="error">{cancelError}</Alert>}
            {!confirmingCancel ? (
              <div className="flex gap-s3">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  className="text-red hover:bg-red-pale"
                  onClick={() => setConfirmingCancel(true)}
                >
                  Cancel instance
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-s3 rounded-md border border-red/30 bg-red-pale/40 p-s3">
                <p className="t-caption text-ink-soft">
                  Cancel this class instance? Optional reason captured on the
                  audit log. Notifications to booked clients land in Phase 2b.
                </p>
                <Textarea
                  name="reason"
                  rows={2}
                  maxLength={500}
                  placeholder="Reason (optional)"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
                <div className="flex justify-end gap-s2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setConfirmingCancel(false);
                      setCancelReason('');
                      setCancelError(null);
                    }}
                    disabled={isPending}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="bg-red hover:bg-red"
                    onClick={handleCancel}
                    loading={isPending}
                  >
                    {isPending ? 'Cancelling…' : 'Confirm cancel'}
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </Drawer>
  );
}
