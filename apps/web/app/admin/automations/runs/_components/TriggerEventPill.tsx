import { Badge } from '@/components/ui';

import { triggerEventLabel } from './triggerEventLabels';

export function TriggerEventPill({ type }: { type: string }) {
  return (
    <Badge tone="neutral" title={type}>
      {triggerEventLabel(type)}
    </Badge>
  );
}
