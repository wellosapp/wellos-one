import { Badge } from '@/components/ui';
import type { MediaAccessClass } from '@/lib/api/media';

// Visual taxonomy for the 5 media access classes. Tone is deliberate:
// public_booking = green (safe to share), tenant_staff = neutral (default),
// client_owned = accent, protected_medspa = red (care required), generated
// = neutral with an italic label so admins know it's worker-produced.

const STYLE: Record<
  MediaAccessClass,
  { tone: 'neutral' | 'accent' | 'red' | 'amber' | 'green'; label: string }
> = {
  public_booking: { tone: 'green', label: 'Public booking' },
  tenant_staff: { tone: 'neutral', label: 'Tenant staff' },
  client_owned: { tone: 'accent', label: 'Client owned' },
  protected_medspa: { tone: 'red', label: 'Protected medspa' },
  generated: { tone: 'neutral', label: 'Generated' },
};

export function AccessClassBadge({
  accessClass,
}: {
  accessClass: MediaAccessClass;
}) {
  const s = STYLE[accessClass];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
