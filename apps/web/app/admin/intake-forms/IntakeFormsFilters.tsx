import Link from 'next/link';

import { Button, Card, Input, Select } from '@/components/ui';

import type { IntakeFormStatusFilter } from './intake-forms-dashboard-helpers';

function isStatusFilter(v: string): v is IntakeFormStatusFilter {
  return v === '' || v === 'draft' || v === 'published' || v === 'archived';
}

type Props = {
  status: IntakeFormStatusFilter;
  q: string;
  groupId: string | undefined;
};

export function IntakeFormsFilters({ status, q, groupId }: Props) {
  const clearHref = '/admin/intake-forms';

  return (
    <Card padding="sm">
      <form method="get" className="flex flex-wrap items-center gap-s3">
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by title"
          className="min-w-[200px] flex-1"
          autoComplete="off"
          aria-label="Search intake forms by title"
        />
        <Select
          name="status"
          defaultValue={isStatusFilter(status) ? status : ''}
          className="min-w-[180px] flex-none"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </Select>
        {groupId ? <input type="hidden" name="groupId" value={groupId} /> : null}
        <Button variant="primary" size="md" type="submit">
          Apply
        </Button>
        {(status || q.trim() || groupId) && (
          <Link href={clearHref} className="t-body-sm text-accent no-underline hover:underline">
            Clear filters
          </Link>
        )}
      </form>
      {groupId ? (
        <p className="mt-s3 border-t border-surface-3 pt-s3 t-body-sm text-ink-soft">
          Showing versions for one form family ({groupId.slice(0, 8)}…).
        </p>
      ) : null}
    </Card>
  );
}
