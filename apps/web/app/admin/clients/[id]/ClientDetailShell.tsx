'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, type ReactNode } from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';
import type { WhoamiLocation } from '@/lib/api/whoami';

import {
  ClientQuickBookDrawer,
  type ClientQuickBookSummary,
} from './ClientQuickBookDrawer';
import { ClientProfileHero } from './_components/ClientProfileHero';
import { ClientProfileLayout } from './_components/ClientProfileLayout';

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const quickBookOpen = searchParams.get('quickbook') === '1';
  const canQuickBook = !summary.deletedAt && !summary.banned;

  const openHref = (() => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('quickbook', '1');
    return `${pathname}?${next.toString()}` as Route;
  })();

  const closeQuickBook = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('quickbook');
    const qs = next.toString();
    router.replace((qs ? `${pathname}?${qs}` : pathname) as Route);
  }, [router, pathname, searchParams]);

  const quickBookButton = canQuickBook ? (
    <Link
      href={openHref}
      className={cn(
        'inline-flex items-center gap-s2 rounded-md bg-sage-deep px-s5 py-s3',
        't-body-sm font-semibold text-ink-inv no-underline shadow-md',
        'transition-colors duration-fast hover:bg-ink',
      )}
    >
      <CalendarIcon />
      Quick Book
    </Link>
  ) : (
    <Button
      type="button"
      variant="primary"
      size="md"
      className={cn(
        'gap-s2 bg-sage-deep text-ink-inv shadow-md',
        'enabled:hover:bg-ink',
      )}
      disabled
      title="Cannot Quick Book a banned or deleted client."
    >
      <CalendarIcon />
      Quick Book
    </Button>
  );

  return (
    <>
      <div className="relative flex flex-col gap-s6">
        <div>
          <Link
            href="/admin/clients"
            className={cn(
              'inline-flex items-center gap-s2 rounded-sm px-s2 py-s1',
              't-body-sm font-medium text-sage-deep no-underline',
              'transition-colors duration-fast hover:bg-sage-tint-2 hover:text-ink',
            )}
          >
            <span aria-hidden>←</span>
            Clients
          </Link>
        </div>

        <ClientProfileHero
          summary={summary}
          hero={hero}
          visitTotal={visitTotal}
          quickBookSlot={quickBookButton}
        />

        <ClientProfileLayout
          clientId={summary.id}
          visitTotal={visitTotal}
        >
          {children}
        </ClientProfileLayout>
      </div>

      <ClientQuickBookDrawer
        open={quickBookOpen}
        onClose={closeQuickBook}
        client={summary}
        services={quickBookDirectory.services}
        staff={quickBookDirectory.staff}
        locations={quickBookDirectory.locations}
        directoryError={quickBookDirectoryError}
      />
    </>
  );
}
