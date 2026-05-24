import type { Route } from 'next';
import Link from 'next/link';

import { ImageIcon, PlusIcon } from '@/app/admin/_shell/icons';
import { ApiError } from '@/lib/api/client';
import {
  getMediaAsset,
  listMediaAssets,
  type MediaAsset,
} from '@/lib/api/media';
import { cn } from '@/lib/cn';

import { loadStaffDetail } from '../_components/_data';

import { FilePreviewLightbox } from './FilePreviewLightbox';
import { FilesDropzone } from './FilesDropzone';
import { FilesGrid } from './FilesGrid';
import { FilesStorageStrip } from './FilesStorageStrip';
import { FolderFilterPills } from './FolderFilterPills';

// /admin/staff/:id/files — server-rendered files tab. Matches the visual
// fidelity established by the client Files tab. URL drives state:
//   ?folder=photos|documents → filter pill + mimeType partition
//   ?upload=1                → FilesDropzone mounted (otherwise hidden)
//   ?preview=<assetId>       → FilePreviewLightbox mounted
//
// All three URL params are independent and preserved across each other so
// e.g. opening a preview from inside the Photos filter keeps the filter
// active when the lightbox closes.

type FilesSearchParams = {
  folder?: string;
  upload?: string;
  preview?: string;
};

function parseFolder(raw: string | undefined): 'photos' | 'documents' | null {
  if (raw === 'photos' || raw === 'documents') return raw;
  return null;
}

function authorLabelFor(asset: MediaAsset): string {
  if (asset.uploadedByStaffId) return `Staff · ${asset.uploadedByStaffId.slice(0, 6)}`;
  if (asset.uploadedByUserId) return `Admin · ${asset.uploadedByUserId.slice(0, 6)}`;
  if (asset.uploadedByClient) return 'Client';
  return 'System';
}

export default async function StaffFilesTabPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<FilesSearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const activeFolder = parseFolder(sp.folder);
  const uploadOpen = sp.upload === '1';
  const previewId = sp.preview && sp.preview.length > 0 ? sp.preview : null;

  const staff = await loadStaffDetail(id);

  let assets: MediaAsset[] = [];
  let loadError: string | null = null;
  try {
    const res = await listMediaAssets({
      ownerType: 'staff',
      ownerId: id,
      take: 200,
    });
    assets = res.assets;
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? err.message
        : 'Could not load files. Is the API running?';
  }

  // Drop soft-deleted; archived stays visible (FileTile ghosts it).
  const visibleAssets = assets.filter((a) => !a.deletedAt);
  const filteredAssets =
    activeFolder === 'photos'
      ? visibleAssets.filter((a) => a.mimeType.startsWith('image/'))
      : activeFolder === 'documents'
        ? visibleAssets.filter((a) => !a.mimeType.startsWith('image/'))
        : visibleAssets;

  // Prefetch displayUrls for image assets currently visible in the grid.
  // Promise.allSettled so a single R2 hiccup doesn't fail the whole page —
  // a tile whose URL fails just falls back to the mime-icon placeholder.
  const imageAssets = filteredAssets.filter((a) =>
    a.mimeType.startsWith('image/'),
  );
  const settled = await Promise.allSettled(
    imageAssets.map((a) => getMediaAsset(a.id)),
  );
  const displayUrlByAssetId: Record<string, string> = {};
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value.displayUrl) {
      displayUrlByAssetId[r.value.asset.id] = r.value.displayUrl;
    }
  }

  // For ?preview, fetch a fresh signed URL (the one above may not include
  // the requested asset if it's outside the current folder filter — guard
  // tenant + cross-staff safety with staffOwnerId === id).
  let previewBundle: { asset: MediaAsset; displayUrl: string | null } | null = null;
  if (previewId) {
    const inList = assets.find((a) => a.id === previewId);
    if (inList && inList.staffOwnerId === id) {
      try {
        const detail = await getMediaAsset(previewId);
        previewBundle = { asset: detail.asset, displayUrl: detail.displayUrl };
      } catch {
        // Drop silently — the lightbox just won't mount.
      }
    }
  }

  function makeHref(next: {
    folder?: 'photos' | 'documents' | null;
    upload?: boolean;
    preview?: string | null;
  }): Route {
    const params = new URLSearchParams();
    const folder = next.folder === undefined ? activeFolder : next.folder;
    const upload = next.upload === undefined ? uploadOpen : next.upload;
    const preview = next.preview === undefined ? previewId : next.preview;
    if (folder) params.set('folder', folder);
    if (upload) params.set('upload', '1');
    if (preview) params.set('preview', preview);
    const qs = params.toString();
    return (`/admin/staff/${id}/files${qs ? `?${qs}` : ''}`) as Route;
  }

  const uploadHref = makeHref({ upload: true });
  const closeUploadHref = makeHref({ upload: false });
  const closePreviewHref = makeHref({ preview: null });

  const totalBytes = visibleAssets.reduce(
    (sum, a) => sum + Number(a.sizeBytes || 0),
    0,
  );

  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
      )}
    >
      <header
        className={cn(
          'border-b border-line bg-surface-sunk/40',
          'px-s6 py-s5 lg:px-s8 lg:py-s6',
        )}
      >
        <div className="flex items-start justify-between gap-s4">
          <div className="flex items-center gap-s2 t-eyebrow tracking-wide text-sage">
            <ImageIcon size={14} />
            <span>FILES</span>
          </div>
          <div className="flex items-center gap-s2">
            {uploadOpen ? (
              <Link
                href={closeUploadHref}
                className={cn(
                  'inline-flex items-center gap-s2 rounded-full border border-line bg-surface-2 px-s4 py-s2',
                  'text-[13px] font-medium text-ink-3 no-underline',
                  'transition-colors duration-fast hover:bg-sage-tint-2',
                )}
              >
                Close upload
              </Link>
            ) : (
              <Link
                href={uploadHref}
                className={cn(
                  'inline-flex items-center gap-s2 rounded-full bg-accent px-s5 py-s2',
                  'text-[13px] font-semibold text-ink-inv no-underline',
                  'transition-colors duration-fast hover:bg-sage-deep',
                )}
              >
                <PlusIcon size={14} />
                Upload
              </Link>
            )}
          </div>
        </div>
        <h2 className="mt-s2 font-display text-[22px] leading-tight text-ink">
          Files for {staff.firstName}.
        </h2>
        <p className="mt-s2 max-w-2xl t-body-md leading-relaxed text-ink-3">
          Photos, documents, headshots, licenses, and certifications for this
          staff member.
        </p>
      </header>

      <div className="flex flex-col gap-s4 p-s6 lg:p-s8">
        <FolderFilterPills
          staffId={id}
          activeFolder={activeFolder}
          preserveUpload={uploadOpen}
        />
        <FilesStorageStrip
          count={visibleAssets.length}
          totalBytes={totalBytes}
        />

        {uploadOpen && (
          <FilesDropzone staffId={id} closeHref={closeUploadHref} />
        )}

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
          <FilesGrid
            assets={filteredAssets}
            staffId={id}
            displayUrlByAssetId={displayUrlByAssetId}
            uploadHref={uploadHref}
            buildPreviewHref={(assetId) => makeHref({ preview: assetId })}
          />
        )}

        <p className="t-caption text-ink-4">
          Visibility: admin-only. Clinical and provider-only partitions
          coming soon.
        </p>
      </div>

      {previewBundle && (
        <FilePreviewLightbox
          asset={previewBundle.asset}
          displayUrl={previewBundle.displayUrl}
          closeHref={closePreviewHref}
          navIds={imageAssets.map((a) => a.id)}
          buildPreviewHref={(assetId) => makeHref({ preview: assetId })}
          authorLabel={authorLabelFor(previewBundle.asset)}
        />
      )}
    </section>
  );
}
