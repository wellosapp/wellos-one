'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';

import { cn } from '@/lib/cn';

import { nodeStatusClass, readRunStatus } from '../runStatus';

// Webhook node visual. Shows the target URL (truncated) when set; otherwise
// a "not configured" hint. The engine uses AutomationWebhookDelivery rows
// for retry — that mechanism is exercised by Phase D PR 16.

function readTargetUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const url = (data as { targetUrl?: unknown }).targetUrl;
  return typeof url === 'string' && url.length > 0 ? url : null;
}

function truncate(url: string, max = 28): string {
  if (url.length <= max) return url;
  return `${url.slice(0, max - 1)}…`;
}

export function WebhookNodeRenderer({ data }: NodeProps) {
  const url = readTargetUrl(data);
  const status = readRunStatus(data);

  return (
    <div
      className={cn(
        'rounded-md border border-surface-3 bg-white px-s4 py-s3 shadow-sm min-w-[200px]',
        'transition-shadow duration-fast',
        nodeStatusClass(status),
      )}
    >
      <Handle type="target" position={Position.Top} />
      <div className="t-eyebrow text-accent">WEBHOOK</div>
      <div className="mt-s1 t-body-md text-ink">
        {url ? truncate(url) : 'No URL set'}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
