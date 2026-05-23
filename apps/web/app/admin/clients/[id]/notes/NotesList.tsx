import type { Route } from 'next';
import Link from 'next/link';

import { PlusIcon } from '@/app/admin/_shell/icons';
import type {
  ClientNoteSummary,
  NoteCategory,
} from '@/lib/api/client-notes';
import { cn } from '@/lib/cn';

import { NoteRowKebab } from './NoteRowKebab';

// Server-rendered notes list with card-chrome rows. Pinned notes sort to
// the top (no separate "PINNED" section per the approved plan). Each card
// surfaces an exact timestamp + category/priority/pinned badges, optional
// title, body with a soft Read-more affordance, and a kebab for actions.

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function exactTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function authorLabel(n: ClientNoteSummary): string {
  if (n.authorStaffId) return `Staff · ${n.authorStaffId.slice(0, 6)}`;
  if (n.authorUserId) return `Admin · ${n.authorUserId.slice(0, 6)}`;
  if (n.authorClientId) return `Client · ${n.authorClientId.slice(0, 6)}`;
  return 'System';
}

// Per-category badge tinting. High-signal medical/safety categories get a
// red tint; preference/behavioral get sand; billing gets warm; everything
// else stays neutral. Editorial polish without a maintenance burden.
const CATEGORY_TINT: Partial<Record<NoteCategory, string>> = {
  allergy: 'border-red/30 bg-red-pale/40 text-red',
  medical: 'border-red/30 bg-red-pale/40 text-red',
  formula: 'border-red/30 bg-red-pale/40 text-red',
  preference: 'border-line-soft bg-sand-soft text-ink-2',
  behavioral: 'border-line-soft bg-sand-soft text-ink-2',
  billing: 'border-line-soft bg-warm-pale text-ink-2',
};

function categoryBadgeClass(cat: NoteCategory): string {
  return CATEGORY_TINT[cat] ?? 'border-line bg-surface text-ink-3';
}

function categoryLabel(cat: NoteCategory): string {
  // Title-case the underscored enum values for badge display.
  return cat
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

const READ_MORE_THRESHOLD = 280;

export function NotesList({
  notes,
  clientId,
  composeHref,
}: {
  notes: ClientNoteSummary[];
  clientId: string;
  composeHref: Route;
}) {
  // Pinned first, each group descending by createdAt.
  const sorted = [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (sorted.length === 0) {
    return (
      <div
        className={cn(
          'rounded-md border border-line bg-surface-2 p-s8 text-center',
        )}
      >
        <h4 className="font-display text-[22px] text-ink">No notes yet.</h4>
        <p className="mx-auto mt-s2 max-w-sm t-body-sm text-ink-3">
          Add operational notes, preferences, allergies, and context that
          staff need to know.
        </p>
        <div className="mt-s4 inline-flex">
          <Link
            href={composeHref}
            className={cn(
              'inline-flex items-center gap-s2 rounded-full bg-accent px-s5 py-s2',
              'text-[13px] font-semibold text-ink-inv no-underline',
              'transition-colors duration-fast hover:bg-sage-deep',
            )}
          >
            <PlusIcon size={14} />
            Add first note
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-s3">
      {sorted.map((n) => {
        const showReadMore = n.body.length > READ_MORE_THRESHOLD;
        return (
          <li
            key={n.id}
            className={cn(
              'rounded-md border border-line bg-surface-2 p-s4 shadow-sm',
              n.pinned && 'border-sage-soft',
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-s3">
              <span
                className={cn(
                  't-caption uppercase tracking-wide text-ink-3',
                )}
              >
                {exactTimestamp(n.createdAt)}
              </span>
              <div className="flex flex-wrap items-center gap-s2">
                <span
                  className={cn(
                    'inline-flex items-center rounded-sm border px-s2 py-[2px]',
                    't-caption uppercase tracking-wide',
                    categoryBadgeClass(n.category),
                  )}
                >
                  {categoryLabel(n.category)}
                </span>
                {n.priority === 'alert' && (
                  <span
                    className={cn(
                      'inline-flex items-center rounded-sm px-s2 py-[2px]',
                      'border border-red bg-red-pale text-red',
                      't-caption uppercase tracking-wide',
                    )}
                  >
                    Alert
                  </span>
                )}
                {n.pinned && (
                  <span
                    className={cn(
                      'inline-flex items-center rounded-sm px-s2 py-[2px]',
                      'border border-sand-soft bg-sand-soft text-ink',
                      't-caption uppercase tracking-wide',
                    )}
                  >
                    Pinned
                  </span>
                )}
              </div>
            </div>

            {n.title && (
              <div className="mt-s2 text-[16px] font-medium text-ink">
                {n.title}
              </div>
            )}

            <div
              className={cn(
                'mt-s2 whitespace-pre-wrap t-body-md text-ink-2',
                'line-clamp-4',
              )}
            >
              {n.body}
            </div>

            {showReadMore && (
              <span
                aria-disabled="true"
                title="Coming soon — note detail view."
                className="mt-s1 inline-block t-caption text-ink-4 cursor-not-allowed"
              >
                Read more
              </span>
            )}

            <div
              className={cn(
                'mt-s3 flex flex-wrap items-center justify-between gap-s2',
                'border-t border-line-soft pt-s3',
              )}
            >
              <span className="t-caption uppercase tracking-wide text-ink-3">
                By {authorLabel(n)} · {relativeTime(n.createdAt)}
              </span>
              <NoteRowKebab
                clientId={clientId}
                noteId={n.id}
                pinned={n.pinned}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
