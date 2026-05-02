'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { Badge, Button, Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  CLIENT_TIER_LABELS,
  CLIENT_TIER_TONES,
  deriveClientTier,
  formatClientNumber,
  type ClientStats,
  type ClientWithTags,
} from '@/lib/client-shared';

// Header card for the client profile — mirrors the wireframe layout.
// Avatar + identity on the left, stat strip in the middle, 3-button
// action row (Quick Book / Edit profile / Add note) below stats.

interface ClientHeaderCardProps {
  client: ClientWithTags;
  stats: ClientStats;
  editHref: string;
  addNoteHref: string;
  quickBookHref: string;
}

function initials(client: ClientWithTags): string {
  const first = (client.firstName ?? '').trim().charAt(0).toUpperCase();
  const last = (client.lastName ?? '').trim().charAt(0).toUpperCase();
  return (first + last) || '?';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ClientHeaderCard({
  client,
  stats,
  editHref,
  addNoteHref,
  quickBookHref,
}: ClientHeaderCardProps) {
  const fullName = `${client.firstName}${client.lastName ? ' ' + client.lastName : ''}`;
  const memberId = formatClientNumber(client.clientNumber);
  const tier = deriveClientTier(stats);

  return (
    <Card padding="lg" className="border border-surface-3">
      <div className="flex flex-wrap items-start justify-between gap-s6">
        {/* Left: avatar + identity + contact */}
        <div className="flex flex-1 flex-wrap items-start gap-s4 min-w-0">
          <div
            aria-hidden="true"
            className={cn(
              'flex h-20 w-20 shrink-0 items-center justify-center rounded-md',
              'bg-accent-pale text-accent t-display-lg font-display',
            )}
          >
            {initials(client)}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-s2">
            <div className="flex flex-wrap items-center gap-s2">
              <h1 className="t-display-lg text-ink truncate">{fullName}</h1>
              <Badge tone={CLIENT_TIER_TONES[tier]}>
                {CLIENT_TIER_LABELS[tier]}
              </Badge>
              {client.banned && (
                <Badge tone="red">
                  Banned{client.bannedReason ? ` — ${client.bannedReason}` : ''}
                </Badge>
              )}
              {client.smsOptedOut && <Badge tone="amber">SMS opted out</Badge>}
              {client.emailOptedOut && (
                <Badge tone="amber">Email opted out</Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-s2">
              <Badge tone="neutral">{memberId}</Badge>
              {client.tags.map((t) => (
                <Badge key={t.id} tone="accent">
                  {t.name}
                </Badge>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-s4 gap-y-s1 t-body-sm text-ink-soft">
              {client.email && (
                <span className="truncate" title={client.email}>
                  ✉ {client.email}
                </span>
              )}
              {client.phone && <span>☎ {client.phone}</span>}
              <span>📅 Member since {formatDate(stats.memberSince)}</span>
            </div>
          </div>
        </div>

        {/* Right: stat strip */}
        <div className="flex shrink-0 flex-wrap gap-s5 border-l border-surface-3 pl-s5">
          <div className="flex flex-col gap-s1">
            <span className="t-display-md font-display text-ink">
              {stats.totalVisits}
            </span>
            <span className="t-eyebrow text-ink-soft">Total visits</span>
          </div>
          <div className="flex flex-col gap-s1">
            <span className="t-display-md font-display text-ink">
              {stats.lastVisit ? formatDate(stats.lastVisit.scheduledStartAt) : '—'}
            </span>
            <span className="t-eyebrow text-ink-soft">Last visit</span>
          </div>
          <div className="flex flex-col gap-s1">
            <span className="t-body-md text-ink truncate max-w-[180px]" title={stats.lastVisit?.staffName ?? ''}>
              {stats.lastVisit?.staffName ?? '—'}
            </span>
            <span className="t-eyebrow text-ink-soft">Last seen</span>
            {stats.lastVisit && (
              <span className="t-caption text-ink-soft">
                {formatDateTime(stats.lastVisit.scheduledStartAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3-button action row — Quick Book / Edit profile / Add note */}
      <div className="mt-s5 flex flex-wrap items-center gap-s2 border-t border-surface-3 pt-s4">
        <Link href={quickBookHref as Route} className="no-underline">
          <Button variant="accent" size="md" icon={<span aria-hidden="true">📅</span>}>
            Quick Book
          </Button>
        </Link>
        <Link href={editHref as Route} className="no-underline">
          <Button variant="ghost" size="md" icon={<span aria-hidden="true">✎</span>}>
            Edit profile
          </Button>
        </Link>
        <Link href={addNoteHref as Route} className="no-underline">
          <Button variant="ghost" size="md" icon={<span aria-hidden="true">💬</span>}>
            Add note
          </Button>
        </Link>
      </div>
    </Card>
  );
}
