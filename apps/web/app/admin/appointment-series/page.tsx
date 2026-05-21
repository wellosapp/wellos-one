import Link from 'next/link';

import { Alert, Button, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { listServices, type Service } from '@/lib/api/services';
import { listStaff, type Staff } from '@/lib/api/staff';

import {
  listAppointmentSeries,
  type ListSeriesResponse,
  type SeriesStatus,
} from './_api';
import { SeriesListTable } from './SeriesListTable';

const PAGE_SIZE = 25;

const STATUS_TABS: Array<{ value: SeriesStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'completed', label: 'Completed' },
];

function parseStatus(v: string | undefined): SeriesStatus | undefined {
  if (v === 'active' || v === 'cancelled' || v === 'completed') return v;
  return undefined;
}

type SearchParams = {
  status?: string;
  clientId?: string;
  staffId?: string;
  cursor?: string;
};

export default async function AppointmentSeriesListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const clientId = sp.clientId?.trim() || undefined;
  const staffId = sp.staffId?.trim() || undefined;
  const cursor = sp.cursor?.trim() || undefined;

  let data: ListSeriesResponse | null = null;
  let services: Service[] = [];
  let staff: Staff[] = [];
  let errorMessage: string | null = null;

  try {
    const [seriesRes, servicesRes, staffRes] = await Promise.all([
      listAppointmentSeries({
        status,
        clientId,
        staffId,
        cursor,
        limit: PAGE_SIZE,
      }),
      listServices({ take: 200 }).catch(
        () => ({ services: [] as Service[], total: 0 }),
      ),
      listStaff({ take: 200 }).catch(
        () => ({ staff: [] as Staff[], total: 0 }),
      ),
    ]);
    data = seriesRes;
    services = servicesRes.services;
    staff = staffRes.staff;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      errorMessage = 'You do not have admin access to this tenant.';
    } else if (err instanceof ApiError) {
      errorMessage = err.message;
    } else {
      throw err;
    }
  }

  const servicesByIdRecord: Record<
    string,
    { name: string; durationMinutes: number }
  > = {};
  for (const s of services) {
    servicesByIdRecord[s.id] = {
      name: s.name,
      durationMinutes: s.durationMinutes,
    };
  }
  const staffByIdRecord: Record<
    string,
    { firstName: string; lastName: string | null }
  > = {};
  for (const s of staff) {
    staffByIdRecord[s.id] = {
      firstName: s.firstName,
      lastName: s.lastName,
    };
  }

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex items-center justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Scheduling</span>
          <h1 className="t-display-lg">Recurring series</h1>
          <p className="t-body-sm text-ink-soft">
            Recurring appointment templates and their generated occurrences.
          </p>
        </div>
        <Link href="/admin/appointment-series/new" className="no-underline">
          <Button variant="accent" size="md">
            New series
          </Button>
        </Link>
      </header>

      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-s4">
          <nav
            aria-label="Filter by status"
            className="inline-flex items-center gap-s1 rounded-md border border-surface-3 bg-surface-2 p-s1"
          >
            {STATUS_TABS.map((tab) => {
              const isActive =
                (tab.value === '' && !status) || tab.value === status;
              return (
                <Link
                  key={tab.value || 'all'}
                  href={{
                    pathname: '/admin/appointment-series',
                    query: tab.value ? { status: tab.value } : {},
                  }}
                  className={
                    isActive
                      ? 'rounded-sm bg-white px-s3 py-s1 t-body-sm font-semibold text-ink no-underline shadow-sm'
                      : 'rounded-sm px-s3 py-s1 t-body-sm text-ink-soft no-underline hover:text-ink'
                  }
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          <form
            method="get"
            className="flex flex-wrap items-center gap-s2"
          >
            {status ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            <select
              name="staffId"
              defaultValue={staffId ?? ''}
              className="rounded-xl border border-surface-3 bg-white px-s3 py-s2 t-body-md text-ink shadow-sm"
            >
              <option value="">All staff</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName}
                  {s.lastName ? ` ${s.lastName}` : ''}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="clientId"
              defaultValue={clientId ?? ''}
              placeholder="Client id"
              className="rounded-xl border border-surface-3 bg-white px-s3 py-s2 t-body-md text-ink shadow-sm"
            />
            <Button variant="primary" size="sm" type="submit">
              Filter
            </Button>
          </form>
        </div>
      </Card>

      {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

      {data && (
        <>
          {data.rows.length === 0 ? (
            <Card padding="lg" className="text-center">
              <p className="t-body-md text-ink">No recurring series yet.</p>
              <p className="mt-s1 t-body-sm text-ink-soft">
                Create a template and Wellos will generate every occurrence on
                the calendar.
              </p>
              <div className="mt-s4 inline-flex">
                <Link
                  href="/admin/appointment-series/new"
                  className="no-underline"
                >
                  <Button variant="accent" size="md">
                    + New series
                  </Button>
                </Link>
              </div>
            </Card>
          ) : (
            <SeriesListTable
              rows={data.rows}
              services={servicesByIdRecord}
              staff={staffByIdRecord}
            />
          )}

          {data.nextCursor && (
            <div className="flex items-center justify-end">
              <Link
                href={{
                  pathname: '/admin/appointment-series',
                  query: {
                    ...(status ? { status } : {}),
                    ...(staffId ? { staffId } : {}),
                    ...(clientId ? { clientId } : {}),
                    cursor: data.nextCursor,
                  },
                }}
                className="t-body-sm text-accent no-underline hover:underline"
              >
                Next page →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
