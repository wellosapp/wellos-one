'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  Alert,
  Button,
  Drawer,
  FormField,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import type {
  MediaAccessClass,
  MediaOwnerType,
} from '@/lib/api/media';

import {
  completeMediaUploadAction,
  presignMediaUploadAction,
} from './_actions';
import type { MediaDirectory } from './MediaLibrary';

const OWNER_TYPES: MediaOwnerType[] = [
  'tenant',
  'location',
  'service',
  'staff',
  'client',
  'appointment',
  'campaign',
];

const ACCESS_CLASSES: { value: MediaAccessClass; label: string }[] = [
  { value: 'public_booking', label: 'Public booking' },
  { value: 'tenant_staff', label: 'Tenant staff' },
  { value: 'client_owned', label: 'Client owned' },
  { value: 'protected_medspa', label: 'Protected medspa' },
];

const FOLDER_SUGGESTIONS = [
  'gallery',
  'avatar',
  'reference-uploads',
  'consent',
  'before-after',
  'docs',
];

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB matches the API cap

type Phase =
  | { kind: 'idle' }
  | { kind: 'presigning' }
  | { kind: 'uploading'; loaded: number; total: number }
  | { kind: 'completing' }
  | { kind: 'done' }
  | { kind: 'error'; message: string; missing?: string[] };

interface UploadPanelProps {
  directory: MediaDirectory;
  onClose: () => void;
  defaultOwnerType?: MediaOwnerType;
  defaultOwnerId?: string;
  defaultFolder?: string;
  defaultAccessClass?: MediaAccessClass;
}

export function UploadPanel({
  directory,
  onClose,
  defaultOwnerType,
  defaultOwnerId,
  defaultFolder,
  defaultAccessClass,
}: UploadPanelProps) {
  const router = useRouter();

  // Form state.
  const [ownerType, setOwnerType] = useState<MediaOwnerType>(
    defaultOwnerType ?? 'tenant',
  );
  const [ownerId, setOwnerId] = useState<string>(
    defaultOwnerId ??
      (defaultOwnerType === undefined && directory.tenantId
        ? directory.tenantId
        : ''),
  );
  const [accessClass, setAccessClass] = useState<MediaAccessClass>(
    defaultAccessClass ?? 'tenant_staff',
  );
  const [folder, setFolder] = useState<string>(defaultFolder ?? 'gallery');
  const [altText, setAltText] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  // When ownerType changes, reset ownerId to the right default — pre-fills
  // tenantId for "tenant" and clears for other types so the operator picks.
  useEffect(() => {
    if (ownerType === 'tenant' && directory.tenantId) {
      setOwnerId(directory.tenantId);
    } else if (
      ownerType === defaultOwnerType &&
      defaultOwnerId !== undefined
    ) {
      setOwnerId(defaultOwnerId);
    } else {
      setOwnerId('');
    }
  }, [ownerType, directory.tenantId, defaultOwnerType, defaultOwnerId]);

  const ownerOptions = useMemo(() => {
    switch (ownerType) {
      case 'tenant':
        return null; // Auto-pinned to tenantId.
      case 'location':
        return directory.locations.map((l) => ({
          value: l.id,
          label: l.name,
        }));
      case 'service':
        return directory.services.map((s) => ({
          value: s.id,
          label: s.name,
        }));
      case 'staff':
        return directory.staff.map((s) => ({
          value: s.id,
          label: `${s.firstName}${s.lastName ? ' ' + s.lastName : ''}`,
        }));
      case 'client':
        return directory.clients.map((c) => ({
          value: c.id,
          label: `${c.firstName}${c.lastName ? ' ' + c.lastName : ''}`,
        }));
      default:
        return 'free-text' as const;
    }
  }, [ownerType, directory]);

  const fileTooBig = file ? file.size > MAX_BYTES : false;
  const canSubmit = Boolean(
    ownerType &&
      ownerId &&
      accessClass &&
      folder &&
      file &&
      !fileTooBig &&
      phase.kind !== 'presigning' &&
      phase.kind !== 'uploading' &&
      phase.kind !== 'completing',
  );

  // Promisified XHR so we can drive the progress bar. fetch() doesn't
  // expose upload progress in the standard browser API — XHR does.
  function putToR2(
    url: string,
    headers: Record<string, string>,
    body: File,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      for (const [k, v] of Object.entries(headers)) {
        xhr.setRequestHeader(k, v);
      }
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setPhase({ kind: 'uploading', loaded: e.loaded, total: e.total });
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(
            new Error(
              `R2 PUT failed with HTTP ${xhr.status}: ${xhr.responseText.slice(0, 200)}`,
            ),
          );
        }
      };
      xhr.onerror = () =>
        reject(new Error('R2 PUT network error — check CORS rules on the bucket.'));
      xhr.onabort = () => reject(new Error('Upload aborted.'));
      xhr.send(body);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setPhase({ kind: 'presigning' });

    // 1) Ask the API for a presigned PUT URL.
    const presigned = await presignMediaUploadAction({
      ownerType,
      ownerId,
      folder,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      accessClass,
      altText: altText || undefined,
      caption: caption || undefined,
    });

    if (!presigned.ok) {
      setPhase({
        kind: 'error',
        message: presigned.error,
        missing: presigned.r2NotConfigured?.missing,
      });
      return;
    }

    const { asset, upload } = presigned.result;

    // 2) Browser PUTs the file directly to R2 using the signed URL.
    setPhase({ kind: 'uploading', loaded: 0, total: file.size });
    try {
      await putToR2(upload.url, upload.headers, file);
    } catch (err) {
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'R2 PUT failed.',
      });
      return;
    }

    // 3) Tell the API the upload is finished. The API verifies via
    //    HeadObject and flips the row to uploaded.
    setPhase({ kind: 'completing' });
    const completed = await completeMediaUploadAction(asset.id);
    if (!completed.ok) {
      setPhase({ kind: 'error', message: completed.error });
      return;
    }

    setPhase({ kind: 'done' });
    // Refresh the listing; close after a short beat so the operator
    // sees the success state.
    router.refresh();
    setTimeout(() => onClose(), 600);
  }

  function progressPct(p: Phase): number {
    if (p.kind === 'uploading' && p.total > 0) {
      return Math.round((p.loaded / p.total) * 100);
    }
    return 0;
  }

  return (
    <Drawer
      open
      onClose={onClose}
      ariaLabel="Upload media"
      title={
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Upload</span>
          <h2 className="t-display-md text-ink">New media asset</h2>
        </div>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-s4 px-s6 py-s5">
        {phase.kind === 'error' && (
          <Alert tone="error">
            <div className="flex flex-col gap-s1">
              <span>{phase.message}</span>
              {phase.missing && phase.missing.length > 0 && (
                <span className="t-body-sm">
                  Missing env vars: {phase.missing.join(', ')}. Set them in
                  Railway (production) and your local <code>.env</code>.
                </span>
              )}
            </div>
          </Alert>
        )}

        {phase.kind === 'done' && (
          <Alert tone="success">Uploaded — refreshing the library.</Alert>
        )}

        <FormField label="Owner type" required>
          <Select
            value={ownerType}
            onChange={(e) => setOwnerType(e.target.value as MediaOwnerType)}
            disabled={phase.kind === 'uploading' || phase.kind === 'presigning'}
          >
            {OWNER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </FormField>

        {ownerType === 'tenant' ? (
          <Alert tone="info">
            Pinned to your tenant root. Use this for tenant-wide branding,
            policies, or company photos.
          </Alert>
        ) : ownerOptions === 'free-text' ? (
          <FormField label={`${ownerType} ID`} required>
            <Input
              type="text"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              placeholder={`Paste a ${ownerType} ID`}
            />
          </FormField>
        ) : (
          <FormField label="Owner" required>
            <Select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
            >
              <option value="">Select…</option>
              {(ownerOptions ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        <FormField label="Access class" required>
          <Select
            value={accessClass}
            onChange={(e) =>
              setAccessClass(e.target.value as MediaAccessClass)
            }
          >
            {ACCESS_CLASSES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Folder"
          required
          hint={`Suggestions: ${FOLDER_SUGGESTIONS.join(', ')}`}
        >
          <Input
            type="text"
            value={folder}
            onChange={(e) => setFolder(e.target.value.toLowerCase())}
            placeholder="e.g. gallery"
          />
        </FormField>

        <FormField label="File" required>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={cn(
              'block w-full rounded-md border-[1.5px] border-surface-3 bg-white text-ink font-sans text-[14px]',
              'file:mr-s3 file:rounded-sm file:border-0 file:bg-accent file:px-s3 file:py-[8px]',
              'file:text-white file:font-medium file:cursor-pointer',
              'p-s2 disabled:opacity-50',
            )}
          />
          {file && (
            <span
              className={cn(
                't-caption',
                fileTooBig ? 'text-red font-medium' : 'text-ink-soft',
              )}
            >
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
              {fileTooBig && ' — exceeds 100 MB API cap'}
            </span>
          )}
        </FormField>

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
            rows={2}
            maxLength={1000}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </FormField>

        {/* Progress display */}
        {(phase.kind === 'presigning' ||
          phase.kind === 'uploading' ||
          phase.kind === 'completing') && (
          <div className="flex flex-col gap-s2">
            <div className="flex items-center justify-between t-body-sm text-ink-soft">
              <span>
                {phase.kind === 'presigning' && 'Requesting upload URL…'}
                {phase.kind === 'uploading' && 'Uploading to R2…'}
                {phase.kind === 'completing' && 'Verifying upload…'}
              </span>
              <span>{progressPct(phase)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-sm bg-surface-2">
              <div
                className="h-full bg-accent transition-[width] duration-fast"
                style={{ width: `${progressPct(phase)}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-s2 border-t border-surface-3 pt-s4">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={
              phase.kind === 'uploading' || phase.kind === 'completing'
            }
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="accent"
            size="md"
            disabled={!canSubmit}
            loading={
              phase.kind === 'presigning' ||
              phase.kind === 'uploading' ||
              phase.kind === 'completing'
            }
          >
            Upload
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
