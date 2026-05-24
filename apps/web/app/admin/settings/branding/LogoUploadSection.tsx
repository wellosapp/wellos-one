'use client';

// Logo upload section (Phase 2 of Brand Settings). One file at a time:
//   1. presignTenantLogoUploadAction → server returns a presigned R2 URL.
//   2. PUT the file body directly to R2 with the headers the server gave us.
//   3. completeTenantLogoUploadAction → server runs HeadObject + marks uploaded.
//   4. setTenantLogoAction(assetId)   → attaches the FK on Tenant.
// Then the action revalidates so the page (and the admin rail) re-render
// with the new logo.

import { useRef, useState, useTransition } from 'react';

import { ImageIcon, TrashIcon } from '@/app/admin/_shell/icons';
import { Alert, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import {
  completeTenantLogoUploadAction,
  presignTenantLogoUploadAction,
  setTenantLogoAction,
} from './_actions';

type Props = {
  currentLogo: { id: string; displayUrl: string | null } | null;
};

type UploadPhase = 'idle' | 'presigning' | 'uploading' | 'completing' | 'attaching';

function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 PUT failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error uploading to R2'));
    xhr.send(file);
  });
}

function phaseLabel(phase: UploadPhase, pct: number): string {
  switch (phase) {
    case 'presigning':
      return 'Preparing upload…';
    case 'uploading':
      return `Uploading… ${pct.toFixed(0)}%`;
    case 'completing':
      return 'Finalizing…';
    case 'attaching':
      return 'Saving logo…';
    default:
      return '';
  }
}

export function LogoUploadSection({ currentLogo }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [, startTransition] = useTransition();

  const busy = phase !== 'idle';

  async function uploadOne(file: File) {
    setError(null);
    setSuccess(false);
    setPct(0);

    // 1. Presign.
    setPhase('presigning');
    const presign = await presignTenantLogoUploadAction({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    });
    if (!presign.ok) {
      setError(presign.error);
      setPhase('idle');
      return;
    }

    // 2. PUT to R2 with progress.
    setPhase('uploading');
    try {
      await putWithProgress(
        presign.data.upload.url,
        presign.data.upload.headers,
        file,
        (p) => setPct(p),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      setPhase('idle');
      return;
    }

    // 3. Complete.
    setPhase('completing');
    const complete = await completeTenantLogoUploadAction(presign.data.asset.id);
    if (!complete.ok) {
      setError(complete.error);
      setPhase('idle');
      return;
    }

    // 4. Attach FK.
    setPhase('attaching');
    const attach = await setTenantLogoAction(complete.assetId);
    if (!attach.ok) {
      setError(attach.error ?? 'Could not attach logo.');
      setPhase('idle');
      return;
    }

    setSuccess(true);
    setPhase('idle');
  }

  function ingest(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    if (!file) return;
    startTransition(() => {
      void uploadOne(file);
    });
  }

  function onRemove() {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await setTenantLogoAction(null);
      if (!res.ok) {
        setError(res.error ?? 'Could not remove logo.');
      } else {
        setSuccess(true);
      }
    });
  }

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
        <div className="flex items-center gap-s2 t-eyebrow tracking-wide text-sage">
          <ImageIcon size={14} />
          <span>BRAND LOGO</span>
        </div>
        <h2 className="mt-s2 font-display text-[22px] leading-tight text-ink">
          Upload your logo.
        </h2>
        <p className="mt-s2 max-w-2xl t-body-md leading-relaxed text-ink-3">
          Displays in the admin sidebar. Public booking page support lands in
          a follow-up. Recommended: square PNG or SVG, at least 96×96.
        </p>
      </header>

      <div className="flex flex-col gap-s4 px-s6 py-s5 lg:px-s8 lg:py-s6">
        {error && <Alert tone="error">{error}</Alert>}
        {success && !busy && (
          <Alert tone="success">Logo saved.</Alert>
        )}

        {currentLogo ? (
          <div
            className={cn(
              'flex flex-col gap-s4 rounded-md border border-line bg-surface-2 p-s4',
              'sm:flex-row sm:items-center sm:justify-between',
            )}
          >
            <div className="flex items-center gap-s4">
              <div
                className={cn(
                  'flex h-20 w-32 items-center justify-center overflow-hidden',
                  'rounded-md border border-line bg-surface',
                )}
              >
                {currentLogo.displayUrl ? (
                  // Signed R2 URLs expire and can't be optimized by next/image
                  // without domain config. Plain <img> mirrors FileTile.tsx.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentLogo.displayUrl}
                    alt="Current tenant logo"
                    className="max-h-20 max-w-32 object-contain"
                  />
                ) : (
                  <span className="t-caption text-ink-4">
                    Preview unavailable
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-[2px]">
                <span className="t-body-sm font-medium text-ink">
                  Logo set
                </span>
                <span className="t-caption text-ink-3">
                  Shown in the admin sidebar at top.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-s2">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
              >
                Replace logo
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={onRemove}
                disabled={busy}
                className="text-red hover:bg-red-pale"
              >
                <TrashIcon size={16} className="mr-s1" />
                Remove logo
              </Button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => !busy && inputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              if (!busy) setDrag(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (!busy) ingest(e.dataTransfer?.files ?? null);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !busy) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={cn(
              'cursor-pointer rounded-md border-2 border-dashed border-line-strong',
              'bg-surface-2 px-s5 py-s8 text-center transition-colors duration-fast',
              drag && 'border-sage bg-sage-tint-2',
              !busy && 'hover:border-sage hover:bg-sage-tint-2',
              busy && 'cursor-not-allowed opacity-70',
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
            <div className="font-display text-[20px] text-ink">
              Drop your logo here, or{' '}
              <span className="text-sage-deep underline underline-offset-2">
                browse
              </span>
            </div>
            <div className="mt-s1 t-body-sm text-ink-3">
              PNG, JPG, SVG, or WebP · square, at least 96×96
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          hidden
          onChange={(e) => {
            ingest(e.target.files);
            e.currentTarget.value = '';
          }}
        />

        {busy && (
          <div
            className={cn(
              'flex flex-col gap-s2 rounded-md border border-line bg-surface-2 px-s4 py-s3',
            )}
          >
            <div className="flex items-center justify-between t-body-sm">
              <span className="text-ink">{phaseLabel(phase, pct)}</span>
              {phase === 'uploading' && (
                <span className="tabular-nums t-caption text-ink-3">
                  {pct.toFixed(0)}%
                </span>
              )}
            </div>
            <div className="h-[4px] overflow-hidden rounded-sm bg-line">
              <div
                className="h-full rounded-sm bg-sage transition-[width] duration-base"
                style={{
                  width:
                    phase === 'uploading'
                      ? `${pct}%`
                      : phase === 'completing' || phase === 'attaching'
                        ? '100%'
                        : '8%',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
