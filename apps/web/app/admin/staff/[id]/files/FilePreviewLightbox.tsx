'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  XIcon,
} from '@/app/admin/_shell/icons';
import type { MediaAsset } from '@/lib/api/media';
import { cn } from '@/lib/cn';

import { getFileDisplayUrlAction } from './_actions';

// Minimal in-house lightbox for image media. PDFs open in a new tab and
// never mount this. Keyboard nav: Esc to close, ← / → to cycle through
// the currently filtered image list. Server-side prefetches the displayUrl
// for the focused asset; ← / → are <Link>s that the router resolves.
//
// We don't try to prefetch adjacent images — Next will resolve those when
// the navigation happens, and the URLs are already in scope server-side.

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function FilePreviewLightbox({
  asset,
  displayUrl,
  closeHref,
  navIds,
  buildPreviewHref,
  authorLabel,
}: {
  asset: MediaAsset;
  displayUrl: string | null;
  closeHref: Route;
  navIds: string[];
  buildPreviewHref: (assetId: string) => Route;
  authorLabel: string;
}) {
  const router = useRouter();
  const [downloadPending, startDownload] = useTransition();
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const currentIdx = navIds.indexOf(asset.id);
  const prevId = currentIdx > 0 ? navIds[currentIdx - 1] : null;
  const nextId =
    currentIdx >= 0 && currentIdx < navIds.length - 1
      ? navIds[currentIdx + 1]
      : null;

  const prevHref = prevId ? buildPreviewHref(prevId) : null;
  const nextHref = nextId ? buildPreviewHref(nextId) : null;

  // Keyboard navigation. Escape closes, arrow keys cycle. router.replace
  // (not router.push) so the back button doesn't accumulate lightbox
  // navigation as history.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        router.replace(closeHref);
        return;
      }
      if (e.key === 'ArrowLeft' && prevHref) {
        e.preventDefault();
        router.replace(prevHref);
        return;
      }
      if (e.key === 'ArrowRight' && nextHref) {
        e.preventDefault();
        router.replace(nextHref);
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, closeHref, prevHref, nextHref]);

  function onDownload() {
    setDownloadError(null);
    startDownload(async () => {
      const res = await getFileDisplayUrlAction(asset.id);
      if (!res.ok) {
        setDownloadError(res.error);
        return;
      }
      const url = res.data.displayUrl;
      if (!url) {
        setDownloadError('No download URL available (R2 may not be configured).');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${asset.fileName}`}
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center',
        'bg-ink/90 backdrop-blur-sm',
      )}
    >
      {/* Top-right action bar */}
      <div className="absolute right-s4 top-s4 z-10 flex items-center gap-s2">
        <button
          type="button"
          onClick={onDownload}
          disabled={downloadPending}
          aria-label="Download"
          title="Download"
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-full',
            'bg-surface/90 text-ink-2 shadow-md',
            'transition-colors duration-fast hover:bg-surface hover:text-ink',
            downloadPending && 'opacity-60',
          )}
        >
          <DownloadIcon size={18} />
        </button>
        <Link
          href={closeHref}
          replace
          aria-label="Close preview"
          title="Close (Esc)"
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-full',
            'bg-surface/90 text-ink-2 shadow-md no-underline',
            'transition-colors duration-fast hover:bg-surface hover:text-ink',
          )}
        >
          <XIcon size={18} />
        </Link>
      </div>

      {/* Left nav arrow */}
      {prevHref && (
        <Link
          href={prevHref}
          replace
          aria-label="Previous file"
          title="Previous (←)"
          className={cn(
            'absolute left-s4 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2',
            'items-center justify-center rounded-full',
            'bg-surface/90 text-ink-2 shadow-md no-underline',
            'transition-colors duration-fast hover:bg-surface hover:text-ink',
          )}
        >
          <ChevronLeftIcon size={20} />
        </Link>
      )}

      {/* Right nav arrow */}
      {nextHref && (
        <Link
          href={nextHref}
          replace
          aria-label="Next file"
          title="Next (→)"
          className={cn(
            'absolute right-s4 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2',
            'items-center justify-center rounded-full',
            'bg-surface/90 text-ink-2 shadow-md no-underline',
            'transition-colors duration-fast hover:bg-surface hover:text-ink',
          )}
        >
          <ChevronRightIcon size={20} />
        </Link>
      )}

      {/* Centered image (or fallback) */}
      <div className="flex max-h-[90vh] max-w-[90vw] items-center justify-center">
        {displayUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl}
            alt={asset.altText ?? asset.fileName}
            className="max-h-[90vh] max-w-[90vw] object-contain"
          />
        ) : (
          <div
            className={cn(
              'rounded-md border border-line bg-surface px-s8 py-s6 text-center',
              'shadow-md',
            )}
          >
            <div className="font-display text-[20px] text-ink">
              Preview not available.
            </div>
            <p className="mt-s2 max-w-sm t-body-sm text-ink-3">
              The signed URL could not be loaded. R2 may not be configured
              for this tenant, or the asset may have been removed.
            </p>
          </div>
        )}
      </div>

      {/* Footer caption strip */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 px-s6 py-s4',
          'bg-ink/80 text-ink-inv',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-s3">
          <div className="flex min-w-0 flex-col">
            <span
              className="t-body-md font-medium truncate"
              title={asset.fileName}
            >
              {asset.fileName}
            </span>
            <span className="t-caption uppercase tracking-wide text-ink-inv/70">
              {formatDate(asset.uploadedAt)} · By {authorLabel}
            </span>
          </div>
          {asset.appointmentOwnerId && (
            <span
              title="Coming soon — appointment context."
              aria-disabled="true"
              className={cn(
                'inline-flex items-center gap-s2 rounded-full border border-ink-inv/30 px-s3 py-s1',
                't-caption uppercase tracking-wide text-ink-inv/80 cursor-not-allowed',
              )}
            >
              From appointment
            </span>
          )}
        </div>
        {downloadError && (
          <div className="mt-s2 t-caption text-red-pale" role="alert">
            {downloadError}
          </div>
        )}
      </div>
    </div>
  );
}
