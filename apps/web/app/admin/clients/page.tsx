import Link from 'next/link';

import { listClients, type ClientIntakeStatus } from '@/lib/api/clients';
import { ApiError } from '@/lib/api/client';

const PAGE_SIZE = 25;

const INTAKE_STATUS_LABELS: Record<ClientIntakeStatus, string> = {
  pending: 'Pending',
  sent: 'Sent',
  completed: 'Completed',
  expired: 'Expired',
};

type SearchParams = {
  q?: string;
  intakeStatus?: string;
  page?: string;
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

  let data: Awaited<ReturnType<typeof listClients>> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await listClients({ q, intakeStatus, take: PAGE_SIZE, skip });
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h1 style={{ margin: 0 }}>Clients</h1>
        <Link
          href="/admin/clients/new"
          style={{
            padding: '0.5rem 1rem',
            background: '#111',
            color: '#fff',
            borderRadius: '4px',
            textDecoration: 'none',
            fontSize: '0.9rem',
          }}
        >
          New client
        </Link>
      </div>

      <form
        method="get"
        style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
      >
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search name, email, or phone"
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '0.95rem',
          }}
        />
        <select
          name="intakeStatus"
          defaultValue={intakeStatus ?? ''}
          style={{
            padding: '0.5rem 0.75rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '0.95rem',
          }}
        >
          <option value="">All intake statuses</option>
          {(Object.keys(INTAKE_STATUS_LABELS) as ClientIntakeStatus[]).map((s) => (
            <option key={s} value={s}>
              {INTAKE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid #111',
            background: '#fff',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Search
        </button>
      </form>

      {errorMessage && (
        <div
          style={{
            padding: '0.75rem',
            background: '#fee',
            border: '1px solid #c33',
            borderRadius: '4px',
            color: '#900',
          }}
        >
          {errorMessage}
        </div>
      )}

      {data && (
        <>
          <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
            {total === 0
              ? 'No clients yet.'
              : `${total} client${total === 1 ? '' : 's'} total · page ${page} of ${totalPages}`}
          </p>
          {data.clients.length > 0 && (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.95rem',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Name</th>
                  <th style={{ padding: '0.5rem' }}>Email</th>
                  <th style={{ padding: '0.5rem' }}>Phone</th>
                  <th style={{ padding: '0.5rem' }}>Intake</th>
                  <th style={{ padding: '0.5rem' }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.clients.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <Link
                        href={`/admin/clients/${c.id}`}
                        style={{ color: '#1a5cff', textDecoration: 'none' }}
                      >
                        {c.firstName}
                        {c.lastName ? ` ${c.lastName}` : ''}
                      </Link>
                    </td>
                    <td style={{ padding: '0.5rem', color: '#444' }}>{c.email ?? '—'}</td>
                    <td style={{ padding: '0.5rem', color: '#444' }}>{c.phone ?? '—'}</td>
                    <td style={{ padding: '0.5rem' }}>
                      {INTAKE_STATUS_LABELS[c.intakeStatus]}
                    </td>
                    <td style={{ padding: '0.5rem', color: '#666' }}>
                      {formatDate(c.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {page > 1 && (
                <Link
                  href={{
                    pathname: '/admin/clients',
                    query: {
                      ...(q ? { q } : {}),
                      ...(intakeStatus ? { intakeStatus } : {}),
                      page: page - 1,
                    },
                  }}
                >
                  ← Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={{
                    pathname: '/admin/clients',
                    query: {
                      ...(q ? { q } : {}),
                      ...(intakeStatus ? { intakeStatus } : {}),
                      page: page + 1,
                    },
                  }}
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
