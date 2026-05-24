import type { ClientActivityEntry } from '@/lib/api/client-activity';
import { cn } from '@/lib/cn';

// Per-client audit-log timeline. Each row: actor initials avatar + actor
// name + action label + entity-type chip + relative time. Server-rendered,
// no client state — pagination is URL-driven from the parent page.

// Action labels — map raw action strings to human-readable copy.
// Falls back to the raw action string for unmapped values.
const ACTION_LABELS: Record<string, (entry: ClientActivityEntry) => string> = {
  'client.created': () => 'Created the client profile',
  'client.updated': () => 'Updated the client profile',
  'client.deleted': () => 'Soft-deleted the client',
  'appointment.created': () => 'Booked an appointment',
  'appointment.updated': () => 'Updated an appointment',
  'appointment.state_changed': (e) => {
    const after = e.after as { state?: string } | null;
    const state = after?.state ?? 'updated';
    return `Marked appointment as ${state}`;
  },
  'appointment.deleted': () => 'Cancelled an appointment',
  'client_note.created': () => 'Added a note',
  'client_note.updated': () => 'Edited a note',
  'client_note.pinned': () => 'Pinned a note',
  'client_note.unpinned': () => 'Unpinned a note',
  'client_note.archived': () => 'Archived a note',
  'client_note.unarchived': () => 'Unarchived a note',
  'client_note.deleted': () => 'Deleted a note',
  'client_note.acknowledged': () => 'Acknowledged a note',
  'client_intake_submission.created': () => 'Started an intake draft',
  'client_intake_submission.updated': () => 'Updated intake submission',
  'media_asset.presigned': () => 'Started a file upload',
  'media_asset.completed': () => 'Uploaded a file',
  'media_asset.updated': () => 'Updated a file',
  'media_asset.archived': () => 'Archived a file',
  'media_asset.unarchived': () => 'Unarchived a file',
  'media_asset.deleted': () => 'Deleted a file',
};

function actionLabel(entry: ClientActivityEntry): string {
  const fn = ACTION_LABELS[entry.action];
  return fn ? fn(entry) : entry.action;
}

function actorInitials(
  displayName: string | null,
  actorType: string,
): string {
  if (displayName && displayName.trim().length > 0) {
    const parts = displayName.trim().split(/\s+/).slice(0, 2);
    const joined = parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
    if (joined.length > 0) return joined;
  }
  return actorType === 'system' ? 'SYS' : '?';
}

function actorLabel(
  displayName: string | null,
  actorType: string,
): string {
  if (displayName && displayName.trim().length > 0) return displayName;
  if (actorType === 'system') return 'System';
  if (actorType === 'webhook') return 'Webhook';
  return 'Unknown';
}

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

export function ClientActivityTimeline({
  items,
}: {
  items: ClientActivityEntry[];
}) {
  if (items.length === 0) {
    return (
      <div
        className={cn(
          'rounded-md border border-line bg-surface-2 p-s8 text-center',
        )}
      >
        <h4 className="font-display text-[20px] text-ink">No activity yet.</h4>
        <p className="mx-auto mt-s2 max-w-sm t-body-sm text-ink-3">
          Staff edits, bookings, notes, intake submissions, and file
          uploads will appear here as they happen.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-s2">
      {items.map((entry) => {
        const initials = actorInitials(entry.actorDisplayName, entry.actorType);
        const name = actorLabel(entry.actorDisplayName, entry.actorType);
        return (
          <li
            key={entry.id}
            className={cn(
              'flex items-start gap-s3 rounded-md border border-line bg-surface-2 px-s4 py-s3 shadow-sm',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                'border border-sage-soft bg-sage-tint text-sage-deep',
                't-caption font-semibold tabular-nums',
              )}
            >
              {initials}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-s1">
              <div className="flex flex-wrap items-baseline gap-x-s2 gap-y-s1">
                <span className="t-body-md font-medium text-ink">{name}</span>
                <span className="t-body-md text-ink-2">
                  {actionLabel(entry)}
                </span>
              </div>
              <span className="t-caption uppercase tracking-wide text-ink-4">
                {relativeTime(entry.createdAt)} · {entry.entityType}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
