import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ClientVisitTimeline } from '@/components/admin/ClientVisitTimeline';
import { Badge, Button } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { getClientTimeline } from '@/lib/api/timeline';
import { cn } from '@/lib/cn';

// /admin/clients/:id/timeline — server-rendered client visit timeline.
// Backed by GET /admin/clients/:clientId/timeline (E3-S4b). Per
// docs/04-booking UI UX Update/wellos-booking-ui-walkthrough-v2-notes-package §5.

const PAGE_SIZE = 20;

export default async function ClientTimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    skip?: string;
    serviceId?: string;
    staffId?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const skip = Math.max(0, Number(sp.skip ?? 0) || 0);

  let timeline;
  try {
    timeline = await getClientTimeline(id, {
      take: PAGE_SIZE,
      skip,
      serviceId: sp.serviceId,
      staffId: sp.staffId,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const { client, total } = timeline;
  const showingFrom = total === 0 ? 0 : skip + 1;
  const showingTo = Math.min(skip + PAGE_SIZE, total);
  const hasPrev = skip > 0;
  const hasNext = skip + PAGE_SIZE < total;

  const filterParams = new URLSearchParams();
  if (sp.serviceId) filterParams.set('serviceId', sp.serviceId);
  if (sp.staffId) filterParams.set('staffId', sp.staffId);
  const filterQs = filterParams.toString();
  const buildHref = (nextSkip: number): Route => {
    const params = new URLSearchParams(filterQs);
    if (nextSkip > 0) params.set('skip', String(nextSkip));
    const qs = params.toString();
    return (`/admin/clients/${id}/timeline${qs ? `?${qs}` : ''}`) as Route;
  };

  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
      )}
    >
      <header className="border-b border-line bg-surface-sunk/40 px-s6 py-s5 lg:px-s8 lg:py-s6">
        <div className="t-eyebrow text-sage">Visits</div>
        <h2 className="mt-s2 font-display text-[26px] text-ink">
          {total === 0
            ? 'No visits yet.'
            : `Showing ${showingFrom}–${showingTo} of ${total} visits.`}
        </h2>
        <p className="mt-s2 max-w-2xl t-body-md leading-relaxed text-ink-3">
          History of every booking with this client — confirmed, completed,
          or cancelled.
        </p>
      </header>

      <div className="flex flex-col gap-s6 p-s6 lg:p-s8">
        <div className="flex flex-wrap items-center gap-s2">
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

        <ClientVisitTimeline data={timeline} />

        {(hasPrev || hasNext) && (
          <nav
            aria-label="Timeline pagination"
            className="flex items-center justify-between gap-s4 border-t border-line pt-s4"
          >
            <div className="t-body-sm text-ink-3">
              Page {Math.floor(skip / PAGE_SIZE) + 1} of{' '}
              {Math.max(1, Math.ceil(total / PAGE_SIZE))}
            </div>
            <div className="flex items-center gap-s2">
              {hasPrev ? (
                <Link
                  href={buildHref(Math.max(0, skip - PAGE_SIZE))}
                  className="no-underline"
                >
                  <Button variant="ghost" size="sm">
                    ← Newer
                  </Button>
                </Link>
              ) : (
                <Button variant="ghost" size="sm" disabled>
                  ← Newer
                </Button>
              )}
              {hasNext ? (
                <Link href={buildHref(skip + PAGE_SIZE)} className="no-underline">
                  <Button variant="ghost" size="sm">
                    Older →
                  </Button>
                </Link>
              ) : (
                <Button variant="ghost" size="sm" disabled>
                  Older →
                </Button>
              )}
            </div>
          </nav>
        )}
      </div>
    </section>
  );
}
