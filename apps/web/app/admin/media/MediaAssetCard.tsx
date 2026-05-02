'use client';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { MediaAsset } from '@/lib/api/media';

import { AccessClassBadge } from '@/components/admin/AccessClassBadge';

// Single tile in the media grid. Shows a thumbnail when the asset is an
// image (we don't have signed display URLs in the list payload — that's a
// detail-only resolve), otherwise a mime-type icon. Selected state mirrors
// the calendar grid's appointment block ring treatment.

function formatBytes(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function MimeIcon({ mimeType }: { mimeType: string }) {
  const top = mimeType.split('/')[0] ?? 'file';
  const label =
    top === 'image'
      ? 'IMG'
      : top === 'video'
        ? 'VID'
        : top === 'audio'
          ? 'AUD'
          : top === 'application'
            ? mimeType.endsWith('pdf')
              ? 'PDF'
              : 'DOC'
            : 'FILE';
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-2">
      <span className="t-display-sm font-display text-ink-soft">{label}</span>
    </div>
  );
}

interface MediaAssetCardProps {
  asset: MediaAsset;
  isSelected: boolean;
}

export function MediaAssetCard({ asset, isSelected }: MediaAssetCardProps) {
  const isImage = asset.mimeType.startsWith('image/');
  const isPending = asset.uploadedAt === '1970-01-01T00:00:00.000Z';
  const isArchived = asset.archivedAt !== null;

  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-md border bg-white shadow-sm',
        'transition-shadow duration-fast hover:shadow-md',
        isSelected
          ? 'border-accent ring-2 ring-accent'
          : 'border-surface-3',
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-surface-2">
        {isImage ? (
          // The list endpoint doesn't include displayUrl (signed-URL
          // generation is per-row work; we resolve on detail-open instead).
          // For images we can still render a placeholder + the badge stack
          // — full preview shows when the operator opens the drawer.
          <MimeIcon mimeType={asset.mimeType} />
        ) : (
          <MimeIcon mimeType={asset.mimeType} />
        )}

        <div className="absolute left-s2 top-s2 flex flex-wrap gap-s1">
          <AccessClassBadge accessClass={asset.accessClass} />
        </div>

        <div className="absolute right-s2 top-s2 flex flex-wrap items-center gap-s1">
          {isPending && <Badge tone="amber">Uploading…</Badge>}
          {isArchived && <Badge tone="neutral">Archived</Badge>}
        </div>
      </div>

      <div className="flex flex-col gap-s1 p-s3">
        <span className="t-body-sm truncate font-medium text-ink" title={asset.fileName}>
          {asset.fileName}
        </span>
        <div className="flex items-center justify-between gap-s2 t-caption text-ink-soft">
          <span className="truncate" title={asset.folder}>
            {asset.ownerType} · {asset.folder}
          </span>
          <span className="shrink-0">{formatBytes(asset.sizeBytes)}</span>
        </div>
      </div>
    </article>
  );
}
