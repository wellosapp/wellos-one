import { cn } from '@/lib/cn';
import type { MediaAsset } from '@/lib/api/media';

import { FileCardActions } from './FileCardActions';

// Server-rendered card grid of media assets attached to the client. Each
// card surfaces filename, kind, size, uploadedAt, and per-card actions.
// Per the plan §"Out of scope": we render a kind glyph (not a signed image
// thumbnail) — fetching a signed URL per card during list render would
// fan out to the API. The Download action fetches the signed URL on click.

function humanBytes(input: string | number): string {
  const n = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function relativeDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function kindOf(mimeType: string): 'image' | 'pdf' | 'file' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'file';
}

function FileIcon({
  kind,
  className,
}: {
  kind: 'image' | 'pdf' | 'file';
  className?: string;
}) {
  if (kind === 'image') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
        <rect
          x="3"
          y="4"
          width="18"
          height="16"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <circle cx="9" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="m3 17 5-5 5 5 3-3 5 5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === 'pdf') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FilesGrid({
  assets,
  clientId,
}: {
  assets: MediaAsset[];
  clientId: string;
}) {
  if (assets.length === 0) {
    return (
      <div
        className={cn(
          'rounded-md border border-line bg-surface-2 p-s8 text-center',
        )}
      >
        <h4 className="font-display text-[20px] text-ink">No files yet.</h4>
        <p className="mx-auto mt-s2 max-w-sm t-body-sm text-ink-3">
          Drag any photos or paperwork into the area above to attach them to
          this client&apos;s profile.
        </p>
      </div>
    );
  }

  return (
    <ul
      className={cn(
        'grid gap-s4',
        'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4',
      )}
    >
      {assets.map((a) => {
        const kind = kindOf(a.mimeType);
        const archived = !!a.archivedAt;
        return (
          <li
            key={a.id}
            className={cn(
              'flex flex-col overflow-hidden rounded-md border border-line bg-surface-2 shadow-sm',
              archived && 'opacity-70',
            )}
          >
            <div
              className={cn(
                'relative flex aspect-[4/3] items-center justify-center bg-surface-sunk',
              )}
            >
              <FileIcon kind={kind} className="h-10 w-10 text-ink-4" />
              <span
                className={cn(
                  'absolute left-s2 top-s2 rounded-sm bg-ink/70 px-s2 py-[2px]',
                  't-caption uppercase tracking-wider text-ink-inv',
                )}
              >
                {kind}
              </span>
              {archived && (
                <span
                  className={cn(
                    'absolute right-s2 top-s2 rounded-sm bg-sand-soft px-s2 py-[2px]',
                    't-caption uppercase tracking-wider text-ink',
                  )}
                >
                  Archived
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-s2 p-s3">
              <div
                className="t-body-sm font-semibold text-ink"
                title={a.fileName}
              >
                <span className="block truncate">{a.fileName}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-s2 gap-y-s1 t-caption text-ink-4">
                <span>{humanBytes(a.sizeBytes)}</span>
                <span className="text-ink-4">·</span>
                <span>{relativeDate(a.uploadedAt)}</span>
              </div>
              {a.uploadedByStaffId && (
                <div className="t-caption text-ink-4">
                  by Staff · {a.uploadedByStaffId.slice(0, 6)}
                </div>
              )}
              <div className="mt-s2">
                <FileCardActions
                  clientId={clientId}
                  assetId={a.id}
                  archived={archived}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
