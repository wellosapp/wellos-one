'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

// Condition node visual. Two source handles — `true` (left) and `false`
// (right) — so edges can be drawn for each branch. The settings drawer
// (PR 8) edits the underlying ConditionGroup.

function ruleCount(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const cond = (data as { condition?: unknown }).condition;
  if (!cond || typeof cond !== 'object') return 0;
  const rules = (cond as { rules?: unknown }).rules;
  return Array.isArray(rules) ? rules.length : 0;
}

export function ConditionNodeRenderer({ data }: NodeProps) {
  const count = ruleCount(data);

  return (
    <div className="rounded-md border border-amber bg-white px-s4 py-s3 shadow-sm min-w-[200px]">
      <Handle type="target" position={Position.Top} />
      <div className="t-eyebrow text-amber">CONDITION</div>
      <div className="mt-s1 t-body-md text-ink">
        {count === 0 ? 'No rules yet' : `${count} rule${count === 1 ? '' : 's'}`}
      </div>
      <div className="mt-s2 flex justify-between t-caption text-ink-soft">
        <span>true</span>
        <span>false</span>
      </div>
      <Handle
        id="true"
        type="source"
        position={Position.Bottom}
        style={{ left: '25%' }}
      />
      <Handle
        id="false"
        type="source"
        position={Position.Bottom}
        style={{ left: '75%' }}
      />
    </div>
  );
}
