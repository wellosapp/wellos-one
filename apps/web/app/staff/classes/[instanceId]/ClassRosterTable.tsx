'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, Button, Card } from '@/components/ui';
import type { RosterBooking } from '@/lib/api/class-bookings';
import { cn } from '@/lib/cn';

import {
  checkInBookingAction,
  markNoShowAction,
  revertCheckInAction,
} from './_actions';

// Roster table for the staff check-in surface (Phase 4). Lives client-side
// because each row owns a useTransition for action button feedback. The
// outer page is a server component that fetches the roster and passes it in.

interface ClassRosterTableProps {
  instanceId: string;
  bookings: RosterBooking[];
  /** Map of (staffId → display name) for the "Checked in by Sarah" caption. */
  staffNameById: Record<string, string>;
  /** Admin/staff users get a deep link to the client profile from the name. */
  canLinkToClient: boolean;
}

type Tone = 'neutral' | 'accent' | 'amber' | 'red' | 'green';

function stateBadge(b: RosterBooking): { tone: Tone; label: string } {
  if (b.state === 'confirmed') return { tone: 'neutral', label: 'Not arrived' };
  if (b.state === 'checked_in') {
    return b.late
      ? { tone: 'amber', label: 'Late' }
      : { tone: 'accent', label: 'Checked in' };
  }
  if (b.state === 'no_show') return { tone: 'red', label: 'No-show' };
  if (b.state === 'completed') return { tone: 'green', label: 'Completed' };
  if (
    b.state === 'cancelled_by_client' ||
    b.state === 'cancelled_by_studio'
  ) {
    return { tone: 'neutral', label: 'Cancelled' };
  }
  return { tone: 'neutral', label: b.state };
}

function initials(client: RosterBooking['client']): string {
  const a = client.firstName?.[0] ?? '';
  const b = client.lastName?.[0] ?? '';
  return (a + b).toUpperCase() || '?';
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function bookingSourceLabel(b: RosterBooking): string {
  // Phase 3b's public booking flow sets idempotencyKey like
  // "public-book:<uuid>" so this differentiates public (Online) from
  // admin-driven creates (Staff-booked) without a wire-shape change.
  if (b.idempotencyKey?.startsWith('public-book:')) return 'Online';
  if (b.idempotencyKey?.startsWith('waitlist-')) return 'From waitlist';
  return 'Staff-booked';
}

interface RowProps {
  instanceId: string;
  booking: RosterBooking;
  staffNameById: Record<string, string>;
  canLinkToClient: boolean;
}

function RosterRow({
  instanceId,
  booking,
  staffNameById,
  canLinkToClient,
}: RowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const badge = stateBadge(booking);
  const fullName = [booking.client.firstName, booking.client.lastName]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Client';
  const isCancelled =
    booking.state === 'cancelled_by_client' ||
    booking.state === 'cancelled_by_studio';

  const checkedInBy = booking.checkedInByStaffId
    ? staffNameById[booking.checkedInByStaffId] ?? null
    : null;

  const handle = (
    action: 'check_in' | 'mark_late' | 'no_show' | 'revert',
  ) => {
    startTransition(async () => {
      if (action === 'check_in') {
        await checkInBookingAction(instanceId, booking.id, false);
      } else if (action === 'mark_late') {
        await checkInBookingAction(instanceId, booking.id, true);
      } else if (action === 'no_show') {
        await markNoShowAction(instanceId, booking.id);
      } else if (action === 'revert') {
        await revertCheckInAction(instanceId, booking.id);
      }
      router.refresh();
    });
  };

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-s4 border-b border-surface-3 py-s3 last:border-b-0',
        isCancelled && 'opacity-50',
      )}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent-pale t-body-sm font-bold text-accent"
        aria-hidden="true"
      >
        {initials(booking.client)}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {canLinkToClient ? (
          <Link
            href={`/admin/clients/${booking.clientId}` as Route}
            className={cn(
              't-body-md text-ink no-underline hover:underline',
              isCancelled && 'line-through',
            )}
          >
            {fullName}
          </Link>
        ) : (
          <span
            className={cn(
              't-body-md text-ink',
              isCancelled && 'line-through',
            )}
          >
            {fullName}
          </span>
        )}
        <span className="t-caption text-ink-soft">
          {bookingSourceLabel(booking)}
          {booking.state === 'checked_in' && booking.checkedInAt && (
            <>
              {' · Checked in '}
              {relativeTime(booking.checkedInAt)}
              {checkedInBy ? ` by ${checkedInBy}` : ''}
            </>
          )}
        </span>
      </div>

      <Badge tone={badge.tone}>{badge.label}</Badge>

      <div className="flex flex-wrap items-center gap-s2">
        {booking.state === 'confirmed' && (
          <>
            <Button
              variant="accent"
              size="sm"
              loading={isPending}
              disabled={isPending}
              onClick={() => handle('check_in')}
            >
              Check in
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={isPending}
              disabled={isPending}
              onClick={() => handle('mark_late')}
            >
              Mark late
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={isPending}
              disabled={isPending}
              onClick={() => handle('no_show')}
            >
              Mark no-show
            </Button>
          </>
        )}
        {booking.state === 'checked_in' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              loading={isPending}
              disabled={isPending}
              onClick={() => handle('mark_late')}
            >
              {booking.late ? 'Clear late' : 'Mark late'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={isPending}
              disabled={isPending}
              onClick={() => handle('revert')}
            >
              Revert
            </Button>
          </>
        )}
        {booking.state === 'no_show' && (
          <Button
            variant="ghost"
            size="sm"
            loading={isPending}
            disabled={isPending}
            onClick={() => handle('revert')}
          >
            Revert
          </Button>
        )}
        {/* Cancelled / completed rows have no actions. */}
      </div>
    </li>
  );
}

export function ClassRosterTable({
  instanceId,
  bookings,
  staffNameById,
  canLinkToClient,
}: ClassRosterTableProps) {
  // Special-case the "Mark late" button when the user clicks while already
  // checked-in and late=true — relabel to "Clear late" by sending false. The
  // server handles the idempotent path: a second identical click is a no-op.
  //
  // The row component handles all transition state internally so re-renders
  // after revalidatePath don't double-fire.

  if (bookings.length === 0) {
    return (
      <Card padding="md">
        <p className="t-body-md text-ink-soft">No bookings yet.</p>
      </Card>
    );
  }

  return (
    <Card padding="md">
      <h2 className="t-display-sm mb-s3">Roster</h2>
      <ul className="flex flex-col">
        {bookings.map((b) => (
          <RosterRow
            key={b.id}
            instanceId={instanceId}
            booking={b}
            staffNameById={staffNameById}
            canLinkToClient={canLinkToClient}
          />
        ))}
      </ul>
    </Card>
  );
}
