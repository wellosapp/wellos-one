import Link from 'next/link';
import type { Route } from 'next';

import type { AutomationRunListItem } from '@/lib/api/automation-runs';

import { RunStatusBadge } from './RunStatusBadge';
import { TriggerEventPill } from './TriggerEventPill';

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.round(diffMs / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 14) return `${diffD}d ago`;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

export function RunsTable({ runs }: { runs: AutomationRunListItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse">
        <thead>
          <tr className="border-b border-surface-3 bg-surface-2 text-left">
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Started</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Workflow</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Trigger</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Client</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Status</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Duration</th>
            <th className="t-eyebrow px-s4 py-s3 text-right text-ink-soft">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            // Prefer startedAt for the "Started" cell — it's when the engine
            // actually picked up the run. Pending runs fall back to createdAt
            // so the row isn't a dash.
            const startedIso = r.startedAt ?? r.createdAt;
            return (
              <tr
                key={r.id}
                className="border-b border-surface-3 last:border-b-0 transition-colors duration-fast hover:bg-surface-2"
              >
                <td className="px-s4 py-s3 t-body-sm">
                  <div
                    className="text-ink"
                    title={formatDateTime(startedIso)}
                  >
                    {formatRelative(startedIso)}
                  </div>
                </td>
                <td className="px-s4 py-s3 t-body-sm">
                  <Link
                    href={`/admin/automations/${r.workflowId}/edit` as Route}
                    className="font-medium text-ink no-underline hover:underline"
                  >
                    {r.workflowName}
                  </Link>
                </td>
                <td className="px-s4 py-s3 t-body-sm">
                  <TriggerEventPill type={r.triggerEvent} />
                </td>
                <td className="px-s4 py-s3 t-body-sm">
                  {r.clientId && r.clientName ? (
                    <Link
                      href={`/admin/clients/${r.clientId}` as Route}
                      className="text-accent no-underline hover:underline"
                    >
                      {r.clientName}
                    </Link>
                  ) : r.clientId ? (
                    <Link
                      href={`/admin/clients/${r.clientId}` as Route}
                      className="text-accent no-underline hover:underline"
                    >
                      Client
                    </Link>
                  ) : (
                    <span className="text-ink-soft">—</span>
                  )}
                </td>
                <td className="px-s4 py-s3">
                  <RunStatusBadge status={r.status} />
                </td>
                <td className="px-s4 py-s3 t-body-sm text-ink-soft">
                  {formatDuration(r.durationMs)}
                </td>
                <td className="px-s4 py-s3 text-right">
                  <Link
                    href={`/admin/automations/runs/${r.id}` as Route}
                    className="t-body-sm text-accent no-underline hover:underline"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
