'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

import { triggerEventLabel } from '@/app/admin/automations/runs/_components/triggerEventLabels';

// Trigger node visual. PR 6 ships just the placeholder card — no click /
// settings drawer yet. PR 8 wires the right-sidebar drawer and per-type
// config edit.

export function TriggerNodeRenderer({ data }: NodeProps) {
  const triggerType =
    typeof (data as { triggerType?: unknown })?.triggerType === 'string'
      ? (data as { triggerType: string }).triggerType
      : 'unknown';

  return (
    <div className="rounded-md border border-sage bg-sage-tint-2 px-s4 py-s3 shadow-sm min-w-[180px]">
      <div className="t-eyebrow text-sage-deep">TRIGGER</div>
      <div className="mt-s1 t-body-md text-ink">
        {triggerEventLabel(triggerType)}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
