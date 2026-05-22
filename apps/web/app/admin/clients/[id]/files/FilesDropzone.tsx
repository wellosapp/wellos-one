'use client';

import { useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import {
  completeFileUploadAction,
  presignFileUploadAction,
} from './_actions';

// Drag-and-drop + click-to-select dropzone for client files. For each
// dropped file:
//   1. Calls presignFileUploadAction → server returns a presigned R2 URL.
//   2. PUT the file body directly to R2 with the headers the server
//      told us to use.
//   3. Calls completeFileUploadAction → server runs HeadObject and marks
//      the asset uploaded; revalidates the path so the grid refreshes.
//
// Progress is best-effort: fetch() can't stream upload progress in most
// browsers without XHR. We show a simple "Uploading…" → "Done" state per
// file (and a percent if XHR is available).

type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';

type UploadRow = {
  id: string;
  name: string;
  pct: number;
  status: UploadStatus;
  message?: string;
};

function newRowId(): string {
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

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

export function FilesDropzone({
  clientId,
  onUploaded,
}: {
  clientId: string;
  onUploaded?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [_isPending, startTransition] = useTransition();

  function patchRow(id: string, patch: Partial<UploadRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function uploadOne(file: File) {
    const id = newRowId();
    setRows((prev) => [
      ...prev,
      { id, name: file.name, pct: 0, status: 'pending' },
    ]);

    // 1. Presign.
    const presign = await presignFileUploadAction(clientId, {
      folder: 'client-files',
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      accessClass: 'tenant_staff',
    });
    if (!presign.ok) {
      patchRow(id, { status: 'error', message: presign.error });
      return;
    }

    // 2. PUT to R2 with progress.
    patchRow(id, { status: 'uploading' });
    try {
      await putWithProgress(
        presign.data.upload.url,
        presign.data.upload.headers,
        file,
        (pct) => patchRow(id, { pct }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      patchRow(id, { status: 'error', message });
      return;
    }

    // 3. Complete.
    const complete = await completeFileUploadAction(
      clientId,
      presign.data.asset.id,
      {},
    );
    if (!complete.ok) {
      patchRow(id, { status: 'error', message: complete.error });
      return;
    }
    patchRow(id, { status: 'done', pct: 100 });
    onUploaded?.();
  }

  function ingest(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList);
    for (const f of files) {
      // Fire-and-track per file. startTransition keeps the UI responsive.
      startTransition(() => {
        void uploadOne(f);
      });
    }
  }

  return (
    <div className="flex flex-col gap-s4">
      <div
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          ingest(e.dataTransfer?.files ?? null);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          'cursor-pointer rounded-md border-2 border-dashed border-line-strong',
          'bg-surface-2 px-s5 py-s8 text-center transition-colors duration-fast',
          drag && 'border-sage bg-sage-tint-2',
          'hover:border-sage hover:bg-sage-tint-2',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            ingest(e.target.files);
            e.currentTarget.value = '';
          }}
        />
        <div
          className={cn(
            'mx-auto mb-s3 flex h-12 w-12 items-center justify-center',
            'rounded-md border border-sage-soft bg-sage-tint text-sage-deep',
          )}
        >
          <UploadIcon className="h-5 w-5" />
        </div>
        <div className="font-display text-[20px] text-ink">
          Drop files here, or{' '}
          <span className="text-sage-deep underline underline-offset-2">
            browse
          </span>
        </div>
        <div className="mt-s1 t-body-sm text-ink-3">
          Images, PDFs, and paperwork · up to 100 MB each
        </div>
      </div>

      {rows.length > 0 && (
        <ul className="flex flex-col gap-s2">
          {rows.map((r) => (
            <li
              key={r.id}
              className={cn(
                'rounded-md border border-line bg-surface-2 px-s4 py-s3',
              )}
            >
              <div className="flex items-center gap-s3 t-body-sm">
                <UploadIcon className="h-[14px] w-[14px] shrink-0 text-ink-3" />
                <span className="flex-1 truncate font-semibold text-ink">
                  {r.name}
                </span>
                <span className="tabular-nums t-caption text-ink-3">
                  {r.status === 'error'
                    ? 'Failed'
                    : r.status === 'done'
                      ? 'Done'
                      : `${r.pct.toFixed(0)}%`}
                </span>
              </div>
              <div
                className={cn(
                  'mt-s2 h-[4px] overflow-hidden rounded-sm bg-line',
                )}
              >
                <div
                  className={cn(
                    'h-full rounded-sm transition-[width] duration-base',
                    r.status === 'error' ? 'bg-red' : 'bg-sage',
                  )}
                  style={{ width: `${r.pct}%` }}
                />
              </div>
              {r.status === 'error' && r.message && (
                <div className="mt-s2 t-caption text-red">{r.message}</div>
              )}
            </li>
          ))}
          {rows.some((r) => r.status === 'done' || r.status === 'error') && (
            <li>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setRows((prev) =>
                    prev.filter(
                      (r) => r.status !== 'done' && r.status !== 'error',
                    ),
                  )
                }
              >
                Clear finished
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 4v12M7 9l5-5 5 5M5 20h14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
