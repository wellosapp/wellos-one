'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { AccessClassBadge } from '@/components/admin/AccessClassBadge';
import {
  Alert,
  Badge,
  Button,
  Card,
  Drawer,
  FormField,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import type {
  MediaAssetDetailResponse,
  MediaAssetVisibility,
} from '@/lib/api/media';

import {
  archiveMediaAssetAction,
  deleteMediaAssetAction,
  unarchiveMediaAssetAction,
  updateMediaAssetAction,
} from './_actions';
import type { MediaDirectory } from './MediaLibrary';

const VISIBILITIES: { value: MediaAssetVisibility; label: string }[] = [
  { value: 'location', label: 'Visible to all staff at this location' },
  { value: 'provider_only', label: 'Provider only' },
  { value: 'admin_only', label: 'Admin only' },
];

function formatBytes(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function ownerLabel(
  asset: MediaAssetDetailResponse['asset'],
  directory: MediaDirectory,
): string {
  switch (asset.ownerType) {
    case 'tenant':
      return 'Tenant root';
    case 'location': {
      const id = asset.locationOwnerId;
      const m = id ? directory.locations.find((l) => l.id === id) : null;
      return m ? `Location · ${m.name}` : `Location · ${id ?? '—'}`;
    }
    case 'service': {
      const id = asset.serviceOwnerId;
      const m = id ? directory.services.find((s) => s.id === id) : null;
      return m ? `Service · ${m.name}` : `Service · ${id ?? '—'}`;
    }
    case 'staff': {
      const id = asset.staffOwnerId;
      const m = id ? directory.staff.find((s) => s.id === id) : null;
      return m
        ? `Staff · ${m.firstName}${m.lastName ? ' ' + m.lastName : ''}`
        : `Staff · ${id ?? '—'}`;
    }
    case 'client': {
      const id = asset.clientOwnerId;
      const m = id ? directory.clients.find((c) => c.id === id) : null;
      return m
        ? `Client · ${m.firstName}${m.lastName ? ' ' + m.lastName : ''}`
        : `Client · ${id ?? '—'}`;
    }
    case 'appointment':
      return `Appointment · ${asset.appointmentOwnerId ?? '—'}`;
    case 'campaign':
      return `Campaign · ${asset.campaignOwnerId ?? '—'}`;
  }
}

interface MediaDetailDrawerProps {
  detail: MediaAssetDetailResponse;
  directory: MediaDirectory;
  onClose: () => void;
}

export function MediaDetailDrawer({
  detail,
  directory,
  onClose,
}: MediaDetailDrawerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { asset, displayUrl } = detail;
  const isImage = asset.mimeType.startsWith('image/');
  const isPending =
    asset.uploadedAt === '1970-01-01T00:00:00.000Z' || !displayUrl;
  const isArchived = asset.archivedAt !== null;

  // Local-state only; on save we PATCH and refresh.
  const [altText, setAltText] = useState<string>(asset.altText ?? '');
  const [caption, setCaption] = useState<string>(asset.caption ?? '');
  const [visibility, setVisibility] = useState<MediaAssetVisibility>(
    asset.visibility,
  );

  const dirty =
    altText !== (asset.altText ?? '') ||
    caption !== (asset.caption ?? '') ||
    visibility !== asset.visibility;

  function notify(state: { ok: boolean; error?: string }, okMessage: string) {
    if (state.ok) {
      setSuccessMessage(okMessage);
      setError(null);
      router.refresh();
    } else {
      setSuccessMessage(null);
      setError(state.error ?? 'Action failed.');
    }
  }

  function saveEdits() {
    startTransition(async () => {
      const result = await updateMediaAssetAction(asset.id, {
        altText: altText || null,
        caption: caption || null,
        visibility,
      });
      notify(result, 'Saved.');
    });
  }

  function archive() {
    startTransition(async () => {
      const result = await archiveMediaAssetAction(asset.id);
      notify(result, 'Archived.');
    });
  }

  function unarchive() {
    startTransition(async () => {
      const result = await unarchiveMediaAssetAction(asset.id);
      notify(result, 'Unarchived.');
    });
  }

  function destroy() {
    if (
      !confirm(
        'Soft-delete this asset? It will be hidden from lists and unlinked from owners. Reversible by an admin via DB.',
      )
    )
      return;
    startTransition(async () => {
      const result = await deleteMediaAssetAction(asset.id);
      if (result.ok) {
        // Drawer must close — the asset just left the listing.
        onClose();
      } else {
        notify(result, 'Deleted.');
      }
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      ariaLabel="Media asset details"
      title={
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Asset</span>
          <h2 className="t-display-md text-ink truncate" title={asset.fileName}>
            {asset.fileName}
          </h2>
        </div>
      }
      subtitle={
        <span>
          {asset.mimeType} · {formatBytes(asset.sizeBytes)}
          {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ''}
        </span>
      }
    >
      <div className="flex flex-col gap-s5 px-s6 py-s5">
        {error && <Alert tone="error">{error}</Alert>}
        {successMessage && <Alert tone="success">{successMessage}</Alert>}

        {isPending && (
          <Alert tone="warning">
            URL not available — R2 may be unconfigured, or the upload is still
            finalizing.
          </Alert>
        )}

        {/* Preview */}
        <div className="overflow-hidden rounded-md border border-surface-3 bg-surface-2">
          {isImage && displayUrl ? (
            // Plain <img> — Next/Image won't help here since R2 is an
            // external host with signed URLs that expire.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayUrl}
              alt={asset.altText ?? asset.fileName}
              className="block max-h-[420px] w-full object-contain"
            />
          ) : (
            <div className="flex aspect-video items-center justify-center">
              <span className="t-display-md text-ink-soft">
                {asset.mimeType}
              </span>
            </div>
          )}
        </div>

        {/* Status + access info */}
        <section className="flex flex-col gap-s2">
          <div className="flex flex-wrap items-center gap-s2">
            <AccessClassBadge accessClass={asset.accessClass} />
            <Badge tone={isArchived ? 'amber' : 'neutral'}>
              {isArchived ? 'Archived' : 'Live'}
            </Badge>
            {asset.protected && <Badge tone="red">Protected</Badge>}
          </div>
          <div className="t-body-sm text-ink-soft">
            {ownerLabel(asset, directory)}
          </div>
          <div className="t-body-sm text-ink-soft">Folder: {asset.folder}</div>
        </section>

        {/* Editable fields */}
        <section className="flex flex-col gap-s3 border-t border-surface-3 pt-s4">
          <h3 className="t-display-sm text-ink">Details</h3>

          <FormField label="Alt text">
            <Input
              type="text"
              maxLength={500}
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Describe the image for accessibility"
            />
          </FormField>

          <FormField label="Caption">
            <Textarea
              rows={3}
              maxLength={1000}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Optional caption shown alongside this asset"
            />
          </FormField>

          <FormField label="Visibility">
            <Select
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as MediaAssetVisibility)
              }
            >
              {VISIBILITIES.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="flex justify-end gap-s2">
            <Button
              variant="accent"
              size="sm"
              disabled={!dirty || pending}
              loading={pending}
              onClick={saveEdits}
            >
              Save details
            </Button>
          </div>
        </section>

        {/* Lifecycle actions */}
        <section className="flex flex-col gap-s3 border-t border-surface-3 pt-s4">
          <h3 className="t-display-sm text-ink">Actions</h3>
          <div className="flex flex-wrap gap-s2">
            {isArchived ? (
              <Button
                variant="accent"
                size="sm"
                disabled={pending}
                onClick={unarchive}
              >
                Unarchive
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={archive}
              >
                Archive
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={destroy}
              className="text-red hover:bg-red-pale"
            >
              Soft-delete
            </Button>
          </div>
        </section>

        {/* Audit / dev info — collapsed-style mono block. Useful when
            debugging which R2 object backs which row. */}
        <section className="flex flex-col gap-s2 border-t border-surface-3 pt-s4">
          <h3 className="t-display-sm text-ink">Storage</h3>
          <Card padding="sm" className="border border-surface-3">
            <dl className="flex flex-col gap-s2 t-caption text-ink-soft">
              <div className="flex justify-between gap-s3">
                <dt>Bucket</dt>
                <dd className="truncate font-mono text-ink">{asset.bucket}</dd>
              </div>
              <div className="flex justify-between gap-s3">
                <dt>Object key</dt>
                <dd
                  className="truncate font-mono text-ink"
                  title={asset.objectKey}
                >
                  {asset.objectKey}
                </dd>
              </div>
              {asset.checksumSha256 && (
                <div className="flex justify-between gap-s3">
                  <dt>SHA-256</dt>
                  <dd className="truncate font-mono text-ink">
                    {asset.checksumSha256.slice(0, 12)}…
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-s3">
                <dt>Uploaded</dt>
                <dd className="text-ink">
                  {isPending
                    ? 'pending'
                    : new Date(asset.uploadedAt).toLocaleString()}
                </dd>
              </div>
            </dl>
          </Card>
        </section>
      </div>
    </Drawer>
  );
}
