import { toDateParam } from '@/lib/calendar';
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

/** Month grid: how many appointments on a calendar day show an intake chip (non-completed). */
export function countIntakeAttentionOnDay(
  appointments: Array<{
    scheduledStartAt: string;
    clientIntakeStatus?: ClientIntakeStatus;
  }>,
  dateStr: string,
): number {
  let n = 0;
  for (const a of appointments) {
    if (toDateParam(new Date(a.scheduledStartAt)) !== dateStr) continue;
    if (intakeStatusCalendarChip(a.clientIntakeStatus)) n += 1;
  }
  return n;
}
