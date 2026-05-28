import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';

// Status tone mapping per the PR 5 spec:
//   succeeded → sage (green)
//   failed    → red
//   running   → amber with subtle pulse
//   pending   → neutral
//   cancelled → muted grey (neutral too — Badge has no dedicated "muted" tone)

type RunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

function statusTone(s: string): 'green' | 'red' | 'amber' | 'neutral' {
  if (s === 'succeeded') return 'green';
  if (s === 'failed') return 'red';
  if (s === 'running' || s === 'pending') return 'amber';
  return 'neutral';
}

function statusLabel(s: string): string {
  switch (s) {
    case 'pending':
      return 'Pending';
    case 'running':
      return 'Running';
    case 'succeeded':
      return 'Succeeded';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return s;
  }
}

export function RunStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const tone = statusTone(status);
  const pulse = status === 'running';
  return (
    <Badge tone={tone} className={cn(pulse && 'animate-pulse', className)}>
      {statusLabel(status as RunStatus)}
    </Badge>
  );
}
