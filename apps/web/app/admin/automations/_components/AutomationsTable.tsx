import Link from 'next/link';
import type { Route } from 'next';

import type { AutomationWorkflowListItem } from '@/lib/api/automation-workflows';

import { ArchiveAutomationButton } from './ArchiveAutomationButton';
import { RestoreAutomationButton } from './RestoreAutomationButton';
import { WorkflowStatusBadge } from './WorkflowStatusBadge';
import { RunStatusBadge } from '../runs/_components/RunStatusBadge';
import { TriggerEventPill } from '../runs/_components/TriggerEventPill';

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never';
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

export function AutomationsTable({
  workflows,
}: {
  workflows: AutomationWorkflowListItem[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse">
        <thead>
          <tr className="border-b border-surface-3 bg-surface-2 text-left">
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Name</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Trigger</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Status</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Last run</th>
            <th className="t-eyebrow px-s4 py-s3 text-ink-soft">Updated</th>
            <th className="t-eyebrow px-s4 py-s3 text-right text-ink-soft">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {workflows.map((w) => {
            const editHref = `/admin/automations/${w.id}/edit` as Route;
            const isArchived = w.status === 'archived';
            return (
              <tr
                key={w.id}
                className="border-b border-surface-3 last:border-b-0 transition-colors duration-fast hover:bg-surface-2"
              >
                <td className="px-s4 py-s3 t-body-sm">
                  <Link
                    href={editHref}
                    className="font-medium text-ink no-underline hover:underline"
                  >
                    {w.name}
                  </Link>
                  {w.description ? (
                    <div className="mt-s1 max-w-md t-caption leading-snug text-ink-soft">
                      {w.description}
                    </div>
                  ) : null}
                </td>
                <td className="px-s4 py-s3 t-body-sm">
                  <TriggerEventPill type={w.triggerType} />
                </td>
                <td className="px-s4 py-s3">
                  <WorkflowStatusBadge status={w.status} />
                </td>
                <td className="px-s4 py-s3 t-body-sm">
                  {w.lastRunAt ? (
                    <div className="flex flex-col gap-s1">
                      <span
                        className="text-ink-soft"
                        title={formatDateTime(w.lastRunAt)}
                      >
                        {formatRelative(w.lastRunAt)}
                      </span>
                      {w.lastRunStatus ? (
                        <RunStatusBadge status={w.lastRunStatus} />
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-ink-soft">Never</span>
                  )}
                </td>
                <td className="px-s4 py-s3 t-body-sm text-ink-soft">
                  <span title={formatDateTime(w.updatedAt)}>
                    {formatRelative(w.updatedAt)}
                  </span>
                </td>
                <td className="px-s4 py-s3 text-right">
                  <div className="flex items-center justify-end gap-s3">
                    <Link
                      href={editHref}
                      className="t-body-sm text-accent no-underline hover:underline"
                    >
                      Edit
                    </Link>
                    {isArchived ? (
                      <RestoreAutomationButton workflowId={w.id} />
                    ) : (
                      <ArchiveAutomationButton workflowId={w.id} />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
