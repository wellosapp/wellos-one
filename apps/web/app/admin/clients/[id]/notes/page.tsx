import { ApiError } from '@/lib/api/client';
import { listClientNotes } from '@/lib/api/client-notes';
import { cn } from '@/lib/cn';

import { NotesComposer } from './NotesComposer';
import { NotesList } from './NotesList';

export default async function ClientNotesTabPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let notes: Awaited<ReturnType<typeof listClientNotes>>['notes'] = [];
  let loadError: string | null = null;
  try {
    const res = await listClientNotes(id, { take: 200 });
    notes = res.notes;
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? err.message
        : 'Could not load notes. Is the API running?';
  }

  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
      )}
    >
      <header className="border-b border-line bg-surface-sunk/40 px-s6 py-s5 lg:px-s8 lg:py-s6">
        <div className="t-eyebrow text-sage">Notes</div>
        <h2 className="mt-s2 font-display text-[26px] text-ink">
          Internal notes & observations.
        </h2>
        <p className="mt-s2 max-w-2xl t-body-md leading-relaxed text-ink-3">
          Visible to staff only. Pinned notes always appear at the top.
        </p>
      </header>

      <div className="flex flex-col gap-s4 p-s6 lg:p-s8">
        <NotesComposer clientId={id} />

        {loadError ? (
          <div
            className={cn(
              'rounded-md border border-red/30 bg-red-pale/40 p-s4',
              't-body-sm text-red',
            )}
          >
            {loadError}
          </div>
        ) : (
          <NotesList notes={notes} clientId={id} />
        )}
      </div>
    </section>
  );
}
