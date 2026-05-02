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

const STATUS_TONE: Record<
  AppointmentState,
  {
    badgeTone: 'neutral' | 'accent' | 'red' | 'amber' | 'green';
    label: string;
    gradient: string;
    border: string;
  }
> = {
  scheduled: {
    badgeTone: 'neutral',
    label: 'Scheduled',
    gradient: 'bg-gradient-to-b from-surface-2 to-white',
    border: 'border-surface-3',
  },
  confirmed: {
    badgeTone: 'accent',
    label: 'Confirmed',
    gradient: 'bg-gradient-to-b from-accent-pale to-white',
    border: 'border-accent/25',
  },
  checked_in: {
    badgeTone: 'amber',
    label: 'Checked in',
    gradient: 'bg-gradient-to-b from-amber-pale to-white',
    border: 'border-amber/35',
  },
  in_progress: {
    badgeTone: 'amber',
    label: 'In progress',
    gradient: 'bg-gradient-to-b from-amber-pale to-white',
    border: 'border-amber',
  },
  completed: {
    badgeTone: 'green',
    label: 'Completed',
    gradient: 'bg-gradient-to-b from-green-pale to-white',
    border: 'border-green/35',
  },
  cancelled: {
    badgeTone: 'red',
    label: 'Cancelled',
    gradient: 'bg-gradient-to-b from-red-pale to-white',
    border: 'border-red/35',
  },
  no_show: {
    badgeTone: 'red',
    label: 'No-show',
    gradient: 'bg-gradient-to-b from-red-pale to-white',
    border: 'border-red/35',
  },
};

interface CalendarEventBlockProps {
  appointment: Appointment;
  service: Service | null;
  isSelected: boolean;
  clientDisplayName?: string;
  /** Highlights allergy / ops notes (amber treatment). */
  alertStyle?: boolean;
  /** Replaces status badge label when set (e.g. &quot;next up&quot;). */
  statusOverride?: string;
}

export function CalendarEventBlock({
  appointment,
  service,
  isSelected,
  clientDisplayName,
  alertStyle,
  statusOverride,
}: CalendarEventBlockProps) {
  const tone = STATUS_TONE[appointment.state];
  const pos = blockPosition(
    appointment.scheduledStartAt,
    appointment.scheduledEndAt,
  );
  const isPast = new Date(appointment.scheduledEndAt) < new Date();
  if (pos.heightPx <= 0) return null;

  const badgeLabel = statusOverride ?? tone.label;

  return (
    <div
      className={cn(
        'absolute left-s2 right-s2 flex flex-col gap-s1 overflow-hidden rounded-[14px] border px-s3 py-s3 shadow-sm',
        'transition-shadow duration-fast hover:shadow-md',
        tone.gradient,
        tone.border,
        alertStyle && 'border-amber/40 bg-gradient-to-b from-amber-pale to-white',
        isPast && appointment.state !== 'completed' && 'opacity-60',
        isSelected && 'ring-2 ring-accent shadow-md',
      )}
      style={{
        top: pos.topPx,
        height: pos.heightPx,
      }}
    >
      <div className="flex items-start justify-between gap-s2">
        <strong className="min-w-0 flex-1 truncate t-body-sm font-semibold text-ink">
          {service?.name ?? 'Service'}
        </strong>
        <Badge tone={tone.badgeTone} className="shrink-0">
          {badgeLabel}
        </Badge>
      </div>
      <p className="t-caption text-ink-soft">
        {formatTimeLocal(appointment.scheduledStartAt)}
        {clientDisplayName ? (
          <>
            {' · '}
            <span className="text-ink">{clientDisplayName}</span>
          </>
        ) : null}
      </p>
      {appointment.notes ? (
        <p className="line-clamp-2 t-caption text-ink-soft">{appointment.notes}</p>
      ) : null}
    </div>
  );
}
