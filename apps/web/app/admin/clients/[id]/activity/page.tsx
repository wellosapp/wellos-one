import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TrendUpIcon } from '@/app/admin/_shell/icons';
import { ApiError } from '@/lib/api/client';
import {
  getClientActivity,
  type ClientActivityEntry,
} from '@/lib/api/client-activity';
import { cn } from '@/lib/cn';

import { SectionHeader } from '../_components/SectionHeader';
import { loadClientDetail } from '../_data';

import { ClientActivityTimeline } from './ClientActivityTimeline';

// /admin/clients/:id/activity — server-rendered audit-log feed for one
// client. Backed by GET /admin/clients/:clientId/activity. URL-driven
// pagination via the `skip` query param.

const PAGE_SIZE = 50;

export default async function ClientActivityTabPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ skip?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const skip = Math.max(0, Number(sp.skip ?? 0) || 0);

  const client = await loadClientDetail(id);

  let items: ClientActivityEntry[] = [];
  let total = 0;
  let loadError: string | null = null;
  try {
    const res = await getClientActivity(id, { take: PAGE_SIZE, skip });
    items = res.items;
    total = res.total;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    loadError =
      err instanceof ApiError
        ? err.message
        : 'Could not load activity. Is the API running?';
  }

  const showingFrom = total === 0 ? 0 : skip + 1;
  const showingTo = Math.min(skip + PAGE_SIZE, total);
  const hasPrev = skip > 0;
  const hasNext = skip + PAGE_SIZE < total;
  const prevSkip = Math.max(0, skip - PAGE_SIZE);
  const prevHref = (`/admin/clients/${id}/activity${
    prevSkip > 0 ? `?skip=${prevSkip}` : ''
  }`) as Route;
  const nextHref = (`/admin/clients/${id}/activity?skip=${
    skip + PAGE_SIZE
  }`) as Route;

  return (
    <div className="flex flex-col gap-s6">
      <SectionHeader
        icon={TrendUpIcon}
        eyebrow="ACTIVITY"
        headline={`Audit trail for ${client.firstName}.`}
        subtitle="Staff-visible activity — edits, bookings, payments, messages — recorded for every change on this client. Related visits remain on the Visits tab."
      >
        {loadError ? (
          <div
            className={cn(
              'rounded-md border border-amber/30 bg-amber-pale/60 p-s4',
              't-body-sm text-amber',
            )}
          >
            {loadError}
          </div>
        ) : (
          <>
            <ClientActivityTimeline items={items} />
            {total > 0 && (
              <div className="mt-s4 flex flex-wrap items-center justify-between gap-s3">
                <span className="t-caption uppercase tracking-wide text-ink-4">
                  Showing {showingFrom}–{showingTo} of {total}
                </span>
                <div className="flex items-center gap-s2">
                  {hasPrev ? (
                    <Link
                      href={prevHref}
                      className={cn(
                        'inline-flex items-center rounded-full border border-line bg-surface px-s4 py-s2',
                        'text-[13px] font-medium text-ink-2 no-underline',
                        'transition-colors duration-fast hover:bg-sage-tint-2',
                      )}
                    >
                      ← Newer
                    </Link>
                  ) : null}
                  {hasNext ? (
                    <Link
                      href={nextHref}
                      className={cn(
                        'inline-flex items-center rounded-full border border-line bg-surface px-s4 py-s2',
                        'text-[13px] font-medium text-ink-2 no-underline',
                        'transition-colors duration-fast hover:bg-sage-tint-2',
                      )}
                    >
                      Older →
                    </Link>
                  ) : null}
                </div>
              </div>
            )}
          </>
        )}
      </SectionHeader>
    </div>
  );
}
