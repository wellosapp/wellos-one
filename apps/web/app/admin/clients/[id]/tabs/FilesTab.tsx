'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { AccessClassBadge } from '@/components/admin/AccessClassBadge';
import { Badge, Button, Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ClientMediaResponse } from '@/lib/api/clients';
import type { MediaAsset } from '@/lib/api/media';

// Files tab for the client profile (E3-S7). UNIONs media owned directly
// by the client + media on any of this client's appointments. Server
// returns the same 5-bucket shape as the calendar drawer's Files tab so
// rendering stays consistent. Click an asset → /admin/media?selected=<id>
// for full preview / edit / archive / soft-delete.

const CATEGORY_LABELS: Record<keyof ClientMediaResponse, string> = {
  referencePhotos: 'Reference photos',
  intakeDocs: 'Intake documents',
  consentDocs: 'Consent documents',
  receipts: 'Receipts',
  generated: 'Generated',
};

const CATEGORY_ORDER: (keyof ClientMediaResponse)[] = [
  'referencePhotos',
  'intakeDocs',
  'consentDocs',
  'receipts',
  'generated',
];

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
          : top === 'application' && mimeType.endsWith('pdf')
            ? 'PDF'
            : 'FILE';
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-2">
      <span className="t-display-sm font-display text-ink-soft">{label}</span>
    </div>
  );
}

function AssetTile({ asset }: { asset: MediaAsset }) {
  return (
    <Link
      href={`/admin/media?selected=${asset.id}` as Route}
      className="no-underline"
      aria-label={`Open ${asset.fileName}`}
    >
      <article
        className={cn(
          'flex flex-col overflow-hidden rounded-md border border-surface-3 bg-white shadow-sm',
          'transition-shadow duration-fast hover:shadow-md',
        )}
      >
        <div className="relative aspect-square w-full overflow-hidden bg-surface-2">
          <MimeIcon mimeType={asset.mimeType} />
          <div className="absolute left-s2 top-s2">
            <AccessClassBadge accessClass={asset.accessClass} />
          </div>
        </div>
        <div className="flex flex-col gap-s1 p-s3">
          <span
            className="t-body-sm truncate font-medium text-ink"
            title={asset.fileName}
          >
            {asset.fileName}
          </span>
          <div className="flex items-center justify-between gap-s2 t-caption text-ink-soft">
            <span className="truncate">{asset.folder}</span>
            <span className="shrink-0">{formatBytes(asset.sizeBytes)}</span>
          </div>
        </div>
      </article>
    </Link>
  );
}

interface FilesTabProps {
  media: ClientMediaResponse;
  clientId: string;
}

export function FilesTab({ media, clientId }: FilesTabProps) {
  const total = CATEGORY_ORDER.reduce(
    (sum, key) => sum + media[key].length,
    0,
  );

  if (total === 0) {
    return (
      <Card
        padding="lg"
        className="border border-dashed border-surface-3 bg-surface-2/40"
      >
        <div className="flex flex-col gap-s2">
          <h3 className="t-display-sm text-ink">No files yet</h3>
          <p className="t-body-md text-ink-soft">
            Files attached to this client&apos;s profile or any of their
            appointments will appear here. Upload from the Media library and
            pick this client as the owner.
          </p>
          <div className="mt-s2">
            <Link
              href={
                `/admin/media?upload=1&ownerType=client&ownerId=${clientId}` as Route
              }
              className="no-underline"
            >
              <Button variant="accent" size="sm">
                + Upload to this client
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-s5">
      <header className="flex items-center justify-between gap-s3">
        <p className="t-body-sm text-ink-soft">
          {total} file{total === 1 ? '' : 's'} linked to this client (direct +
          appointment-attached).
        </p>
        <Link
          href={
            `/admin/media?upload=1&ownerType=client&ownerId=${clientId}` as Route
          }
          className="no-underline"
        >
          <Button variant="ghost" size="sm">
            + Upload
          </Button>
        </Link>
      </header>

      {CATEGORY_ORDER.map((key) => {
        const assets = media[key];
        if (assets.length === 0) return null;
        return (
          <section key={key} className="flex flex-col gap-s3">
            <div className="flex items-center gap-s2">
              <h3 className="t-display-sm text-ink">{CATEGORY_LABELS[key]}</h3>
              <Badge tone="neutral">{assets.length}</Badge>
            </div>
            <ul
              role="list"
              className="grid grid-cols-2 gap-s3 sm:grid-cols-3 md:grid-cols-4"
            >
              {assets.map((asset) => (
                <li key={asset.id}>
                  <AssetTile asset={asset} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
