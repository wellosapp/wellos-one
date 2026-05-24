import type { Route } from 'next';
import Link from 'next/link';

import { cn } from '@/lib/cn';

// Server-rendered folder filter row for the staff Files tab. All / Photos /
// Documents are real client-side mimeType partitions and are clickable. The
// remaining four (Licenses, Certifications, Tax forms, ID) render as dimmed
// "Coming soon" placeholders — surfacing the eventual folder taxonomy
// without wiring it yet.
//
// `?upload=1` is preserved when toggling folders so the dropzone stays open
// across folder changes. `?preview` is NOT preserved — opening a different
// folder shouldn't keep an unrelated lightbox mounted.

type Pills = Array<
  | { kind: 'real'; key: string; label: string; value: 'photos' | 'documents' | null }
  | { kind: 'soon'; key: string; label: string; tooltip: string }
>;

const PILLS: Pills = [
  { kind: 'real', key: 'all', label: 'All', value: null },
  { kind: 'real', key: 'photos', label: 'Photos', value: 'photos' },
  { kind: 'real', key: 'documents', label: 'Documents', value: 'documents' },
  {
    kind: 'soon',
    key: 'licenses',
    label: 'Licenses',
    tooltip:
      'Coming soon — license folder ties into expiration tracking + renewal reminders in the Business File Center epic.',
  },
  {
    kind: 'soon',
    key: 'certifications',
    label: 'Certifications',
    tooltip:
      'Coming soon — CE credit tracking lands with the Staff Onboarding Forms epic.',
  },
  {
    kind: 'soon',
    key: 'tax-forms',
    label: 'Tax forms',
    tooltip:
      'Coming soon — W9 + tax-form vault lands with the Business File Center epic.',
  },
  {
    kind: 'soon',
    key: 'id',
    label: 'ID',
    tooltip:
      'Coming soon — ID upload lands with the Staff Onboarding Forms epic.',
  },
];

export function FolderFilterPills({
  staffId,
  activeFolder,
  preserveUpload,
}: {
  staffId: string;
  activeFolder: 'photos' | 'documents' | null;
  preserveUpload: boolean;
}) {
  function buildHref(value: 'photos' | 'documents' | null): Route {
    const params = new URLSearchParams();
    if (value) params.set('folder', value);
    if (preserveUpload) params.set('upload', '1');
    const qs = params.toString();
    return (`/admin/staff/${staffId}/files${qs ? `?${qs}` : ''}`) as Route;
  }

  return (
    <div className="flex flex-wrap gap-s2">
      {PILLS.map((p) => {
        if (p.kind === 'soon') {
          return (
            <span
              key={p.key}
              title={p.tooltip}
              aria-disabled="true"
              className={cn(
                'inline-flex items-center rounded-full border px-s3 py-s1',
                't-body-sm transition-colors duration-fast',
                'border-line bg-surface text-ink-3 cursor-not-allowed opacity-60',
              )}
            >
              {p.label}
            </span>
          );
        }
        const isActive =
          p.value === null ? activeFolder === null : activeFolder === p.value;
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
