import { Badge } from '@/components/ui';
import type { NoteCategory } from '@/lib/api/timeline';

// Color/tone mapping per category — matches the pattern in the walkthrough
// (alert categories visually warmer, internal/billing cooler, preference
// neutral). Tones come from the design system, not raw colors.
const CATEGORY_TONE: Record<
  NoteCategory,
  'neutral' | 'accent' | 'red' | 'amber' | 'green'
> = {
  general: 'neutral',
  preference: 'accent',
  formula: 'accent',
  allergy: 'red',
  medical: 'red',
  clinical: 'red',
  behavioral: 'amber',
  billing: 'amber',
  relationship: 'green',
  internal: 'neutral',
  session: 'neutral',
  customer_request: 'green',
};

const CATEGORY_LABEL: Record<NoteCategory, string> = {
  general: 'General',
  preference: 'Preference',
  formula: 'Formula',
  allergy: 'Allergy',
  medical: 'Medical',
  clinical: 'Clinical',
  behavioral: 'Behavioral',
  billing: 'Billing',
  relationship: 'Relationship',
  internal: 'Internal',
  session: 'Session',
  customer_request: 'Customer request',
};

export function NoteCategoryBadge({ category }: { category: NoteCategory }) {
  return <Badge tone={CATEGORY_TONE[category]}>{CATEGORY_LABEL[category]}</Badge>;
}
