import { Badge } from '@/components/ui';
import type { ClientNoteSummary } from '@/lib/api/timeline';

import { NoteCategoryBadge } from './NoteCategoryBadge';
import { NoteVisibilityBadge } from './NoteVisibilityBadge';

// Renders a list of ClientNoteSummary rows grouped under an appointment
// (or service or client — the component is agnostic, callers decide
// what set to pass in). Per walkthrough §5 + §6.

function authorLine(note: ClientNoteSummary): string {
  switch (note.authorType) {
    case 'admin':
      return 'Admin';
    case 'staff':
      return 'Staff';
    case 'customer':
      return 'Customer';
    case 'system':
      return 'System';
  }
}

function timeLine(note: ClientNoteSummary): string {
  const created = new Date(note.createdAt);
  return created.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function LinkedNotesList({
  notes,
  emptyLabel = 'No notes for this visit yet.',
}: {
  notes: ClientNoteSummary[];
  emptyLabel?: string;
}) {
  if (notes.length === 0) {
    return (
      <p className="t-body-sm text-ink-soft italic">{emptyLabel}</p>
    );
  }

  return (
    <ul className="flex flex-col gap-s3">
      {notes.map((note) => (
        <li
          key={note.id}
          className="flex flex-col gap-s2 rounded-sm border border-surface-3 bg-surface-1 p-s3"
        >
          <div className="flex flex-wrap items-center gap-s2">
            <NoteCategoryBadge category={note.category} />
            <NoteVisibilityBadge visibility={note.visibility} />
            {note.priority === 'alert' && <Badge tone="red">Alert</Badge>}
            {note.pinned && <Badge tone="accent">Pinned</Badge>}
          </div>

          {note.title && (
            <div className="t-body-md font-medium text-ink">{note.title}</div>
          )}
          <p className="t-body-md whitespace-pre-wrap text-ink">{note.body}</p>

          <div className="t-caption flex flex-wrap gap-s2 text-ink-soft">
            <span>{authorLine(note)}</span>
            <span aria-hidden="true">•</span>
            <span>{timeLine(note)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
