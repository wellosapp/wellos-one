import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';

// Status pill for workflows. Vocabulary:
//   draft    → neutral
//   active   → green (sage)
//   paused   → amber
//   archived → neutral / muted
//   error    → red

function statusTone(s: string): 'green' | 'red' | 'amber' | 'neutral' {
  if (s === 'active') return 'green';
  if (s === 'error') return 'red';
  if (s === 'paused') return 'amber';
  return 'neutral';
}

function statusLabel(s: string): string {
  switch (s) {
    case 'draft':
      return 'Draft';
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'archived':
      return 'Archived';
    case 'error':
      return 'Error';
    default:
      return s;
  }
}

export function WorkflowStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge tone={statusTone(status)} className={cn(className)}>
      {statusLabel(status)}
    </Badge>
  );
}
