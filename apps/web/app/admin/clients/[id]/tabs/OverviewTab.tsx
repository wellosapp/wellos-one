'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { ClientAlertStack } from '@/components/admin/ClientAlertStack';
import { Badge, Button, Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import type {
  ClientStats,
  ClientWithTags,
} from '@/lib/api/clients';
import type { ClientNoteSummary } from '@/lib/api/client-notes';
import type { ClientTimelineResponse } from '@/lib/api/timeline';

import { deleteClientAction } from '../../_actions';

// Overview tab — the entry point for the client profile. Shows quick
// stats, active alerts, recent visits, contact info card, address,
// and the soft-delete danger zone.

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card padding="md" className="border border-surface-3">
      <div className="flex flex-col gap-s1">
        <span className="t-eyebrow text-ink-soft">{label}</span>
        <span className="t-display-md font-display text-ink">{value}</span>
        {hint && <span className="t-caption text-ink-soft">{hint}</span>}
      </div>
    </Card>
  );
}

interface OverviewTabProps {
  client: ClientWithTags;
  stats: ClientStats;
  timeline: ClientTimelineResponse;
  allNotes: ClientNoteSummary[];
  editHref: string;
}

export function OverviewTab({
  client,
  stats,
  timeline,
  allNotes,
  editHref,
}: OverviewTabProps) {
  const recentVisits = timeline.visits.slice(0, 3);
  const alerts = allNotes.filter((n) => n.priority === 'alert');

  return (
    <div className="flex flex-col gap-s6">
      {/* Quick stats — 4-up grid */}
      <section className="grid grid-cols-2 gap-s3 sm:grid-cols-4">
        <StatTile
          label="Total visits"
          value={stats.totalVisits}
          hint={
            stats.totalCompletedVisits > 0
              ? `${stats.totalCompletedVisits} completed`
              : undefined
          }
        />
        <StatTile
          label="Last visit"
          value={stats.lastVisit ? formatDate(stats.lastVisit.scheduledStartAt) : '—'}
          hint={stats.lastVisit?.staffName ?? undefined}
        />
        <StatTile label="Notes" value={stats.totalNotes} hint={stats.totalAlertNotes > 0 ? `${stats.totalAlertNotes} alert` : undefined} />
        <StatTile label="Files" value={stats.totalFiles} />
      </section>

      {/* Alerts — if any */}
      {alerts.length > 0 && <ClientAlertStack alerts={alerts} />}

      {/* Recent visits preview */}
      <section className="flex flex-col gap-s3">
        <div className="flex items-center justify-between gap-s3">
          <h2 className="t-display-sm text-ink">Recent visits</h2>
          <Link
            href={`/admin/clients/${client.id}?tab=visits` as Route}
            className="t-body-sm text-accent no-underline hover:underline"
          >
            See all visits →
          </Link>
        </div>

        {recentVisits.length === 0 ? (
          <p className="t-body-sm italic text-ink-soft">No visits yet.</p>
        ) : (
          <ul role="list" className="flex flex-col gap-s2">
            {recentVisits.map((v) => (
              <li
                key={v.appointment.id}
                className="flex flex-wrap items-center justify-between gap-s3 rounded-sm border border-surface-3 bg-white p-s3"
              >
                <div className="flex flex-col gap-s1">
                  <div className="flex flex-wrap items-center gap-s2">
                    <span className="t-body-md font-medium text-ink">
                      {v.service.name}
                    </span>
                    <Badge tone="neutral">{v.appointment.state}</Badge>
                  </div>
                  <span className="t-body-sm text-ink-soft">
                    {formatDate(v.appointment.scheduledStartAt)} ·{' '}
                    {formatTime(v.appointment.scheduledStartAt)} · with{' '}
                    {v.staff.firstName}
                    {v.staff.lastName ? ' ' + v.staff.lastName : ''}
                  </span>
                </div>
                {v.notes.length > 0 && (
                  <Badge tone="neutral">
                    {v.notes.length} note{v.notes.length === 1 ? '' : 's'}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Contact info — read-only display, edit button */}
      <section className="flex flex-col gap-s3">
        <div className="flex items-center justify-between gap-s3">
          <h2 className="t-display-sm text-ink">Contact information</h2>
          <Link href={editHref as Route} className="no-underline">
            <Button variant="ghost" size="sm">
              Edit
            </Button>
          </Link>
        </div>
        <Card padding="md" className="border border-surface-3">
          <dl className="grid grid-cols-1 gap-s3 sm:grid-cols-2">
            <div>
              <dt className="t-caption text-ink-soft">Email</dt>
              <dd className="t-body-md text-ink break-all">
                {client.email ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="t-caption text-ink-soft">Phone</dt>
              <dd className="t-body-md text-ink">{client.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="t-caption text-ink-soft">Date of birth</dt>
              <dd className="t-body-md text-ink">
                {client.dateOfBirth
                  ? formatDate(client.dateOfBirth)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="t-caption text-ink-soft">Intake status</dt>
              <dd className="t-body-md text-ink">{client.intakeStatus}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="t-caption text-ink-soft">Emergency contact</dt>
              <dd className="t-body-md text-ink">
                {client.emergencyContactName
                  ? `${client.emergencyContactName}${client.emergencyContactPhone ? ' · ' + client.emergencyContactPhone : ''}`
                  : '—'}
              </dd>
            </div>
          </dl>
        </Card>
      </section>

      {/* Address */}
      <section className="flex flex-col gap-s3">
        <h2 className="t-display-sm text-ink">Address</h2>
        <Card padding="md" className="border border-surface-3">
          <div className="t-body-md text-ink whitespace-pre-line">
            {[
              client.addressLine1,
              client.addressLine2,
              [client.city, client.state, client.postalCode]
                .filter(Boolean)
                .join(', '),
              client.country,
            ]
              .filter(Boolean)
              .join('\n') || '—'}
          </div>
        </Card>
      </section>

      {/* Profile notes */}
      {client.notes && (
        <section className="flex flex-col gap-s3">
          <h2 className="t-display-sm text-ink">Profile notes</h2>
          <Card padding="md" className="border border-surface-3">
            <p className="t-body-md whitespace-pre-wrap text-ink">
              {client.notes}
            </p>
          </Card>
        </section>
      )}

      {/* Danger zone — soft-delete */}
      {!client.deletedAt && (
        <section
          className={cn(
            'rounded-md border border-red/20 bg-red-pale/40 p-s4',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-s4">
            <div className="flex flex-col gap-s1">
              <h2 className="t-display-sm">Soft-delete client</h2>
              <p className="t-body-sm text-ink-soft">
                Hides from lists but keeps history. Reversible by an admin via
                DB.
              </p>
            </div>
            <form action={deleteClientAction.bind(null, client.id)}>
              <Button
                type="submit"
                variant="ghost"
                size="md"
                className="text-red hover:bg-red-pale"
              >
                Soft-delete
              </Button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
