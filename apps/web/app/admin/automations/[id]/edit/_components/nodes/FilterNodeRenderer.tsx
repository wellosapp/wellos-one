'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

import { cn } from '@/lib/cn';

import { nodeStatusClass, readRunStatus } from '../runStatus';

// Filter node visual. Single in / single out — engine treats falsy as a
// terminal "filtered out" state and follows the outgoing edge only on a
// truthy result. The "drops on false" caption is the PR 9 hint so users
// don't have to remember which logic node terminates the run.

function ruleCount(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const cond = (data as { condition?: unknown }).condition;
  if (!cond || typeof cond !== 'object') return 0;
  const rules = (cond as { rules?: unknown }).rules;
  return Array.isArray(rules) ? rules.length : 0;
}

export function FilterNodeRenderer({ data }: NodeProps) {
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
      <div className="t-eyebrow text-amber">FILTER</div>
      <div className="mt-s1 t-body-md text-ink">
        {count === 0
          ? 'No rules yet'
          : `Continue if ${count} rule${count === 1 ? '' : 's'}`}
      </div>
      <div className="mt-s1 t-caption text-ink-soft">
        Drops the run on false
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
