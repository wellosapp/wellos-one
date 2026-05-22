'use client';

import { useState, useTransition } from 'react';

import { cn } from '@/lib/cn';

import {
  archiveFileAction,
  deleteFileAction,
  getFileDisplayUrlAction,
} from './_actions';

// Per-card Download / Archive / Delete controls. Download is a two-step:
// fetch a signed displayUrl on click, then open it in a new tab.

export function FileCardActions({
  clientId,
  assetId,
  archived,
}: {
  clientId: string;
  assetId: string;
  archived: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function onDownload() {
    setError(null);
    startTransition(async () => {
      const res = await getFileDisplayUrlAction(assetId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const url = res.data.displayUrl;
      if (!url) {
        setError('No download URL available (R2 may not be configured).');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  function onArchive() {
    setError(null);
    startTransition(async () => {
      const res = await archiveFileAction(clientId, assetId);
      if (!res.ok && res.error) setError(res.error);
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteFileAction(clientId, assetId);
      if (!res.ok && res.error) {
        setError(res.error);
        setConfirmingDelete(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-s1">
      <div className="flex items-center gap-s1">
        <button
          type="button"
          onClick={onDownload}
          disabled={isPending}
          className={cn(
            'rounded-sm border border-line bg-surface px-s2 py-s1',
            't-caption text-ink-3 hover:bg-sage-tint-2 hover:text-ink',
            isPending && 'opacity-60',
          )}
          title="Download"
        >
          Download
        </button>
        {!archived && (
          <button
            type="button"
            onClick={onArchive}
            disabled={isPending}
            className={cn(
              'rounded-sm border border-line bg-surface px-s2 py-s1',
              't-caption text-ink-3 hover:bg-sage-tint-2 hover:text-ink',
              isPending && 'opacity-60',
            )}
            title="Archive"
          >
            Archive
          </button>
        )}
        {confirmingDelete ? (
          <span className="inline-flex items-center gap-s1">
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
          </span>
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
            title="Delete"
          >
            Delete
          </button>
        )}
      </div>
      {error && (
        <span className="t-caption text-red" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
