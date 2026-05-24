'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import {
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  TrashIcon,
} from '@/app/admin/_shell/icons';
import type { MediaAsset } from '@/lib/api/media';
import { cn } from '@/lib/cn';

import { deleteFileAction, getFileDisplayUrlAction } from './_actions';

// Square gallery tile for a single MediaAsset. Image-mime assets render
// their real thumbnail (signed displayUrl prefetched server-side); other
// assets show a mime-icon placeholder. Hover surfaces Preview / Download /
// Delete actions.
//
// Click-through:
// - Image: tile is a Link to `previewHref` which mounts the lightbox.
// - PDF/other: Preview button fetches displayUrl on click and opens it in
//   a new tab (no lightbox — PDFs render natively in the browser).

function humanBytes(input: string | number): string {
  const n = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type Kind = 'image' | 'pdf' | 'doc';

function kindOf(mimeType: string): Kind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'doc';
}

export function FileTile({
  asset,
  staffId,
  displayUrl,
  previewHref,
}: {
  asset: MediaAsset;
  staffId: string;
  displayUrl: string | null;
  previewHref: Route;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const kind = kindOf(asset.mimeType);
  const archived = !!asset.archivedAt;
  const isImage = kind === 'image';

  function onOpenInNewTab() {
    setError(null);
    startTransition(async () => {
      const res = await getFileDisplayUrlAction(asset.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const url = res.data.displayUrl;
      if (!url) {
        setError('No preview URL available (R2 may not be configured).');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteFileAction(staffId, asset.id);
      if (!res.ok && res.error) {
        setError(res.error);
        setConfirmingDelete(false);
      }
    });
  }

  return (
    <li
      className={cn(
        'group flex flex-col gap-s2',
        archived && 'opacity-70',
      )}
    >
      <div
        className={cn(
          'relative aspect-square overflow-hidden rounded-md border border-line bg-surface-2 shadow-sm',
        )}
      >
        {isImage && displayUrl ? (
          // Plain <img> — R2 is an external host with signed URLs that
          // expire, so next/image's optimizer can't cache them anyway.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl}
            alt={asset.altText ?? asset.fileName}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-sunk">
            <FileTextIcon
              size={40}
              className={cn(kind === 'pdf' ? 'text-red' : 'text-ink-4')}
            />
          </div>
        )}

        {/* Kind badge — top-right */}
        <span
          className={cn(
            'absolute right-s2 top-s2 rounded-sm bg-ink/70 px-s2 py-[2px]',
            't-caption uppercase tracking-wider text-ink-inv',
          )}
        >
          {kind === 'image' ? 'IMAGE' : kind === 'pdf' ? 'PDF' : 'DOC'}
        </span>

        {/* Archived badge — top-left */}
        {archived && (
          <span
            className={cn(
              'absolute left-s2 top-s2 rounded-sm bg-sand-soft px-s2 py-[2px]',
              't-caption uppercase tracking-wider text-ink',
            )}
          >
            Archived
          </span>
        )}

        {/* Hover overlay with action buttons */}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center gap-s2 bg-ink/60',
            'opacity-0 transition-opacity duration-fast',
            'group-hover:opacity-100 focus-within:opacity-100',
          )}
        >
          {isImage ? (
            <Link
              href={previewHref}
              aria-label="Preview"
              title="Preview"
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-full',
                'bg-surface text-ink-2 shadow-sm no-underline',
                'transition-colors duration-fast hover:bg-sage-tint hover:text-sage-deep',
              )}
            >
              <EyeIcon size={16} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={onOpenInNewTab}
              disabled={isPending}
              aria-label="Preview"
              title="Open in new tab"
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-full',
                'bg-surface text-ink-2 shadow-sm',
                'transition-colors duration-fast hover:bg-sage-tint hover:text-sage-deep',
                isPending && 'opacity-60',
              )}
            >
              <EyeIcon size={16} />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenInNewTab}
            disabled={isPending}
            aria-label="Download"
            title="Download"
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-full',
              'bg-surface text-ink-2 shadow-sm',
              'transition-colors duration-fast hover:bg-sage-tint hover:text-sage-deep',
              isPending && 'opacity-60',
            )}
          >
            <DownloadIcon size={16} />
          </button>

          {confirmingDelete ? (
            <span className="inline-flex items-center gap-s1">
              <button
                type="button"
                onClick={onDelete}
                disabled={isPending}
                className={cn(
                  'rounded-full border border-red bg-red px-s2 py-s1',
                  't-caption font-semibold text-ink-inv',
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
                  'rounded-full border border-line bg-surface px-s2 py-s1',
                  't-caption text-ink-3',
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
              aria-label="Delete"
              title="Delete"
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-full',
                'bg-surface text-ink-2 shadow-sm',
                'transition-colors duration-fast hover:bg-red hover:text-ink-inv',
                isPending && 'opacity-60',
              )}
            >
              <TrashIcon size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-[2px] px-s1">
        <div
          className="t-body-sm font-medium text-ink"
          title={asset.fileName}
        >
          <span className="block truncate">{asset.fileName}</span>
        </div>
        <div className="t-caption uppercase tracking-wide text-ink-4 tabular-nums">
          {formatDate(asset.uploadedAt)} · {humanBytes(asset.sizeBytes)}
        </div>
        {error && (
          <span className="t-caption text-red" role="alert">
            {error}
          </span>
        )}
      </div>
    </li>
  );
}
