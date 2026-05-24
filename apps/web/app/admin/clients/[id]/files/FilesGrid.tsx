import type { Route } from 'next';
import Link from 'next/link';

import { ImageIcon, PlusIcon } from '@/app/admin/_shell/icons';
import type { MediaAsset } from '@/lib/api/media';
import { cn } from '@/lib/cn';

import { FileTile } from './FileTile';

// Server-rendered tile grid of media assets attached to the client. Image
// thumbnails are pre-resolved upstream (page.tsx) and threaded through as
// `displayUrlByAssetId`. Non-image tiles render mime icons; their
// "Preview" action fetches a signed URL on click and opens it in a new
// tab — see FileTile.tsx.

export function FilesGrid({
  assets,
  clientId,
  displayUrlByAssetId,
  uploadHref,
  buildPreviewHref,
}: {
  assets: MediaAsset[];
  clientId: string;
  displayUrlByAssetId: Record<string, string>;
  uploadHref: Route;
  buildPreviewHref: (assetId: string) => Route;
}) {
  if (assets.length === 0) {
    return (
      <div
        className={cn(
          'rounded-md border border-line bg-surface-2 p-s8 text-center',
        )}
      >
        <div
          className={cn(
            'mx-auto mb-s3 flex h-12 w-12 items-center justify-center',
            'rounded-md border border-sage-soft bg-sage-tint text-sage-deep',
          )}
        >
          <ImageIcon size={20} />
        </div>
        <h4 className="font-display text-[22px] text-ink">No files yet.</h4>
        <p className="mx-auto mt-s2 max-w-sm t-body-sm text-ink-3">
          Drag any photos or paperwork into the upload area to attach them
          to this client&apos;s profile.
        </p>
        <div className="mt-s4 inline-flex">
          <Link
            href={uploadHref}
            className={cn(
              'inline-flex items-center gap-s2 rounded-full bg-accent px-s5 py-s2',
              'text-[13px] font-semibold text-ink-inv no-underline',
              'transition-colors duration-fast hover:bg-sage-deep',
            )}
          >
            <PlusIcon size={14} />
            Upload first file
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ul
      className={cn(
        'grid gap-s4',
        'grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4',
      )}
    >
      {assets.map((a) => (
        <FileTile
          key={a.id}
          asset={a}
          clientId={clientId}
          displayUrl={displayUrlByAssetId[a.id] ?? null}
          previewHref={buildPreviewHref(a.id)}
        />
      ))}
    </ul>
  );
}
