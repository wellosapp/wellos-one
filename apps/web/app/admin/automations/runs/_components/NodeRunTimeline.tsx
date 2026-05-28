// Automation System PR 5 — vertical audit timeline for a single run.
//
// Modeled on apps/web/app/admin/_components/forms/SubmissionAuditTimeline.tsx
// from Forms PR 10. Same vertical-bar layout, swapped action-tinted markers
// for status-tinted markers and exposes the full per-node row via
// NodeRunCard so input/output/error are inspectable inline.

import { cn } from '@/lib/cn';
import type { AutomationNodeRunDto } from '@/lib/api/automation-runs';

import { NodeRunCard } from './NodeRunCard';

// Status-tinted markers per the PR 5 spec:
//   succeeded → sage
//   failed    → red
//   skipped   → amber
//   pending/running/retrying → neutral (the run isn't terminal yet)
function dotClass(status: string): string {
  switch (status) {
    case 'succeeded':
      return 'bg-green border-green';
    case 'failed':
      return 'bg-red border-red';
    case 'skipped':
      return 'bg-amber border-amber';
    case 'running':
    case 'retrying':
      return 'bg-accent border-accent';
    default:
      return 'bg-surface-3 border-surface-3';
  }
}

export function NodeRunTimeline({ runs }: { runs: AutomationNodeRunDto[] }) {
  if (runs.length === 0) {
    return (
      <p className="t-body-sm text-ink-soft">
        No nodes have executed yet.
      </p>
    );
  }

  return (
    <ol className="flex flex-col">
      {runs.map((r, idx) => {
        const last = idx === runs.length - 1;
        return (
          <li key={r.id} className="relative flex gap-s3 pb-s5 last:pb-0">
            {!last ? (
              <span
                aria-hidden
                className="absolute left-[7px] top-[20px] h-full w-px bg-surface-3"
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'mt-[5px] inline-block h-[15px] w-[15px] flex-shrink-0 rounded-full border-2',
                dotClass(r.status),
              )}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-s1">
              <NodeRunCard run={r} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
