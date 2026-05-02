'use client';

import { Card } from '@/components/ui';
import type {
  ClientStats,
  ClientWithTags,
} from '@/lib/api/clients';

// Activity tab — placeholder for v1. Surfaces what we have today
// (createdAt, updatedAt, deletedAt, intake status) and explains where
// the full audit trail will land. Per the spec, status-change history
// for appointments + notes lives in audit_log; the projection that
// rolls those up into a per-client activity feed is a follow-up.

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface ActivityTabProps {
  client: ClientWithTags;
  stats: ClientStats;
}

export function ActivityTab({ client, stats }: ActivityTabProps) {
  const events: { at: string; label: string }[] = [];
  events.push({
    at: stats.memberSince,
    label: 'Profile created',
  });
  if (client.bannedAt) {
    events.push({
      at: client.bannedAt,
      label: `Banned${client.bannedReason ? ` — ${client.bannedReason}` : ''}`,
    });
  }
  if (client.deletedAt) {
    events.push({
      at: client.deletedAt,
      label: 'Soft-deleted',
    });
  }
  // Sort newest-first.
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="flex flex-col gap-s4">
      <Card padding="md" className="border border-surface-3">
        <ul className="flex flex-col gap-s3">
          {events.map((e, i) => (
            <li
              key={i}
              className="flex items-baseline justify-between gap-s3 border-b border-surface-3 pb-s2 last:border-b-0 last:pb-0"
            >
              <span className="t-body-md text-ink">{e.label}</span>
              <span className="t-caption text-ink-soft">
                {formatDateTime(e.at)}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        padding="md"
        className="border border-dashed border-surface-3 bg-surface-2/40"
      >
        <div className="flex flex-col gap-s2">
          <span className="t-eyebrow text-accent">Coming soon</span>
          <h3 className="t-display-sm text-ink">Full activity log</h3>
          <p className="t-body-md text-ink-soft">
            Status changes on appointments, notes added/edited, files uploaded
            and archived, intake submissions — all rolled up as a per-client
            timeline. Backed by the existing audit_log table; the projection
            that hydrates this view ships as a follow-up ticket.
          </p>
        </div>
      </Card>
    </div>
  );
}
