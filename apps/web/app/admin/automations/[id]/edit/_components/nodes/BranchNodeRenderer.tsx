'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

// Branch node visual. Renders one source handle per configured branch
// label (sourceHandle === label). When `hasDefault` is true, an extra
// 'default' handle is rendered for the no-match fallback.
//
// PR 7 ships with empty branches — a fresh branch node has a single
// 'default' handle and a "no branches yet" hint. PR 8 wires the settings
// drawer where users add labeled branches; PR 9 polishes the per-branch
// labels on the canvas itself.

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

export function BranchNodeRenderer({ data }: NodeProps) {
  const branches = readBranches(data);
  const hasDefault = readHasDefault(data);
  // Handles to render: one per branch label, plus an optional 'default'.
  // When branches[] is empty and hasDefault is false, we still render one
  // 'default' handle so the node is at least connectable on the canvas.
  const handleIds: string[] = [
    ...branches.map((b) => b.label),
    ...(hasDefault || branches.length === 0 ? ['default'] : []),
  ];

  return (
    <div className="rounded-md border border-amber bg-white px-s4 py-s3 shadow-sm min-w-[220px]">
      <Handle type="target" position={Position.Top} />
      <div className="t-eyebrow text-amber">BRANCH</div>
      <div className="mt-s1 t-body-md text-ink">
        {branches.length === 0
          ? 'No branches yet'
          : `${branches.length} branch${branches.length === 1 ? '' : 'es'}`}
      </div>
      {handleIds.map((id, index) => {
        // Spread handles evenly across the bottom edge — final visual polish
        // (labels, ordering, curved edges) lands in PR 9.
        const offset =
          handleIds.length === 1
            ? 50
            : 10 + (80 * index) / (handleIds.length - 1);
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
