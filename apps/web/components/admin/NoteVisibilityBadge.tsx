import { Badge } from '@/components/ui';
import type { NoteVisibility } from '@/lib/api/timeline';

const VISIBILITY_LABEL: Record<NoteVisibility, string> = {
  location: 'Location',
  provider_only: 'Provider only',
  admin_only: 'Admin only',
  customer_submitted: 'From customer',
  protected_clinical: 'Protected',
};

// Tone signals "who can see this" — admin-only and protected get warmer
// tones to flag elevated handling.
const VISIBILITY_TONE: Record<
  NoteVisibility,
  'neutral' | 'accent' | 'red' | 'amber'
> = {
  location: 'neutral',
  provider_only: 'accent',
  admin_only: 'amber',
  customer_submitted: 'accent',
  protected_clinical: 'red',
};

export function NoteVisibilityBadge({
  visibility,
}: {
  visibility: NoteVisibility;
}) {
  return (
    <Badge tone={VISIBILITY_TONE[visibility]}>{VISIBILITY_LABEL[visibility]}</Badge>
  );
}
