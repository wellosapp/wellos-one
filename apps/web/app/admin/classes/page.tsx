import Link from 'next/link';
import type { Route } from 'next';

import { DeleteConfirmButton } from '@/components/admin/DeleteConfirmButton';
import { Alert, Badge, Button, Card, Input, Select } from '@/components/ui';
import { listClasses } from '@/lib/api/classes';
import { ApiError } from '@/lib/api/client';

import { deleteClassAction } from './_actions';

const PAGE_SIZE = 25;

type SearchParams = {
  q?: string;
  active?: string;
  page?: string;
  includeDeleted?: string;
};

function formatPrice(cents: number): string {
  if (cents === 0) return 'Free';
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

export default async function ClassesListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const active =
    sp.active === 'true' ? true : sp.active === 'false' ? false : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const includeDeleted =
    sp.includeDeleted === 'true' || sp.includeDeleted === '1';

  let data: Awaited<ReturnType<typeof listClasses>> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await listClasses({
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
      <header className="flex flex-wrap items-end justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Classes</span>
          <h1 className="t-display-lg">All classes</h1>
        </div>
        <div className="flex flex-wrap items-center gap-s3">
          <Link href={'/admin/classes/new' as Route} className="no-underline">
            <Button variant="accent" size="md">
              New class
            </Button>
          </Link>
        </div>
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
              Including soft-deleted classes. Soft-deleted rows show in the list
              but are hidden from the booking surface.
            </span>
            <Link
              href={'/admin/classes' as Route}
              className="t-body-sm text-amber underline-offset-2 hover:underline"
            >
              Hide soft-deleted
            </Link>
          </span>
        </Alert>
      )}

      {data && (
        <>
          {total === 0 && !q && active === undefined ? (
            <Card padding="lg" className="text-center">
              <div className="mx-auto flex max-w-md flex-col items-center gap-s4">
                <h2 className="t-display-sm">No classes yet</h2>
                <p className="t-body-md text-ink-soft">
                  No classes yet. Add your first class to start building your
                  studio schedule.
                </p>
                <Link
                  href={'/admin/classes/new' as Route}
                  className="no-underline"
                >
                  <Button variant="accent" size="md">
                    + Add class
                  </Button>
                </Link>
              </div>
            </Card>
          ) : (
            <>
              <p className="t-body-sm text-ink-soft">
                {total === 0
                  ? 'No classes match the current filters.'
                  : `${total} class${total === 1 ? '' : 'es'} total · page ${page} of ${totalPages}`}
              </p>

              {data.classes.length > 0 && (
                <Card padding="sm" className="overflow-hidden p-0">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-surface-3 bg-surface-2 text-left">
                        <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                          Color
                        </th>
                        <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                          Name
                        </th>
                        <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                          Duration
                        </th>
                        <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                          Price
                        </th>
                        <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                          Capacity
                        </th>
                        <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                          Status
                        </th>
                        <th className="t-eyebrow px-s4 py-s3 text-ink-soft">
                          Instructors
                        </th>
                        <th className="t-eyebrow px-s4 py-s3 text-right text-ink-soft">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.classes.map((c) => {
                        const deleteAction = deleteClassAction.bind(null, c.id);
                        return (
                          <tr
                            key={c.id}
                            className="border-b border-surface-3 last:border-b-0 transition-colors duration-fast hover:bg-surface-2"
                          >
                            <td className="px-s4 py-s3">
                              {c.color ? (
                                <span
                                  aria-hidden="true"
                                  className="inline-block h-[12px] w-[12px] rounded-sm border border-surface-3"
                                  style={{ backgroundColor: c.color }}
                                />
                              ) : (
                                <span className="t-body-sm text-ink-soft">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-s4 py-s3 t-body-md">
                              <Link
                                href={`/admin/classes/${c.id}` as Route}
                                className="text-accent no-underline hover:underline"
                              >
                                {c.name}
                              </Link>
                            </td>
                            <td className="px-s4 py-s3 t-body-md text-ink-soft">
                              {formatDuration(c.durationMinutes)}
                            </td>
                            <td className="px-s4 py-s3 t-body-md text-ink-soft">
                              {formatPrice(c.basePriceCents)}
                            </td>
                            <td className="px-s4 py-s3 t-body-md text-ink-soft">
                              Up to {c.maxCapacity}
                            </td>
                            <td className="px-s4 py-s3">
                              {c.deletedAt ? (
                                <Badge tone="red">Soft-deleted</Badge>
                              ) : c.active ? (
                                <Badge tone="green">Active</Badge>
                              ) : (
                                <Badge tone="neutral">Inactive</Badge>
                              )}
                            </td>
                            <td className="px-s4 py-s3">
                              <Badge tone="neutral">
                                {c.instructorCount}{' '}
                                {c.instructorCount === 1
                                  ? 'instructor'
                                  : 'instructors'}
                              </Badge>
                            </td>
                            <td className="px-s4 py-s3">
                              <div className="flex items-center justify-end gap-s3">
                                <Link
                                  href={`/admin/classes/${c.id}` as Route}
                                  className="t-body-sm text-accent no-underline hover:underline"
                                >
                                  Edit
                                </Link>
                                {!c.deletedAt && (
                                  <DeleteConfirmButton
                                    action={deleteAction}
                                    confirmMessage={`Soft-delete "${c.name}"? Hides from booking and lists; reversible by an admin via DB.`}
                                  />
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
                        pathname: '/admin/classes',
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
                        pathname: '/admin/classes',
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
        </>
      )}
    </div>
  );
}
