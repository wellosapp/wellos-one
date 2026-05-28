'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

// AI node visual. Forward-compat placeholder — PR 7 ships these as
// non-functional cards. A future AI epic registers real handlers; until
// then the engine writes a `skipped` node-run row when it encounters one.
// Rendered visually muted so users understand it's not live yet.

const KIND_LABELS: Record<string, string> = {
  client_summary: 'Summarize client',
  provider_prep: 'Provider prep',
  soap_draft: 'Draft SOAP note',
  risk_identification: 'Identify risk',
};

function readKind(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const kind = (data as { kind?: unknown }).kind;
  return typeof kind === 'string' ? kind : '';
}

export function AiNodeRenderer({ data }: NodeProps) {
  const kind = readKind(data);
  const label = KIND_LABELS[kind] ?? 'AI step';

  return (
    <div className="rounded-md border border-dashed border-surface-3 bg-surface-2 px-s4 py-s3 shadow-sm min-w-[200px] opacity-70">
      <Handle type="target" position={Position.Top} />
      <div className="t-eyebrow text-ink-soft">AI • COMING SOON</div>
      <div className="mt-s1 t-body-md text-ink">{label}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
