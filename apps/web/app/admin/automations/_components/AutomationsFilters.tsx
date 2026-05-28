import Link from 'next/link';
import type { Route } from 'next';

import { Card } from '@/components/ui';

import type { AutomationWorkflowStatusFilter } from '@/lib/api/automation-workflows';

const FILTERS: ReadonlyArray<{
  value: AutomationWorkflowStatusFilter;
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
];

export function AutomationsFilters({
  status,
}: {
  status: AutomationWorkflowStatusFilter;
}) {
  return (
    <Card padding="sm" className="flex flex-wrap items-center gap-s3">
      <span className="t-caption uppercase tracking-wide text-ink-soft">
        Filter
      </span>
      {FILTERS.map((f) => {
        const active = f.value === status;
        return (
          <Link
            key={f.value}
            href={
              {
                pathname: '/admin/automations',
                query: { status: f.value },
              } as unknown as Route
            }
            className={
              active
                ? 'inline-flex items-center rounded-sm bg-sage-tint px-s3 py-[6px] t-body-sm font-medium text-sage-deep no-underline'
                : 'inline-flex items-center rounded-sm border border-surface-3 bg-white px-s3 py-[6px] t-body-sm text-ink-soft no-underline transition-colors duration-fast hover:bg-surface-2'
            }
          >
            {f.label}
          </Link>
        );
      })}
    </Card>
  );
}
