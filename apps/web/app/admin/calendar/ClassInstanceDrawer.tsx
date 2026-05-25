'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useState, useTransition } from 'react';

import { Alert, Badge, Button, Drawer, Textarea } from '@/components/ui';
import type {
  ListRosterResponse,
  RosterBooking,
  RosterWaitlistEntry,
} from '@/lib/api/class-bookings';
import type {
  ClassInstanceState,
  ClassInstanceWithRelations,
} from '@/lib/api/class-instances';
import { formatDateTimeLocal, formatTimeLocal } from '@/lib/calendar';

import { cancelClassInstanceCalendarAction } from './_actions';
import {
  AddClientToClassInstanceButton,
  CancelBookingButton,
  PromoteWaitlistButton,
} from './ClassInstanceDrawerActions';

// Phase 3a of the Classes epic — rewrites the Phase 2a skeleton to wire the
// real roster (confirmed bookings) and waitlist into the drawer. Booking +
// cancel + waitlist promote land here as inline action UIs; the URL state
// pattern stays the same (`?classInstance=<id>` opens the drawer, parent
// page fetches instance + roster server-side).

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

function clientDisplayName(client: {
  firstName: string;
  lastName: string | null;
}): string {
  return [client.firstName, client.lastName].filter(Boolean).join(' ').trim();
}

function staffName(staff: ClassInstanceWithRelations['staff']): string {
  return `${staff.firstName}${staff.lastName ? ' ' + staff.lastName : ''}`;
}

// Relative-time label for roster rows. Mirrors the "X min ago" pattern used
// in the appointment drawer's audit list; we only need minute / hour / day
// granularity here.
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function bookingStateBadge(state: RosterBooking['state']) {
  switch (state) {
    case 'confirmed':
      return <Badge tone="accent">Confirmed</Badge>;
    case 'checked_in':
      return <Badge tone="green">Checked in</Badge>;
    case 'completed':
      return <Badge tone="neutral">Completed</Badge>;
    case 'cancelled_by_client':
      return <Badge tone="red">Cancelled (client)</Badge>;
    case 'cancelled_by_studio':
      return <Badge tone="red">Cancelled (studio)</Badge>;
    case 'no_show':
      return <Badge tone="amber">No-show</Badge>;
  }
}

function waitlistStateBadge(state: RosterWaitlistEntry['state']) {
  switch (state) {
    case 'waiting':
      return <Badge tone="neutral">Waiting</Badge>;
    case 'promoted':
      return <Badge tone="accent">Promoted</Badge>;
    case 'expired':
      return <Badge tone="amber">Expired</Badge>;
    case 'cancelled':
      return <Badge tone="red">Cancelled</Badge>;
  }
}

interface ClassInstanceDrawerProps {
  instance: ClassInstanceWithRelations;
  roster: ListRosterResponse | null;
  /**
   * Tenant's bookingCancellationWindowHours — drives the "Free cancellation
   * until N hours before class" caption + matches the late-cancel flag the
   * API records on the cancel audit row (Phase 3c).
   */
  cancellationWindowHours: number;
  onClose: () => void;
}

export function ClassInstanceDrawer({
  instance,
  roster,
  cancellationWindowHours,
  onClose,
}: ClassInstanceDrawerProps) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isCancelled = instance.state === 'cancelled';
  const capacity = instance.capacityOverride ?? instance.class.maxCapacity;
  const waitlistLimit =
    instance.waitlistOverride ?? instance.class.waitlistLimit;

  // Count "active" bookings against capacity. Cancelled / no-show rows are
  // excluded from the meter even when the roster request asks for them.
  const activeBookings =
    roster?.bookings.filter(
      (b) =>
        b.state === 'confirmed' ||
        b.state === 'checked_in' ||
        b.state === 'completed',
    ) ?? [];
  const activeWaitlist =
    roster?.waitlist.filter(
      (w) => w.state === 'waiting' || w.state === 'promoted',
    ) ?? [];
  const confirmedCount = activeBookings.length;
  const meterPct =
    capacity > 0
      ? Math.min(100, Math.round((confirmedCount / capacity) * 100))
      : 0;
  const meterTone =
    confirmedCount >= capacity
      ? 'bg-red'
      : confirmedCount >= capacity * 0.8
        ? 'bg-amber'
        : 'bg-accent';

  const allowWaitlist = waitlistLimit > 0;

  const handleCancelInstance = () => {
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
        {/* Capacity meter */}
        <section className="flex flex-col gap-s3">
          <h3 className="t-eyebrow text-ink-soft">Capacity</h3>
          <div className="flex flex-col gap-s2">
            <div className="flex items-baseline justify-between gap-s3">
              <span className="t-display-sm text-ink">
                {confirmedCount} of {capacity} booked
              </span>
              {allowWaitlist && (
                <span className="t-caption text-ink-soft">
                  {activeWaitlist.length} on waitlist (limit {waitlistLimit})
                </span>
              )}
            </div>
            <div
              className="h-[6px] w-full overflow-hidden rounded-full bg-surface-2"
              aria-label={`${meterPct}% of capacity`}
              role="progressbar"
              aria-valuenow={meterPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full ${meterTone}`}
                style={{ width: `${meterPct}%` }}
              />
            </div>
          </div>
        </section>

        {/* Roster section */}
        <section className="flex flex-col gap-s3">
          <div className="flex items-center justify-between">
            <h3 className="t-eyebrow text-ink-soft">Roster</h3>
            {!isCancelled && (
              <AddClientToClassInstanceButton instanceId={instance.id} />
            )}
          </div>
          {roster === null ? (
            <p className="t-caption text-ink-soft">Loading roster…</p>
          ) : activeBookings.length === 0 ? (
            <p className="t-caption text-ink-soft">
              No bookings yet. Use &ldquo;+ Add client&rdquo; above to enroll someone.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-surface-3 rounded-md border border-surface-3">
              {activeBookings.map((b) => {
                const name = clientDisplayName(b.client) || 'Unnamed client';
                return (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-s3 px-s3 py-s2"
                  >
                    <div className="flex min-w-0 flex-col gap-[2px]">
                      <Link
                        href={`/admin/clients/${b.clientId}` as Route}
                        className="t-body-sm font-medium text-ink hover:underline"
                      >
                        {name}
                      </Link>
                      <span className="t-caption text-ink-soft">
                        Booked {timeAgo(b.bookedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-s2">
                      {bookingStateBadge(b.state)}
                      {!isCancelled && b.state === 'confirmed' && (
                        <CancelBookingButton
                          instanceId={instance.id}
                          bookingId={b.id}
                          cancellationWindowHours={cancellationWindowHours}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Waitlist section — only when the class allows waitlist */}
        {allowWaitlist && (
          <section className="flex flex-col gap-s3">
            <h3 className="t-eyebrow text-ink-soft">Waitlist</h3>
            {roster === null ? (
              <p className="t-caption text-ink-soft">Loading waitlist…</p>
            ) : activeWaitlist.length === 0 ? (
              <p className="t-caption text-ink-soft">
                Waitlist is empty. New bookings go directly to the roster while
                seats are available.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-surface-3 rounded-md border border-surface-3">
                {activeWaitlist.map((w) => {
                  const name = clientDisplayName(w.client) || 'Unnamed client';
                  return (
                    <li
                      key={w.id}
                      className="flex items-center justify-between gap-s3 px-s3 py-s2"
                    >
                      <div className="flex min-w-0 items-center gap-s3">
                        <Badge tone="neutral">#{w.position}</Badge>
                        <div className="flex min-w-0 flex-col gap-[2px]">
                          <Link
                            href={`/admin/clients/${w.clientId}` as Route}
                            className="t-body-sm font-medium text-ink hover:underline"
                          >
                            {name}
                          </Link>
                          <span className="t-caption text-ink-soft">
                            Joined {timeAgo(w.joinedAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-s2">
                        {waitlistStateBadge(w.state)}
                        {!isCancelled && w.state === 'waiting' && (
                          <PromoteWaitlistButton
                            instanceId={instance.id}
                            entryId={w.id}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* Details */}
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

        {/* Instance-level cancel action */}
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
                  audit log. Notifications to booked clients land in Epic 8.
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
                    onClick={handleCancelInstance}
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
