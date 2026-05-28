'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

import { triggerEventLabel } from '@/app/admin/automations/runs/_components/triggerEventLabels';
import { cn } from '@/lib/cn';

import { nodeStatusClass, readRunStatus } from '../runStatus';

// Trigger node visual. Outer card picks up the run-status treatment from
// PR 9 — a pulsing accent ring while a test run is hitting this node, a
// green ring when it's succeeded, etc.

export function TriggerNodeRenderer({ data }: NodeProps) {
  const triggerType =
    typeof (data as { triggerType?: unknown })?.triggerType === 'string'
      ? (data as { triggerType: string }).triggerType
      : 'unknown';
  const status = readRunStatus(data);

  return (
    <div
      className={cn(
        'rounded-md border border-sage bg-sage-tint-2 px-s4 py-s3 shadow-sm min-w-[180px]',
        'transition-shadow duration-fast',
        nodeStatusClass(status),
      )}
    >
      <div className="t-eyebrow text-sage-deep">TRIGGER</div>
      <div className="mt-s1 t-body-md text-ink">
        {triggerEventLabel(triggerType)}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
