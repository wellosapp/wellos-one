// Per-node row in the run-detail timeline. Renders the node's label +
// node-type pill + duration + status, and exposes input/output/error JSON
// behind a <details> disclosure so the timeline stays scannable.
//
// Using native <details> keeps this as a server component — no client
// island needed for the toggle.

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { AutomationNodeRunDto } from '@/lib/api/automation-runs';

function nodeStatusTone(
  s: string,
): 'green' | 'red' | 'amber' | 'neutral' | 'accent' {
  switch (s) {
    case 'succeeded':
      return 'green';
    case 'failed':
      return 'red';
    case 'skipped':
      return 'amber';
    case 'running':
    case 'retrying':
      return 'accent';
    default:
      return 'neutral';
  }
}

function nodeStatusLabel(s: string): string {
  switch (s) {
    case 'pending':
      return 'Pending';
    case 'running':
      return 'Running';
    case 'succeeded':
      return 'Succeeded';
    case 'failed':
      return 'Failed';
    case 'skipped':
      return 'Skipped';
    case 'retrying':
      return 'Retrying';
    default:
      return s;
  }
}

function formatDurationMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function hasJsonValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj).length > 0;
  }
  return true;
}

export function NodeRunCard({ run }: { run: AutomationNodeRunDto }) {
  const label = run.nodeLabel ?? run.nodeId;
  const hasInput = hasJsonValue(run.inputJson);
  const hasOutput = hasJsonValue(run.outputJson);
  const hasError = !!run.errorMessage;
  const hasDetails = hasInput || hasOutput || hasError;

  return (
    <div className="flex flex-col gap-s2">
      <div className="flex flex-wrap items-center justify-between gap-s2">
        <div className="flex min-w-0 flex-wrap items-center gap-s2">
          <span className="t-body-md font-medium text-ink truncate" title={run.nodeId}>
            {label}
          </span>
          <Badge tone="neutral" className="uppercase tracking-wide">
            {run.nodeType}
          </Badge>
          {run.retryCount > 0 ? (
            <Badge tone="amber">retry {run.retryCount}</Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-s2">
          <span className="t-caption text-ink-soft">
            {formatDurationMs(run.durationMs)}
          </span>
          <Badge tone={nodeStatusTone(run.status)}>
            {nodeStatusLabel(run.status)}
          </Badge>
        </div>
      </div>

      {hasDetails ? (
        <details className="group rounded-sm border border-surface-3 bg-surface-2/50">
          <summary
            className={cn(
              'flex cursor-pointer items-center justify-between gap-s2 px-s3 py-[6px]',
              't-caption uppercase tracking-wide text-ink-soft',
              'list-none select-none rounded-sm hover:bg-surface-2',
            )}
          >
            <span>Details</span>
            <span
              aria-hidden
              className="transition-transform duration-fast group-open:rotate-90"
            >
              ›
            </span>
          </summary>
          <div className="flex flex-col gap-s3 px-s3 pb-s3 pt-s2">
            {hasError ? (
              <div>
                <div className="t-caption uppercase tracking-wide text-ink-soft mb-s1">
                  Error
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-sm bg-red-pale px-s3 py-s2 t-caption text-red">
                  {run.errorMessage}
                </pre>
              </div>
            ) : null}
            {hasInput ? (
              <div>
                <div className="t-caption uppercase tracking-wide text-ink-soft mb-s1">
                  Input
                </div>
                <pre className="overflow-x-auto rounded-sm bg-white px-s3 py-s2 t-caption text-ink">
                  {formatJson(run.inputJson)}
                </pre>
              </div>
            ) : null}
            {hasOutput ? (
              <div>
                <div className="t-caption uppercase tracking-wide text-ink-soft mb-s1">
                  Output
                </div>
                <pre className="overflow-x-auto rounded-sm bg-white px-s3 py-s2 t-caption text-ink">
                  {formatJson(run.outputJson)}
                </pre>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
