'use client';

import { useState, useTransition } from 'react';

import { cn } from '@/lib/cn';

import {
  deleteClientNoteAction,
  pinClientNoteAction,
} from './_actions';

// Per-row Pin/Unpin + Delete controls. Lives in its own small client island
// so the parent list can stay a server component.

export function NoteRowActions({
  clientId,
  noteId,
  pinned,
}: {
  clientId: string;
  noteId: string;
  pinned: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function onTogglePin() {
    setError(null);
    startTransition(async () => {
      const res = await pinClientNoteAction(clientId, noteId, !pinned);
      if (!res.ok && res.error) setError(res.error);
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteClientNoteAction(clientId, noteId);
      if (!res.ok && res.error) {
        setError(res.error);
        setConfirmingDelete(false);
      }
    });
  }

  return (
    <div className="flex items-center gap-s2">
      {error && (
        <span className="t-caption text-red" role="alert">
          {error}
        </span>
      )}

      <button
        type="button"
        onClick={onTogglePin}
        disabled={isPending}
        className={cn(
          'inline-flex items-center gap-s1 rounded-sm border px-s2 py-s1',
          't-caption transition-colors duration-fast',
          pinned
            ? 'border-sage bg-sage-tint text-sage-deep'
            : 'border-line bg-surface text-ink-3 hover:bg-sage-tint-2',
          isPending && 'opacity-60',
        )}
        title={pinned ? 'Unpin this note' : 'Pin this note'}
      >
        {pinned ? 'Unpin' : 'Pin'}
      </button>

      {confirmingDelete ? (
        <div className="inline-flex items-center gap-s2">
          <span className="t-caption text-ink-3">Delete?</span>
          <button
            type="button"
            onClick={onDelete}
            disabled={isPending}
            className={cn(
              'rounded-sm border border-red bg-red-pale px-s2 py-s1',
              't-caption text-red hover:bg-red hover:text-ink-inv',
              isPending && 'opacity-60',
            )}
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            disabled={isPending}
            className={cn(
              'rounded-sm border border-line bg-surface px-s2 py-s1',
              't-caption text-ink-3 hover:bg-sage-tint-2',
            )}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={isPending}
          className={cn(
            'rounded-sm border border-line bg-surface px-s2 py-s1',
            't-caption text-ink-3 hover:bg-red-pale hover:text-red',
            isPending && 'opacity-60',
          )}
          title="Delete this note"
        >
          Delete
        </button>
      )}
    </div>
  );
}
