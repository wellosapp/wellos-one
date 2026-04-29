import Link from 'next/link';

import { Alert, Badge, Button, Card, Input, Select } from '@/components/ui';
import { listClients, type ClientIntakeStatus } from '@/lib/api/clients';
import { ApiError } from '@/lib/api/client';

const PAGE_SIZE = 25;

const INTAKE_STATUS_LABELS: Record<ClientIntakeStatus, string> = {
  pending: 'Pending',
  sent: 'Sent',
  completed: 'Completed',
  expired: 'Expired',
};

const INTAKE_STATUS_TONE: Record<ClientIntakeStatus, 'neutral' | 'amber' | 'green' | 'red'> = {
  pending: 'neutral',
  sent: 'amber',
  completed: 'green',
  expired: 'red',
};

type SearchParams = {
  q?: string;
  intakeStatus?: string;
  page?: string;
  includeDeleted?: string;
};

function isValidIntakeStatus(v: unknown): v is ClientIntakeStatus {
  return v === 'pending' || v === 'sent' || v === 'completed' || v === 'expired';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default async function ClientsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const intakeStatus = isValidIntakeStatus(sp.intakeStatus) ? sp.intakeStatus : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const includeDeleted =
    sp.includeDeleted === 'true' || sp.includeDeleted === '1';

  let data: Awaited<ReturnType<typeof listClients>> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await listClients({
      q,
      intakeStatus,
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
    ...(intakeStatus ? { intakeStatus } : {}),
    ...(includeDeleted ? { includeDeleted: 'true' } : {}),
  };

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex items-center justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Clients</span>
          <h1 className="t-display-lg">All clients</h1>
        </div>
        <Link href="/admin/clients/new" className="no-underline">
          <Button variant="accent" size="md">
            New client
          </Button>
        </Link>
      </header>

      <Card padding="sm">
        <form method="get" className="flex flex-wrap items-center gap-s3">
          <Input
            type="text"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search name, email, or phone"
            className="min-w-[220px] flex-1"
          />
          <Select
            name="intakeStatus"
            defaultValue={intakeStatus ?? ''}
            className="min-w-[180px] flex-none"
          >
            <option value="">All intake statuses</option>
            {(Object.keys(INTAKE_STATUS_LABELS) as ClientIntakeStatus[]).map((s) => (
              <option key={s} value={s}>
                {INTAKE_STATUS_LABELS[s]}
              </option>
            ))}
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
              Including soft-deleted clients. Soft-deleted rows show in the list but their
              detail page warns they are deleted.
            </span>
            <Link
              href="/admin/clients"
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
              ? 'No clients yet.'
              : `${total} client${total === 1 ? '' : 's'} total · page ${page} of ${totalPages}`}
          </p>

          {data.clients.length > 0 && (
            <Card padding="sm" className="overflow-hidden p-0">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-surface-3 bg-surface-2 text-left">
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Name</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Email</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Phone</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Intake</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clients.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-surface-3 last:border-b-0 transition-colors duration-fast hover:bg-surface-2"
                    >
                      <td className="px-s4 py-s3 t-body-md">
                        <Link
                          href={`/admin/clients/${c.id}`}
                          className="text-accent no-underline hover:underline"
                        >
                          {c.firstName}
                          {c.lastName ? ` ${c.lastName}` : ''}
                        </Link>
                      </td>
                      <td className="px-s4 py-s3 t-body-md text-ink-soft">{c.email ?? '—'}</td>
                      <td className="px-s4 py-s3 t-body-md text-ink-soft">{c.phone ?? '—'}</td>
                      <td className="px-s4 py-s3">
                        <Badge tone={INTAKE_STATUS_TONE[c.intakeStatus]}>
                          {INTAKE_STATUS_LABELS[c.intakeStatus]}
                        </Badge>
                      </td>
                      <td className="px-s4 py-s3 t-body-sm text-ink-soft">
                        {formatDate(c.createdAt)}
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
                    pathname: '/admin/clients',
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
                    pathname: '/admin/clients',
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
