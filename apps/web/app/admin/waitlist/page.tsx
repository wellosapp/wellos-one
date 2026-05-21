import Link from 'next/link';

import { Alert, Badge, Button, Card, Input } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { listServices, type Service } from '@/lib/api/services';
import {
  listWaitlistEntries,
  type WaitlistEntry,
  type WaitlistEntryStatus,
} from '@/lib/api/waitlist';

import { cancelWaitlistAction, offerWaitlistAction } from './_actions';

const PAGE_SIZE = 25;

type SearchParams = {
  status?: string;
  serviceId?: string;
  q?: string;
  page?: string;
  includeExpired?: string;
};

const STATUS_FILTERS: Array<{ value: WaitlistEntryStatus | ''; label: string }> = [
  { value: '', label: 'All active' },
  { value: 'active', label: 'Active' },
  { value: 'offered', label: 'Offered' },
  { value: 'claimed', label: 'Claimed' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

function parseStatus(v: string | undefined): WaitlistEntryStatus | undefined {
  if (
    v === 'active' ||
    v === 'offered' ||
    v === 'claimed' ||
    v === 'expired' ||
    v === 'cancelled'
  ) {
    return v;
  }
  return undefined;
}

function statusTone(s: WaitlistEntryStatus): 'green' | 'amber' | 'red' | 'neutral' | 'accent' {
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatPreferredRange(
  startIso: string | null,
  endIso: string | null,
): string {
  if (!startIso && !endIso) return 'Any time';
  if (startIso && !endIso) return `From ${formatDate(startIso)}`;
  if (!startIso && endIso) return `Until ${formatDate(endIso)}`;
  return `${formatDate(startIso!)} – ${formatDate(endIso!)}`;
}

function contactSummary(entry: WaitlistEntry): string {
  const parts: string[] = [];
  if (entry.contactEmail) parts.push(entry.contactEmail);
  if (entry.contactPhone) parts.push(entry.contactPhone);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const serviceId = sp.serviceId?.trim() || undefined;
  const q = sp.q?.trim() || undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const includeExpired =
    sp.includeExpired === 'true' || sp.includeExpired === '1';

  let data: Awaited<ReturnType<typeof listWaitlistEntries>> | null = null;
  let services: Service[] = [];
  let errorMessage: string | null = null;

  try {
    const [waitlist, servicesRes] = await Promise.all([
      listWaitlistEntries({
        status,
        serviceId,
        q,
        page,
        limit: PAGE_SIZE,
        includeExpired,
      }),
      listServices({ take: 200 }).catch(() => ({ services: [] as Service[], total: 0 })),
    ]);
    data = waitlist;
    services = servicesRes.services;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      errorMessage = 'You do not have access to this tenant.';
    } else if (err instanceof ApiError) {
      errorMessage = err.message;
    } else {
      throw err;
    }
  }

  const serviceById = new Map(services.map((s) => [s.id, s]));
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const baseQuery: Record<string, string> = {
    ...(status ? { status } : {}),
    ...(serviceId ? { serviceId } : {}),
    ...(q ? { q } : {}),
    ...(includeExpired ? { includeExpired: 'true' } : {}),
  };

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex items-center justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Waitlist</span>
          <h1 className="t-display-lg">Waitlist entries</h1>
          <p className="t-body-sm text-ink-soft">
            Clients waiting for a slot. Cancellation, schedule changes, and
            manual offers trigger matching.
          </p>
        </div>
      </header>

      <Card padding="sm">
        <form method="get" className="flex flex-wrap items-center gap-s3">
          <Input
            type="text"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search name, email, phone"
            className="min-w-[220px] flex-1"
          />
          <select
            name="status"
            defaultValue={status ?? ''}
            className="rounded-xl border border-surface-3 bg-white px-s3 py-s2 t-body-md text-ink shadow-sm"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value || 'all'} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            name="serviceId"
            defaultValue={serviceId ?? ''}
            className="rounded-xl border border-surface-3 bg-white px-s3 py-s2 t-body-md text-ink shadow-sm"
          >
            <option value="">All services</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-s2 t-body-sm text-ink-soft">
            <input
              type="checkbox"
              name="includeExpired"
              value="true"
              defaultChecked={includeExpired}
            />
            Show expired + cancelled
          </label>
          <Button variant="primary" size="md" type="submit">
            Filter
          </Button>
        </form>
      </Card>

      {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

      {data && (
        <>
          <p className="t-body-sm text-ink-soft">
            {total === 0
              ? 'No waitlist entries yet.'
              : `${total} entr${total === 1 ? 'y' : 'ies'} total · page ${page} of ${totalPages}`}
          </p>

          {data.entries.length > 0 && (
            <Card padding="sm" className="overflow-hidden p-0">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-surface-3 bg-surface-2 text-left">
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Contact</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Service</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Preferred dates</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Time</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Status</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">TTL</th>
                    <th className="t-eyebrow px-s4 py-s3 text-right text-ink-soft">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry) => {
                    const service = serviceById.get(entry.serviceId);
                    const cancelAction = cancelWaitlistAction.bind(null, entry.id);
                    const offerAction = offerWaitlistAction.bind(null, entry.id);
                    const isTerminal =
                      entry.status === 'claimed' ||
                      entry.status === 'expired' ||
                      entry.status === 'cancelled';
                    return (
                      <tr
                        key={entry.id}
                        className="border-b border-surface-3 last:border-b-0 transition-colors duration-fast hover:bg-surface-2"
                      >
                        <td className="px-s4 py-s3 t-body-md">
                          <Link
                            href={`/admin/waitlist/${entry.id}`}
                            className="text-accent no-underline hover:underline"
                          >
                            {entry.contactName}
                          </Link>
                          <div className="t-body-sm text-ink-soft">
                            {contactSummary(entry)}
                          </div>
                        </td>
                        <td className="px-s4 py-s3 t-body-sm text-ink">
                          {service?.name ?? entry.serviceId.slice(0, 8)}
                        </td>
                        <td className="px-s4 py-s3 t-body-sm text-ink-soft">
                          {formatPreferredRange(
                            entry.preferredStart,
                            entry.preferredEnd,
                          )}
                        </td>
                        <td className="px-s4 py-s3 t-body-sm text-ink-soft">
                          {entry.preferredTimeOfDay ?? '—'}
                        </td>
                        <td className="px-s4 py-s3">
                          <Badge tone={statusTone(entry.status)}>
                            {entry.status}
                          </Badge>
                        </td>
                        <td className="px-s4 py-s3 t-body-sm text-ink-soft">
                          {formatDate(entry.ttlExpiresAt)}
                        </td>
                        <td className="px-s4 py-s3">
                          <div className="flex items-center justify-end gap-s3">
                            <Link
                              href={`/admin/waitlist/${entry.id}`}
                              className="t-body-sm text-accent no-underline hover:underline"
                            >
                              View
                            </Link>
                            {entry.status === 'active' && (
                              <form action={offerAction}>
                                <button
                                  type="submit"
                                  className="t-body-sm text-accent underline-offset-2 hover:underline"
                                >
                                  Mark offered
                                </button>
                              </form>
                            )}
                            {!isTerminal && (
                              <form action={cancelAction}>
                                <button
                                  type="submit"
                                  className="t-body-sm text-red underline-offset-2 hover:underline"
                                >
                                  Cancel
                                </button>
                              </form>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          {totalPages > 1 && (
            <div className="flex items-center gap-s4">
              {page > 1 && (
                <Link
                  href={{
                    pathname: '/admin/waitlist',
                    query: { ...baseQuery, page: page - 1 },
                  }}
                  className="t-body-sm text-accent no-underline hover:underline"
                >
                  ← Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={{
                    pathname: '/admin/waitlist',
                    query: { ...baseQuery, page: page + 1 },
                  }}
                  className="t-body-sm text-accent no-underline hover:underline"
                >
                  Next →
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
