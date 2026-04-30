import Link from 'next/link';

import { Alert, Badge, Button, Card, Input, Select } from '@/components/ui';
import { listStaff } from '@/lib/api/staff';
import { ApiError } from '@/lib/api/client';

const PAGE_SIZE = 25;

type SearchParams = {
  q?: string;
  active?: string;
  page?: string;
  includeDeleted?: string;
};

function formatHourly(cents: number | null): string {
  if (cents === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatPct(value: number | string | null): string {
  if (value === null) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}

export default async function StaffListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const active = sp.active === 'true' ? true : sp.active === 'false' ? false : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const includeDeleted =
    sp.includeDeleted === 'true' || sp.includeDeleted === '1';

  let data: Awaited<ReturnType<typeof listStaff>> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await listStaff({
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
          <span className="t-eyebrow text-accent">Staff</span>
          <h1 className="t-display-lg">All staff</h1>
        </div>
        <Link href="/admin/staff/new" className="no-underline">
          <Button variant="accent" size="md">
            New staff
          </Button>
        </Link>
      </header>

      <Card padding="sm">
        <form method="get" className="flex flex-wrap items-center gap-s3">
          <Input
            type="text"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search name, email, phone, or job title"
            className="min-w-[260px] flex-1"
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
              Including soft-deleted staff. Soft-deleted rows show in the list
              but are hidden from booking and reports.
            </span>
            <Link
              href="/admin/staff"
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
              ? 'No staff yet.'
              : `${total} staff member${total === 1 ? '' : 's'} total · page ${page} of ${totalPages}`}
          </p>

          {data.staff.length > 0 && (
            <Card padding="sm" className="overflow-hidden p-0">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-surface-3 bg-surface-2 text-left">
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Name</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Title</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Email</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Hourly</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Commission</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staff.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-surface-3 last:border-b-0 transition-colors duration-fast hover:bg-surface-2"
                    >
                      <td className="px-s4 py-s3 t-body-md">
                        <Link
                          href={`/admin/staff/${s.id}`}
                          className="text-accent no-underline hover:underline"
                        >
                          {s.firstName}
                          {s.lastName ? ` ${s.lastName}` : ''}
                        </Link>
                      </td>
                      <td className="px-s4 py-s3 t-body-md text-ink-soft">
                        {s.jobTitle ?? '—'}
                      </td>
                      <td className="px-s4 py-s3 t-body-md text-ink-soft">
                        {s.email ?? '—'}
                      </td>
                      <td className="px-s4 py-s3 t-body-md text-ink-soft">
                        {formatHourly(s.hourlyRateCents)}
                      </td>
                      <td className="px-s4 py-s3 t-body-md text-ink-soft">
                        {formatPct(s.commissionRatePct)}
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
                    pathname: '/admin/staff',
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
                    pathname: '/admin/staff',
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
