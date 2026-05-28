'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

import { findPaletteItem } from '../paletteCatalog';

// Action node visual. Per-handler config gets edited in the settings drawer
// (PR 8). PR 7 just shows the action type label + an unconfigured hint when
// the config object is still empty.

function actionLabel(actionType: string): string {
  const item = findPaletteItem(`action.${actionType}`);
  return item?.label ?? actionType;
}

export function ActionNodeRenderer({ data }: NodeProps) {
  const actionType =
    typeof (data as { actionType?: unknown })?.actionType === 'string'
      ? (data as { actionType: string }).actionType
      : 'unknown';
  const config = (data as { config?: unknown })?.config;
  const isConfigured =
    config && typeof config === 'object' && Object.keys(config as object).length > 0;

  return (
    <div className="rounded-md border border-surface-3 bg-white px-s4 py-s3 shadow-sm min-w-[200px]">
      <Handle type="target" position={Position.Top} />
      <div className="t-eyebrow text-accent">ACTION</div>
      <div className="mt-s1 t-body-md text-ink">{actionLabel(actionType)}</div>
      {!isConfigured ? (
        <div className="mt-s1 t-caption text-ink-soft">Not configured</div>
      ) : null}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
