import Link from 'next/link';

import { Card } from '@/components/ui';
import { listServiceCategories } from '@/lib/api/service-categories';
import { ApiError } from '@/lib/api/client';

import { CategoryInlineForm } from './CategoryInlineForm';

export default async function ServiceCategoriesPage() {
  let error: string | null = null;
  let data: Awaited<ReturnType<typeof listServiceCategories>> | null = null;
  try {
    data = await listServiceCategories({ take: 200 });
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      error = 'You do not have access to this page.';
    } else if (err instanceof ApiError) {
      error = err.message;
    } else {
      throw err;
    }
  }

  return (
    <div className="flex flex-col gap-s6">
      <div>
        <Link
          href="/admin/services"
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to services
        </Link>
      </div>
      <header className="flex flex-col gap-s1">
        <span className="t-eyebrow text-accent">Catalog</span>
        <h1 className="t-display-lg">Service categories</h1>
        <p className="t-body-sm text-ink-soft max-w-[540px]">
          Group services for public booking and admin lists. Assign a category on each
          service from the Services screen.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-red/30 bg-red-pale/50 px-s4 py-s3 t-body-sm text-red">
          {error}
        </div>
      )}

      {data && (
        <>
          <Card padding="md">
            <CategoryInlineForm />
          </Card>

          <Card padding="sm" className="overflow-hidden p-0">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-surface-3 bg-surface-2 text-left">
                  <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Name</th>
                  <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Order</th>
                </tr>
              </thead>
              <tbody>
                {data.categories.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-s4 py-s6 t-body-sm text-ink-soft">
                      No categories yet. Add one above.
                    </td>
                  </tr>
                ) : (
                  data.categories.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-surface-3 last:border-b-0 transition-colors duration-fast hover:bg-surface-2/80"
                    >
                      <td className="px-s4 py-s3 t-body-md">{c.name}</td>
                      <td className="px-s4 py-s3 t-body-md text-ink-soft tabular-nums">
                        {c.displayOrder}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
