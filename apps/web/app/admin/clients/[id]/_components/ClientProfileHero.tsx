import type { ReactNode } from 'react';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';

import type { ClientQuickBookSummary } from '../ClientQuickBookDrawer';
import type { ClientProfileHeroMeta } from '../ClientDetailShell';

// Restyled hero block for the client profile (replaces the old hero card
// inside ClientDetailShell). Pure visual presentation — the Quick Book
// trigger is passed in via `quickBookSlot` so the (client) parent can wire
// it to drawer state without forcing this component to be client too.

function profileInitials(summary: ClientQuickBookSummary): string {
  const a = summary.firstName.trim()[0] ?? '';
  const b = summary.lastName?.trim()[0] ?? '';
  return (a + b).toUpperCase() || '?';
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 7h16v10H4V7zm0 0l8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M8 3l2 4-2 2c1 4 4 7 8 8l2-2 4 2v4c0 1-1 2-2 2C9 17 3 11 3 5c0-1 1-2 2-2h3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M7 3v3M17 3v3M4 10h16M6 7h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ClientProfileHero({
  summary,
  hero,
  visitTotal,
  quickBookSlot,
}: {
  summary: ClientQuickBookSummary;
  hero: ClientProfileHeroMeta;
  /** Lifetime visit count, used to surface a First-time badge for new clients. */
  visitTotal: number;
  quickBookSlot: ReactNode;
}) {
  // Pronouns isn't yet on the Client schema — silent gate stays falsy until
  // the migration lands; the chip then renders without any further change.
  const pronouns =
    'pronouns' in summary && typeof (summary as { pronouns?: unknown }).pronouns === 'string'
      ? ((summary as { pronouns?: string }).pronouns ?? '').trim()
      : '';
  const isFirstTime =
    visitTotal === 0 && !summary.banned && !summary.deletedAt;
  const displayName =
    [summary.firstName, summary.lastName].filter(Boolean).join(' ').trim() ||
    'Client';
  const initials = profileInitials(summary);
  const memberSince = new Date(hero.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-lg border border-line bg-surface p-s6 shadow-md',
        'lg:p-s8',
      )}
    >
      {/* Soft sage radial in the top-right — mirrors the design's .profile-hero::before */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-0 top-0 h-full w-[220px]',
          'bg-[radial-gradient(ellipse_at_top_right,var(--sage-tint)_0%,transparent_65%)] opacity-70',
        )}
      />

      <div
        className={cn(
          'relative flex flex-col gap-s5',
          'sm:grid sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center sm:gap-s6',
        )}
      >
        <div
          aria-hidden
          className={cn(
            'flex h-24 w-24 shrink-0 items-center justify-center rounded-md',
            'border border-sage-soft bg-gradient-to-br from-sage-tint to-sage-soft',
            'font-display text-[38px] leading-none text-sage-deep',
          )}
        >
          {initials}
        </div>

        <div className="min-w-0">
          <div className="t-eyebrow text-sage">Client profile</div>
          <h1
            className={cn(
              'mt-s2 font-display leading-[1.05] tracking-tight text-ink',
              'text-[34px] sm:text-[38px]',
            )}
          >
            {summary.firstName}{' '}
            {summary.lastName ? (
              <em className="font-normal italic text-sage-deep">
                {summary.lastName}
              </em>
            ) : null}
            {!summary.firstName && !summary.lastName ? displayName : null}
          </h1>

          <div className="mt-s4 flex flex-wrap items-center gap-x-s6 gap-y-s2 t-body-sm text-ink-2">
            {hero.email && (
              <span className="inline-flex items-center gap-s2">
                <MailIcon className="h-[14px] w-[14px] shrink-0 text-ink-4" />
                <span className="truncate">{hero.email}</span>
              </span>
            )}
            {hero.phone && (
              <span className="inline-flex items-center gap-s2">
                <PhoneIcon className="h-[14px] w-[14px] shrink-0 text-ink-4" />
                <span>{hero.phone}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-s2 text-ink-3">
              <CalendarIcon className="h-[14px] w-[14px] shrink-0 text-ink-4" />
              Member since {memberSince}
            </span>
          </div>

          <div className="mt-s4 flex flex-wrap items-center gap-s2">
            {!summary.deletedAt && !summary.banned && (
              <Badge tone="green">Active</Badge>
            )}
            {summary.banned && <Badge tone="red">Banned</Badge>}
            {summary.deletedAt && (
              <Badge tone="neutral">
                Inactive · {new Date(summary.deletedAt).toLocaleDateString()}
              </Badge>
            )}
            {isFirstTime && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-s3 py-[2px]',
                  'bg-sand-soft text-ink-2 text-[12px] font-medium',
                )}
              >
                First-time
              </span>
            )}
            {/* Pronouns chip — design's third hero badge. When the schema
                lands the chip shows the actual value; until then, render a
                dimmed Coming-soon placeholder so the row visually matches
                the design's three-chip composition. */}
            <span
              className={cn(
                'inline-flex items-center rounded-full border border-line px-s3 py-[2px]',
                'bg-surface-2 text-[12px] font-medium',
                pronouns
                  ? 'text-ink-2'
                  : 'cursor-not-allowed text-ink-4 opacity-70',
              )}
              title={pronouns ? undefined : 'Coming soon — pronouns chip lights up once the schema migration lands.'}
              aria-disabled={pronouns ? undefined : 'true'}
            >
              {pronouns || 'Pronouns'}
            </span>
            {summary.tags.map((t) => (
              <Badge key={t.id} tone="neutral">
                {t.name}
              </Badge>
            ))}
          </div>
        </div>

        <div className="sm:self-start">{quickBookSlot}</div>
      </div>
    </section>
  );
}
