'use client';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { blockPosition, formatTimeLocal } from '@/lib/calendar';
import type {
  Appointment,
  AppointmentState,
} from '@/lib/api/appointments';
import type { Service } from '@/lib/api/services';

// One appointment block. Positioned absolutely within its staff column by
// start/end. Tone tracks status. Past visits dim.

const STATUS_TONE: Record<AppointmentState, {
  bg: string;
  border: string;
  badgeTone: 'neutral' | 'accent' | 'red' | 'amber' | 'green';
  label: string;
}> = {
  scheduled: {
    bg: 'bg-surface-2',
    border: 'border-surface-3',
    badgeTone: 'neutral',
    label: 'Scheduled',
  },
  confirmed: {
    bg: 'bg-accent-pale',
    border: 'border-accent/30',
    badgeTone: 'accent',
    label: 'Confirmed',
  },
  checked_in: {
    bg: 'bg-amber-pale',
    border: 'border-amber/40',
    badgeTone: 'amber',
    label: 'Checked in',
  },
  in_progress: {
    bg: 'bg-amber-pale',
    border: 'border-amber',
    badgeTone: 'amber',
    label: 'In progress',
  },
  completed: {
    bg: 'bg-green-pale',
    border: 'border-green/40',
    badgeTone: 'green',
    label: 'Completed',
  },
  cancelled: {
    bg: 'bg-red-pale',
    border: 'border-red/40',
    badgeTone: 'red',
    label: 'Cancelled',
  },
  no_show: {
    bg: 'bg-red-pale',
    border: 'border-red/40',
    badgeTone: 'red',
    label: 'No-show',
  },
};

interface CalendarEventBlockProps {
  appointment: Appointment;
  service: Service | null;
  isSelected: boolean;
}

export function CalendarEventBlock({
  appointment,
  service,
  isSelected,
}: CalendarEventBlockProps) {
  const tone = STATUS_TONE[appointment.state];
  const pos = blockPosition(
    appointment.scheduledStartAt,
    appointment.scheduledEndAt,
  );
  const isPast = new Date(appointment.scheduledEndAt) < new Date();
  // Skip rendering entirely for appointments fully outside the visible
  // window — keeps stale links from leaking through with 0 height.
  if (pos.heightPx <= 0) return null;

  return (
    <div
      className={cn(
        'absolute left-s1 right-s1 flex flex-col gap-s1 overflow-hidden rounded-sm border px-s2 py-s2',
        'transition-shadow duration-fast hover:shadow-md',
        tone.bg,
        tone.border,
        isPast && appointment.state !== 'completed' && 'opacity-60',
        isSelected && 'ring-2 ring-accent shadow-md',
      )}
      style={{
        top: pos.topPx,
        height: pos.heightPx,
      }}
    >
      <div className="flex items-center gap-s2">
        <Badge tone={tone.badgeTone}>{tone.label}</Badge>
        <span className="t-caption text-ink-soft">
          {formatTimeLocal(appointment.scheduledStartAt)}
          {' – '}
          {formatTimeLocal(appointment.scheduledEndAt)}
        </span>
      </div>
      <div className="t-body-sm font-medium text-ink truncate">
        {service?.name ?? 'Service'}
      </div>
    </div>
  );
}
