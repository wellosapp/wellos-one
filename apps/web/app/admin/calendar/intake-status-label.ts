import type { ClientIntakeStatus } from '@/lib/api/appointments';

export type IntakeChipTone = 'neutral' | 'accent' | 'red' | 'amber' | 'green';

/** Calendar + week view: compact label + badge tone; null = hide chip. */
export function intakeStatusCalendarChip(
  status: ClientIntakeStatus | undefined,
): { label: string; tone: IntakeChipTone } | null {
  if (!status) return null;
  switch (status) {
    case 'completed':
      return null;
    case 'pending':
      return { label: 'Intake pending', tone: 'amber' };
    case 'sent':
      return { label: 'Intake sent', tone: 'neutral' };
    case 'expired':
      return { label: 'Intake expired', tone: 'red' };
  }
}
