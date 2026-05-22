import { cn } from '@/lib/cn';
import type { ClientNoteSummary } from '@/lib/api/client-notes';

import { NoteRowActions } from './NoteRowActions';

// Server-rendered notes list. Pinned notes sort to the top (by createdAt
// desc), then unpinned (by createdAt desc). Row actions (Pin/Unpin +
// Delete) live in a small client island per row.

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

function authorLabel(n: ClientNoteSummary): string {
  if (n.authorStaffId) return `Staff · ${n.authorStaffId.slice(0, 6)}`;
  if (n.authorUserId) return `Admin · ${n.authorUserId.slice(0, 6)}`;
  if (n.authorClientId) return `Client · ${n.authorClientId.slice(0, 6)}`;
  return 'System';
}

export function NotesList({
  notes,
  clientId,
}: {
  notes: ClientNoteSummary[];
  clientId: string;
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
        <h4 className="font-display text-[20px] text-ink">No notes yet.</h4>
        <p className="mx-auto mt-s2 max-w-sm t-body-sm text-ink-3">
          Use the composer above to capture an observation, preference, or
          alert. Pinned notes always appear at the top.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-s3">
      {sorted.map((n) => (
        <li
          key={n.id}
          className={cn(
            'rounded-md border border-line bg-surface-2 p-s4 shadow-sm',
            n.pinned && 'border-sage-soft',
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-s3">
            <div className="flex min-w-0 flex-1 flex-col gap-s2">
              <div className="flex flex-wrap items-center gap-s2 t-body-sm">
                <span className="font-semibold text-ink">
                  {authorLabel(n)}
                </span>
                <span className="text-ink-4">· {relativeTime(n.createdAt)}</span>
                {n.pinned && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-s1 rounded-sm px-s2 py-[2px]',
                      'border border-sand-soft bg-sand-soft text-ink',
                      't-caption uppercase tracking-wide',
                    )}
                  >
                    Pinned
                  </span>
                )}
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
              </div>
              {n.title && (
                <div className="font-display text-[16px] text-ink">
                  {n.title}
                </div>
              )}
              <div className="whitespace-pre-wrap t-body-md text-ink-2">
                {n.body}
              </div>
              <div className="mt-s1 flex flex-wrap gap-s2">
                <span
                  className={cn(
                    'inline-flex items-center rounded-sm border border-line bg-surface px-s2 py-[2px]',
                    't-caption text-ink-3',
                  )}
                >
                  {n.category}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center rounded-sm border border-line bg-surface px-s2 py-[2px]',
                    't-caption text-ink-3',
                  )}
                >
                  {n.visibility}
                </span>
              </div>
            </div>
            <div className="shrink-0">
              <NoteRowActions
                clientId={clientId}
                noteId={n.id}
                pinned={n.pinned}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
