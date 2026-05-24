import { CloudIcon } from '@/app/admin/_shell/icons';
import { cn } from '@/lib/cn';

// Small strip below the folder pills that surfaces aggregate storage info
// for this client's files. Intentionally does NOT expose the raw R2 path
// (`r2://...`) — staff don't need that, and surfacing it leaks bucket
// names. "tenant R2" is the human-friendly label.

function humanBytes(input: number): string {
  if (!Number.isFinite(input) || input <= 0) return '0 B';
  if (input < 1024) return `${input} B`;
  if (input < 1024 * 1024) return `${(input / 1024).toFixed(0)} KB`;
  if (input < 1024 * 1024 * 1024) return `${(input / 1024 / 1024).toFixed(1)} MB`;
  return `${(input / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function FilesStorageStrip({
  count,
  totalBytes,
}: {
  count: number;
  totalBytes: number;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-s3 rounded-md border border-line bg-surface-2',
        'px-s4 py-s2 t-body-sm text-ink-3',
      )}
    >
      <span className="inline-flex items-center gap-s2">
        <CloudIcon size={14} />
        <span>Storage: tenant R2</span>
      </span>
      <span className="tabular-nums">
        {count} {count === 1 ? 'file' : 'files'} · {humanBytes(totalBytes)}
      </span>
    </div>
  );
}
