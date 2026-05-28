'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

import { cn } from '@/lib/cn';

import { nodeStatusClass, readRunStatus } from '../runStatus';

// Branch node visual. Renders one source handle per configured branch
// label (sourceHandle === label). When `hasDefault` is true, an extra
// 'default' handle is rendered for the no-match fallback.
//
// PR 9 adds per-handle labels — each handle gets a small caption above
// it inside the card, matching the handle's horizontal offset so users
// can read which outgoing path is which without clicking each edge.

interface Branch {
  label: string;
}

function readBranches(data: unknown): Branch[] {
  if (!data || typeof data !== 'object') return [];
  const arr = (data as { branches?: unknown }).branches;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((b) => {
      const label = (b as { label?: unknown })?.label;
      return typeof label === 'string' ? { label } : null;
    })
    .filter((b): b is Branch => b !== null);
}

function readHasDefault(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  return Boolean((data as { hasDefault?: unknown }).hasDefault);
}

function offsetForHandle(index: number, total: number): number {
  if (total <= 1) return 50;
  return 10 + (80 * index) / (total - 1);
}

export function BranchNodeRenderer({ data }: NodeProps) {
  const branches = readBranches(data);
  const hasDefault = readHasDefault(data);
  const status = readRunStatus(data);

  // Handles to render: one per branch label, plus an optional 'default'.
  // When branches[] is empty and hasDefault is false, we still render one
  // 'default' handle so the node is at least connectable on the canvas.
  const handleIds: string[] = [
    ...branches.map((b) => b.label),
    ...(hasDefault || branches.length === 0 ? ['default'] : []),
  ];

  return (
    <div
      className={cn(
        'rounded-md border border-amber bg-white px-s4 py-s3 pb-s5 shadow-sm min-w-[260px]',
        'transition-shadow duration-fast',
        nodeStatusClass(status),
      )}
    >
      <Handle type="target" position={Position.Top} />
      <div className="t-eyebrow text-amber">BRANCH</div>
      <div className="mt-s1 t-body-md text-ink">
        {branches.length === 0
          ? 'No branches yet'
          : `${branches.length} branch${branches.length === 1 ? '' : 'es'}`}
      </div>

      {/*
        Per-handle label row. Each label is absolutely positioned at the
        same horizontal percentage as its handle, so reading top-to-bottom
        the path is clear: label → bottom edge → outgoing edge.
      */}
      <div className="relative mt-s3 h-s4">
        {handleIds.map((id, index) => {
          const offset = offsetForHandle(index, handleIds.length);
          return (
            <span
              key={`label-${id}`}
              className={cn(
                'absolute -translate-x-1/2 whitespace-nowrap t-caption',
                id === 'default' ? 'text-ink-soft italic' : 'text-ink-soft',
              )}
              style={{ left: `${offset}%`, top: 0 }}
              title={id}
            >
              {id}
            </span>
          );
        })}
      </div>

      {handleIds.map((id, index) => {
        const offset = offsetForHandle(index, handleIds.length);
        return (
          <Handle
            key={id}
            id={id}
            type="source"
            position={Position.Bottom}
            style={{ left: `${offset}%` }}
          />
        );
      })}
    </div>
  );
}
