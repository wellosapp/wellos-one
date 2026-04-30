import Link from 'next/link';

import { DeleteConfirmButton } from '@/components/admin/DeleteConfirmButton';
import { Alert, Badge, Button, Card, Input } from '@/components/ui';
import { listClientTags } from '@/lib/api/client-tags';
import { ApiError } from '@/lib/api/client';

import { deleteClientTagAction } from './_actions';

const PAGE_SIZE = 25;

type SearchParams = {
  q?: string;
  page?: string;
  includeDeleted?: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default async function ClientTagsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const skip = (page - 1) * PAGE_SIZE;
  const includeDeleted =
    sp.includeDeleted === 'true' || sp.includeDeleted === '1';

  let data: Awaited<ReturnType<typeof listClientTags>> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await listClientTags({
      q,
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
    ...(includeDeleted ? { includeDeleted: 'true' } : {}),
  };

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex items-center justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Tags</span>
          <h1 className="t-display-lg">Client tags</h1>
        </div>
        <Link href="/admin/client-tags/new" className="no-underline">
          <Button variant="accent" size="md">
            New tag
          </Button>
        </Link>
      </header>

      <Card padding="sm">
        <form method="get" className="flex flex-wrap items-center gap-s3">
          <Input
            type="text"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search tag name"
            className="min-w-[220px] flex-1"
          />
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
              Including soft-deleted tags. Soft-deleted rows show in the list
              but are hidden from pickers and badge rendering.
            </span>
            <Link
              href="/admin/client-tags"
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
              ? 'No client tags yet.'
              : `${total} tag${total === 1 ? '' : 's'} total · page ${page} of ${totalPages}`}
          </p>

          {data.tags.length > 0 && (
            <Card padding="sm" className="overflow-hidden p-0">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-surface-3 bg-surface-2 text-left">
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Name</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Color</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Status</th>
                    <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Created</th>
                    <th className="t-eyebrow px-s4 py-s3 text-right text-ink-soft">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tags.map((t) => {
                    const deleteAction = deleteClientTagAction.bind(null, t.id);
                    return (
                      <tr
                        key={t.id}
                        className="border-b border-surface-3 last:border-b-0 transition-colors duration-fast hover:bg-surface-2"
                      >
                        <td className="px-s4 py-s3 t-body-md">
                          <Link
                            href={`/admin/client-tags/${t.id}`}
                            className="text-accent no-underline hover:underline"
                          >
                            {t.name}
                          </Link>
                        </td>
                        <td className="px-s4 py-s3">
                          {t.color ? (
                            <span className="inline-flex items-center gap-s2">
                              <span
                                aria-hidden="true"
                                className="inline-block h-[14px] w-[14px] rounded-sm border border-surface-3"
                                style={{ backgroundColor: t.color }}
                              />
                              <code className="t-body-sm text-ink-soft">{t.color}</code>
                            </span>
                          ) : (
                            <span className="t-body-sm text-ink-soft">—</span>
                          )}
                        </td>
                        <td className="px-s4 py-s3">
                          {t.deletedAt ? (
                            <Badge tone="red">Soft-deleted</Badge>
                          ) : (
                            <Badge tone="green">Active</Badge>
                          )}
                        </td>
                        <td className="px-s4 py-s3 t-body-sm text-ink-soft">
                          {formatDate(t.createdAt)}
                        </td>
                        <td className="px-s4 py-s3">
                          <div className="flex items-center justify-end gap-s3">
                            <Link
                              href={`/admin/client-tags/${t.id}`}
                              className="t-body-sm text-accent no-underline hover:underline"
                            >
                              Edit
                            </Link>
                            {!t.deletedAt && (
                              <DeleteConfirmButton
                                action={deleteAction}
                                confirmMessage={`Soft-delete "${t.name}"? Hides from pickers and badges; existing assignments preserved for audit.`}
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
                    pathname: '/admin/client-tags',
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
                    pathname: '/admin/client-tags',
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
