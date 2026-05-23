'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { MoreIcon } from '@/app/admin/_shell/icons';
import { cn } from '@/lib/cn';

import {
  deleteClientNoteAction,
  pinClientNoteAction,
} from './_actions';

// Kebab popover for per-note row actions. Pin/Unpin and Delete are real;
// Edit, Archive, Acknowledge render as disabled items with "(coming soon)"
// captions until the Notes domain epic wires them up. Closes on outside
// click + Escape, and after any action that succeeds.

export function NoteRowKebab({
  clientId,
  noteId,
  pinned,
}: {
  clientId: string;
  noteId: string;
  pinned: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmingDelete(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setConfirmingDelete(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  function onTogglePin() {
    setError(null);
    startTransition(async () => {
      const res = await pinClientNoteAction(clientId, noteId, !pinned);
      if (!res.ok && res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteClientNoteAction(clientId, noteId);
      if (!res.ok && res.error) {
        setError(res.error);
        setConfirmingDelete(false);
        return;
      }
      setOpen(false);
      setConfirmingDelete(false);
    });
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Note actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-md',
          'border border-line bg-surface text-ink-3',
          'transition-colors duration-fast hover:bg-sage-tint-2 hover:text-ink',
          'focus-visible:outline-none focus-visible:shadow-focus',
        )}
      >
        <MoreIcon size={16} />
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-[calc(100%+4px)] z-30 min-w-[200px]',
            'rounded-md border border-line bg-surface py-s2 shadow-md',
          )}
        >
          {error && (
            <div className="px-s3 pb-s2 t-caption text-red" role="alert">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={onTogglePin}
            disabled={isPending}
            className={cn(
              'flex w-full items-center px-s3 py-s2 text-left',
              't-body-sm text-ink-2',
              'transition-colors duration-fast hover:bg-sage-tint-2 hover:text-ink',
              isPending && 'opacity-60',
            )}
          >
            {pinned ? 'Unpin' : 'Pin'}
          </button>

          <button
            type="button"
            disabled
            aria-disabled="true"
            className={cn(
              'flex w-full flex-col items-start px-s3 py-s2 text-left',
              't-body-sm text-ink-4 cursor-not-allowed opacity-60',
            )}
          >
            <span>Edit</span>
            <span className="italic t-caption text-ink-4">
              (coming soon)
            </span>
          </button>

          <button
            type="button"
            disabled
            aria-disabled="true"
            className={cn(
              'flex w-full flex-col items-start px-s3 py-s2 text-left',
              't-body-sm text-ink-4 cursor-not-allowed opacity-60',
            )}
          >
            <span>Archive</span>
            <span className="italic t-caption text-ink-4">
              (coming soon)
            </span>
          </button>

          <button
            type="button"
            disabled
            aria-disabled="true"
            className={cn(
              'flex w-full flex-col items-start px-s3 py-s2 text-left',
              't-body-sm text-ink-4 cursor-not-allowed opacity-60',
            )}
          >
            <span>Acknowledge</span>
            <span className="italic t-caption text-ink-4">
              (coming soon)
            </span>
          </button>

          <div className="my-s1 border-t border-line-soft" />

          {confirmingDelete ? (
            <div className="flex items-center justify-between gap-s2 px-s3 py-s2">
              <span className="t-caption text-ink-3">Delete?</span>
              <div className="flex items-center gap-s2">
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
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={isPending}
              className={cn(
                'flex w-full items-center px-s3 py-s2 text-left',
                't-body-sm text-red',
                'transition-colors duration-fast hover:bg-red-pale/50',
                isPending && 'opacity-60',
              )}
            >
              Delete
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
