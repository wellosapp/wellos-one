'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';
import type { WhoamiLocation } from '@/lib/api/whoami';

import {
  ClientQuickBookDrawer,
  type ClientQuickBookSummary,
} from './ClientQuickBookDrawer';
import { ClientProfileTabs } from './ClientProfileTabs';

export type ClientQuickBookDirectory = {
  services: Service[];
  staff: Staff[];
  locations: WhoamiLocation[];
};

export type ClientProfileHeroMeta = {
  email: string | null;
  phone: string | null;
  createdAt: string;
};

function profileInitials(summary: ClientQuickBookSummary): string {
  const a = summary.firstName.trim()[0] ?? '';
  const b = summary.lastName?.trim()[0] ?? '';
  return (a + b).toUpperCase() || '?';
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M7 3v3M17 3v3M4 10h16M6 7h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

export function ClientDetailShell({
  summary,
  hero,
  quickBookDirectory,
  quickBookDirectoryError,
  visitTotal,
  children,
}: {
  summary: ClientQuickBookSummary;
  hero: ClientProfileHeroMeta;
  quickBookDirectory: ClientQuickBookDirectory;
  quickBookDirectoryError: string | null;
  visitTotal: number;
  children: ReactNode;
}) {
  const [quickBookOpen, setQuickBookOpen] = useState(false);

  const canQuickBook = !summary.deletedAt && !summary.banned;
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
    <>
      <div className="relative">
        <div
          className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-accent-pale/50 blur-3xl"
          aria-hidden
        />
        <div className="pointer-events-none absolute right-0 top-32 h-56 w-56 rounded-full bg-accent/5 blur-3xl" aria-hidden />

        <div className="relative flex flex-col gap-s8">
          <div>
            <Link
              href="/admin/clients"
              className={cn(
                'inline-flex items-center gap-s2 rounded-full px-s2 py-s1',
                't-body-sm font-medium text-accent',
                'transition-colors duration-fast hover:bg-accent-pale/60 hover:text-accent-mid',
                'no-underline',
              )}
            >
              <span aria-hidden className="text-accent/80">
                ←
              </span>
              Clients
            </Link>
          </div>

          <section
            className={cn(
              'overflow-hidden rounded-2xl border border-surface-3 bg-white shadow-md',
            )}
          >
            <div className="h-1.5 bg-gradient-to-r from-accent/25 via-accent to-accent-mid/70" />
            <div className="flex flex-col gap-s6 p-s6 lg:flex-row lg:items-start lg:justify-between lg:gap-s8 lg:p-s8">
              <div className="flex min-w-0 flex-1 flex-col gap-s5 sm:flex-row sm:items-start sm:gap-s6">
                <div
                  className={cn(
                    'flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-2xl',
                    'bg-gradient-to-br from-accent-pale via-white to-accent-pale/70',
                    'font-display text-2xl font-semibold text-accent shadow-md ring-2 ring-white',
                  )}
                  aria-hidden
                >
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="t-eyebrow text-accent">Client profile</span>
                  <h1 className="mt-s2 font-display t-display-lg tracking-tight text-ink">
                    {displayName}
                  </h1>
                  <div className="mt-s4 flex flex-wrap gap-x-s6 gap-y-s2">
                    {hero.email && (
                      <span className="inline-flex items-center gap-s2 t-body-sm text-ink-soft">
                        <MailIcon className="h-4 w-4 shrink-0 text-accent/80" />
                        <span className="truncate">{hero.email}</span>
                      </span>
                    )}
                    {hero.phone && (
                      <span className="inline-flex items-center gap-s2 t-body-sm text-ink-soft">
                        <PhoneIcon className="h-4 w-4 shrink-0 text-accent/80" />
                        <span>{hero.phone}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-s2 t-body-sm text-ink-soft">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent/50"
                        aria-hidden
                      />
                      Member since {memberSince}
                    </span>
                  </div>

                  <div className="mt-s4 flex flex-wrap gap-s2">
                    {!summary.deletedAt && !summary.banned && (
                      <Badge tone="green">Active</Badge>
                    )}
                    {summary.banned && <Badge tone="red">Banned</Badge>}
                    {summary.deletedAt && (
                      <Badge tone="neutral">
                        Inactive ·{' '}
                        {new Date(summary.deletedAt).toLocaleDateString()}
                      </Badge>
                    )}
                    {summary.tags.map((t) => (
                      <Badge key={t.id} tone="neutral">
                        {t.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  'flex shrink-0 flex-col gap-s2 sm:flex-row lg:flex-col lg:items-end',
                )}
              >
                <Button
                  type="button"
                  variant="accent"
                  size="md"
                  className={cn(
                    'gap-s2 px-s6 shadow-md',
                    'transition-[transform,box-shadow] duration-fast',
                    'enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg',
                  )}
                  disabled={!canQuickBook}
                  title={
                    !canQuickBook
                      ? 'Cannot Quick Book a banned or deleted client.'
                      : undefined
                  }
                  onClick={() => setQuickBookOpen(true)}
                >
                  <CalendarIcon />
                  Quick Book
                </Button>
              </div>
            </div>
          </section>

          <section
            className={cn(
              'overflow-hidden rounded-2xl border border-surface-3 bg-white shadow-sm',
            )}
          >
            <div
              className={cn(
                'flex flex-wrap items-end justify-between gap-x-s4 gap-y-s2',
                'border-b border-surface-3 px-s5 pb-0 pt-s2 lg:px-s8 lg:pt-s3',
              )}
            >
              <ClientProfileTabs
                clientId={summary.id}
                visitTotal={visitTotal}
                className="min-w-0 flex-1 border-b-0 px-0 sm:px-0"
              />
              <div className="mb-s2 shrink-0">
                <button
                  type="button"
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg',
                    'border border-transparent t-body-lg leading-none text-ink-soft',
                    'transition-colors duration-fast hover:border-surface-3 hover:bg-surface hover:text-ink',
                  )}
                  aria-label="More client actions"
                  title="More actions"
                >
                  ⋯
                </button>
              </div>
            </div>
            <div className="px-s6 py-s6 lg:px-s8 lg:py-s8">{children}</div>
          </section>
        </div>
      </div>

      <ClientQuickBookDrawer
        open={quickBookOpen}
        onClose={() => setQuickBookOpen(false)}
        client={summary}
        services={quickBookDirectory.services}
        staff={quickBookDirectory.staff}
        locations={quickBookDirectory.locations}
        directoryError={quickBookDirectoryError}
      />
    </>
  );
}
