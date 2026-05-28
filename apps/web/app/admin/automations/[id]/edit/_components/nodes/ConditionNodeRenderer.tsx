'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

import { cn } from '@/lib/cn';

import { nodeStatusClass, readRunStatus } from '../runStatus';

// Condition node visual. Two source handles — `true` (left) and `false`
// (right) — so edges can be drawn for each branch. PR 8 wires the
// ConditionGroup editor in the settings drawer. PR 9 adds the run-status
// treatment + colored true/false handle labels.

function ruleCount(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const cond = (data as { condition?: unknown }).condition;
  if (!cond || typeof cond !== 'object') return 0;
  const rules = (cond as { rules?: unknown }).rules;
  return Array.isArray(rules) ? rules.length : 0;
}

export function ConditionNodeRenderer({ data }: NodeProps) {
  const count = ruleCount(data);
  const status = readRunStatus(data);

  return (
    <div
      className={cn(
        'rounded-md border border-amber bg-white px-s4 py-s3 shadow-sm min-w-[200px]',
        'transition-shadow duration-fast',
        nodeStatusClass(status),
      )}
    >
      <Handle type="target" position={Position.Top} />
      <div className="t-eyebrow text-amber">CONDITION</div>
      <div className="mt-s1 t-body-md text-ink">
        {count === 0 ? 'No rules yet' : `${count} rule${count === 1 ? '' : 's'}`}
      </div>
      <div className="mt-s2 flex justify-between t-caption">
        <span className="text-green">true</span>
        <span className="text-red">false</span>
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
