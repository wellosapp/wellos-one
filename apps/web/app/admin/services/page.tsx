import Link from 'next/link';

import { Alert, Badge, Button, Card, Input, Select } from '@/components/ui';
import { listServices } from '@/lib/api/services';
import { ApiError } from '@/lib/api/client';

const PAGE_SIZE = 25;

type SearchParams = {
  q?: string;
  active?: string;
  page?: string;
  includeDeleted?: string;
};

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export default async function ServicesListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  // active param has 3 states: undefined (all), "true", "false"
  const active = sp.active === 'true' ? true : sp.active === 'false' ? false : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const includeDeleted =
    sp.includeDeleted === 'true' || sp.includeDeleted === '1';

  let data: Awaited<ReturnType<typeof listServices>> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await listServices({
      q,
      active,
      take: PAGE_SIZE,
      skip,
      includeDeleted,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      errorMessage = 'You do not have admin access to this tenant.';
    } else if (err instanceof ApiError) {
      errorMessage = err.message;
    } else {
      throw err;
    }
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const baseQuery: Record<string, string> = {
    ...(q ? { q } : {}),
    ...(active !== undefined ? { active: String(active) } : {}),
    ...(includeDeleted ? { includeDeleted: 'true' } : {}),
  };

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex items-center justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Services</span>
          <h1 className="t-display-lg">All services</h1>
        </div>
        <Link href="/admin/services/new" className="no-underline">
          <Button variant="accent" size="md">
            New service
          </Button>
        </Link>
      </header>

      <Card padding="sm">
        <form method="get" className="flex flex-wrap items-center gap-s3">
          <Input
            type="text"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search name or description"
            className="min-w-[220px] flex-1"
          />
          <Select
            name="active"
            defaultValue={active === undefined ? '' : String(active)}
            className="min-w-[180px] flex-none"
          >
            <option value="">All statuses</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </Select>
          <Button variant="primary" size="md" type="submit">
            Search
          </Button>
        </form>
      </Card>

      {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

      {includeDeleted && (
        <Alert tone="warning">
          <span className="flex flex-wrap items-center justify-between gap-s3">
            <span>
              Including soft-deleted services. Soft-deleted rows show in the list
              but are hidden from the booking surface.
            </span>
            <Link
              href="/admin/services"
              className="t-body-sm text-amber underline-offset-2 hover:underline"
            >
              Hide soft-deleted
            </Link>
          </span>
        </Alert>
      )}

      {data && (
        <>
          <p className="t-body-sm text-ink-soft">
            {total === 0
              ? 'No services yet.'
              : `${total} service${total === 1 ? '' : 's'} total · page ${page} of ${totalPages}`}
          </p>

          {data.services.length > 0 && (
            <Card padding="sm" className="overflow-hidden p-0">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-surface-3 bg-surface-2 text-left">
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Name</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Duration</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Price</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Color</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.services.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-surface-3 last:border-b-0 transition-colors duration-fast hover:bg-surface-2"
                    >
                      <td className="px-s4 py-s3 t-body-md">
                        <Link
                          href={`/admin/services/${s.id}`}
                          className="text-accent no-underline hover:underline"
                        >
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-s4 py-s3 t-body-md text-ink-soft">
                        {formatDuration(s.durationMinutes)}
                      </td>
                      <td className="px-s4 py-s3 t-body-md text-ink-soft">
                        {formatPrice(s.basePriceCents)}
                      </td>
                      <td className="px-s4 py-s3">
                        {s.color ? (
                          <span className="inline-flex items-center gap-s2">
                            <span
                              aria-hidden="true"
                              className="inline-block h-[14px] w-[14px] rounded-sm border border-surface-3"
                              style={{ backgroundColor: s.color }}
                            />
                            <code className="t-body-sm text-ink-soft">{s.color}</code>
                          </span>
                        ) : (
                          <span className="t-body-sm text-ink-soft">—</span>
                        )}
                      </td>
                      <td className="px-s4 py-s3">
                        {s.deletedAt ? (
                          <Badge tone="red">Soft-deleted</Badge>
                        ) : s.active ? (
                          <Badge tone="green">Active</Badge>
                        ) : (
                          <Badge tone="neutral">Inactive</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {totalPages > 1 && (
            <div className="flex items-center gap-s4">
              {page > 1 && (
                <Link
                  href={{
                    pathname: '/admin/services',
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
                    pathname: '/admin/services',
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
