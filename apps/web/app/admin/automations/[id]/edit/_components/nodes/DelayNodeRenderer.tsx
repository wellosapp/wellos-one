'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

import { cn } from '@/lib/cn';

import { nodeStatusClass, readRunStatus } from '../runStatus';

// Delay node visual. Shows a rough human-readable summary of the delay
// kind + duration. PR 8's settings drawer edits the underlying fields.
// PR 9 adds the run-status treatment; the outgoing edge from a delay node
// renders dashed via WorkflowEdge so the temporal gap is visible too.

function summarize(data: unknown): string {
  if (!data || typeof data !== 'object') return 'Not configured';
  const d = data as {
    kind?: unknown;
    delayMs?: unknown;
    appointmentOffsetMs?: unknown;
    untilDateIso?: unknown;
  };

  if (d.kind === 'relative') {
    if (typeof d.delayMs !== 'number') return 'Wait';
    return `Wait ${formatDuration(d.delayMs)}`;
  }
  if (d.kind === 'until_appointment') {
    if (typeof d.appointmentOffsetMs !== 'number') return 'Wait until appointment';
    const ms = d.appointmentOffsetMs;
    if (ms === 0) return 'At appointment start';
    return ms < 0
      ? `${formatDuration(Math.abs(ms))} before appointment`
      : `${formatDuration(ms)} after appointment`;
  }
  if (d.kind === 'until_date') {
    return typeof d.untilDateIso === 'string' ? `Until ${d.untilDateIso}` : 'Until a date';
  }
  if (d.kind === 'until_client_birthday') return 'Until client birthday';

  return 'Not configured';
}

function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs >= day) return `${Math.round(abs / day)}d`;
  if (abs >= hour) return `${Math.round(abs / hour)}h`;
  if (abs >= minute) return `${Math.round(abs / minute)}m`;
  return `${Math.round(abs / 1000)}s`;
}

export function DelayNodeRenderer({ data }: NodeProps) {
  const status = readRunStatus(data);
  return (
    <div
      className={cn(
        'rounded-md border border-surface-3 bg-surface-1 px-s4 py-s3 shadow-sm min-w-[200px]',
        'transition-shadow duration-fast',
        nodeStatusClass(status),
      )}
    >
      <Handle type="target" position={Position.Top} />
      <div className="t-eyebrow text-ink-soft">DELAY</div>
      <div className="mt-s1 t-body-md text-ink">{summarize(data)}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
