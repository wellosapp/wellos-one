'use client';

import Link from 'next/link';
import type { Route } from 'next';

import { AccessClassBadge } from '@/components/admin/AccessClassBadge';
import { Badge, Button, Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { AppointmentMediaResponse, MediaAsset } from '@/lib/api/media';
import { formatDateTimeLocal } from '@/lib/calendar';

// Renders the appointment-scoped media grouped by category. Backed by
// GET /admin/appointments/:appointmentId/media (E3-S6). Mirrors the spec
// shape in docs/04-booking UI UX Update/wellos_booking_r2_uiux_package
// /wellos_calendar_booking_r2_uiux_buildout.md §6.3 L572-588.
//
// Click an asset card → routes to /admin/media?selected=<id> so the full
// MediaDetailDrawer (preview + edit + archive + soft-delete) handles the
// drilldown. Avoids re-implementing detail logic in two places.

const CATEGORY_LABELS: Record<keyof AppointmentMediaResponse, string> = {
  referencePhotos: 'Reference photos',
  intakeDocs: 'Intake documents',
  consentDocs: 'Consent documents',
  receipts: 'Receipts',
  generated: 'Generated',
};

// Order matches the spec — operationally most relevant first.
const CATEGORY_ORDER: (keyof AppointmentMediaResponse)[] = [
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
  // Routes to the global Media Manager detail drawer for full preview +
  // edit + archive + soft-delete. The list endpoint doesn't include
  // displayUrl (per-row signing is detail-only work), so the tile
  // rendering stays cheap.
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
          <span className="t-caption text-ink-soft">
            {formatDateTimeLocal(asset.uploadedAt)}
          </span>
        </div>
      </article>
    </Link>
  );
}

interface FilesTabProps {
  media: AppointmentMediaResponse;
  appointmentId: string;
}

export function FilesTab({ media, appointmentId }: FilesTabProps) {
  const total = CATEGORY_ORDER.reduce((sum, key) => sum + media[key].length, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col gap-s4">
        <Card
          padding="lg"
          className="border border-dashed border-surface-3 bg-surface-2/40"
        >
          <div className="flex flex-col gap-s2">
            <h3 className="t-display-sm text-ink">No files yet</h3>
            <p className="t-body-md text-ink-soft">
              Reference photos, intake forms, consent docs, and receipts
              attached to this appointment will appear here. Upload from
              the Media library and pick this appointment as the owner.
            </p>
            <div className="mt-s2">
              <Link
                href={
                  `/admin/media?upload=1&ownerType=appointment&ownerId=${appointmentId}` as Route
                }
                className="no-underline"
              >
                <Button variant="accent" size="sm">
                  + Upload to this appointment
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-s5">
      <header className="flex items-center justify-between gap-s3">
        <p className="t-body-sm text-ink-soft">
          {total} file{total === 1 ? '' : 's'} attached to this appointment.
        </p>
        <Link
          href={
            `/admin/media?upload=1&ownerType=appointment&ownerId=${appointmentId}` as Route
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
              className="grid grid-cols-2 gap-s3 sm:grid-cols-3"
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
