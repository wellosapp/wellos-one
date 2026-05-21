import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Button, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { getWaitlistEntry, type WaitlistEntry } from '@/lib/api/waitlist';

import {
  cancelWaitlistFromDetailAction,
  offerWaitlistAction,
} from '../_actions';

function statusTone(s: WaitlistEntry['status']): 'green' | 'amber' | 'red' | 'accent' {
  switch (s) {
    case 'active':
      return 'green';
    case 'offered':
      return 'accent';
    case 'claimed':
      return 'green';
    case 'expired':
      return 'amber';
    case 'cancelled':
      return 'red';
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default async function WaitlistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let entry: WaitlistEntry;
  try {
    const result = await getWaitlistEntry(id);
    entry = result.entry;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const offerAction = offerWaitlistAction.bind(null, id);
  const cancelAction = cancelWaitlistFromDetailAction.bind(null, id);

  const isTerminal =
    entry.status === 'claimed' ||
    entry.status === 'expired' ||
    entry.status === 'cancelled';

  return (
    <div className="flex flex-col gap-s6">
      <div>
        <Link
          href="/admin/waitlist"
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to waitlist
        </Link>
      </div>

      <header className="flex flex-wrap items-baseline justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Waitlist entry</span>
          <h1 className="t-display-lg">{entry.contactName}</h1>
        </div>
        <Badge tone={statusTone(entry.status)}>{entry.status}</Badge>
      </header>

      <Card padding="md">
        <div className="grid gap-s5 sm:grid-cols-2">
          <Field label="Email">{entry.contactEmail ?? '—'}</Field>
          <Field label="Phone">{entry.contactPhone ?? '—'}</Field>
          <Field label="Service id">
            <code className="t-body-sm text-ink-soft">{entry.serviceId}</code>
          </Field>
          <Field label="Location id">
            <code className="t-body-sm text-ink-soft">{entry.locationId}</code>
          </Field>
          <Field label="Preferred staff">
            {entry.staffId ? (
              <code className="t-body-sm text-ink-soft">{entry.staffId}</code>
            ) : (
              <span className="t-body-sm text-ink-soft">Any provider</span>
            )}
          </Field>
          <Field label="Preferred time of day">
            {entry.preferredTimeOfDay ?? 'Any'}
          </Field>
          <Field label="Preferred start">{formatDate(entry.preferredStart)}</Field>
          <Field label="Preferred end">{formatDate(entry.preferredEnd)}</Field>
          <Field label="SMS opt-in">{entry.smsOptIn ? 'Yes' : 'No'}</Field>
          <Field label="TTL expires">{formatDateTime(entry.ttlExpiresAt)}</Field>
          {entry.offeredAt ? (
            <Field label="Offered at">{formatDateTime(entry.offeredAt)}</Field>
          ) : null}
          {entry.offeredAppointmentId ? (
            <Field label="Offered appointment">
              <code className="t-body-sm text-ink-soft">
                {entry.offeredAppointmentId}
              </code>
            </Field>
          ) : null}
          {entry.claimedAt ? (
            <Field label="Claimed at">{formatDateTime(entry.claimedAt)}</Field>
          ) : null}
          <Field label="Created">{formatDateTime(entry.createdAt)}</Field>
          <Field label="Updated">{formatDateTime(entry.updatedAt)}</Field>
        </div>

        {entry.notes ? (
          <div className="mt-s5 rounded-2xl border border-surface-3 bg-surface px-s4 py-s4">
            <div className="t-caption font-semibold text-ink-soft">Notes</div>
            <p className="mt-s2 t-body-md text-ink">{entry.notes}</p>
          </div>
        ) : null}
      </Card>

      {!isTerminal && (
        <Card padding="md">
          <div className="flex flex-wrap items-center justify-between gap-s4">
            <div className="flex flex-col gap-s1">
              <h2 className="t-display-sm">Actions</h2>
              <p className="t-body-sm text-ink-soft">
                Mark as offered to record that an opening was sent. Cancel to
                remove the client from the active waitlist. Notification
                dispatch lands with Epic 8.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-s3">
              {entry.status === 'active' && (
                <form action={offerAction}>
                  <Button type="submit" variant="accent" size="md">
                    Mark offered
                  </Button>
                </form>
              )}
              <form action={cancelAction}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="md"
                  className="text-red hover:bg-red-pale"
                >
                  Cancel entry
                </Button>
              </form>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-s1">
      <span className="t-caption font-semibold text-ink-soft">{label}</span>
      <span className="t-body-md text-ink">{children}</span>
    </div>
  );
}
