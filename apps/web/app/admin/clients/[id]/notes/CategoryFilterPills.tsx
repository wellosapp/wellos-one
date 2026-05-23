import type { Route } from 'next';
import Link from 'next/link';

import type { NoteCategory } from '@/lib/api/client-notes';
import { cn } from '@/lib/cn';

// Server-rendered category filter row. Each pill is a Link that pushes
// `?category=<value>` (or clears it for "All"). When the composer is open,
// `?compose=1` is preserved so toggling categories doesn't dismiss it.

const USER_FACING_CATEGORIES: ReadonlyArray<{
  value: NoteCategory;
  label: string;
}> = [
  { value: 'general', label: 'General' },
  { value: 'preference', label: 'Preference' },
  { value: 'formula', label: 'Formula' },
  { value: 'allergy', label: 'Allergy' },
  { value: 'medical', label: 'Medical' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'billing', label: 'Billing' },
  { value: 'internal', label: 'Internal' },
];

export function CategoryFilterPills({
  clientId,
  activeCategory,
  preserveCompose,
}: {
  clientId: string;
  activeCategory: NoteCategory | null;
  preserveCompose: boolean;
}) {
  function buildHref(value: NoteCategory | null): Route {
    const params = new URLSearchParams();
    if (value) params.set('category', value);
    if (preserveCompose) params.set('compose', '1');
    const qs = params.toString();
    return (`/admin/clients/${clientId}/notes${qs ? `?${qs}` : ''}`) as Route;
  }

  const pills: Array<{ key: string; label: string; value: NoteCategory | null }> = [
    { key: 'all', label: 'All', value: null },
    ...USER_FACING_CATEGORIES.map((c) => ({
      key: c.value,
      label: c.label,
      value: c.value,
    })),
  ];

  return (
    <div className="flex flex-wrap gap-s2">
      {pills.map((p) => {
        const isActive =
          p.value === null ? activeCategory === null : activeCategory === p.value;
        return (
          <Link
            key={p.key}
            href={buildHref(p.value)}
            className={cn(
              'inline-flex items-center rounded-full border px-s3 py-s1',
              't-body-sm no-underline transition-colors duration-fast',
              isActive
                ? 'border-sage bg-sage-tint text-sage-deep'
                : 'border-line bg-surface text-ink-2 hover:bg-sage-tint-2',
            )}
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
