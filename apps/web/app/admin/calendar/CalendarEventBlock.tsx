'use client';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { blockPosition, formatTimeLocal } from '@/lib/calendar';
import type {
  Appointment,
  AppointmentState,
} from '@/lib/api/appointments';
import type { Service } from '@/lib/api/services';
import { intakeStatusCalendarChip } from './intake-status-label';

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
  requested: {
    badgeTone: 'amber',
    label: 'Requested',
    gradient: 'bg-gradient-to-b from-amber-pale to-white',
    border: 'border-amber/35',
  },
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
  /**
   * When true, parent supplies positioning (e.g. drag handle + link wrapper).
   * Inner card fills height (`h-full`).
   */
  omitOuterPosition?: boolean;
}

export function CalendarEventBlock({
  appointment,
  service,
  isSelected,
  clientDisplayName,
  alertStyle,
  statusOverride,
  omitOuterPosition,
}: CalendarEventBlockProps) {
  const tone = STATUS_TONE[appointment.state];
  const pos = blockPosition(
    appointment.scheduledStartAt,
    appointment.scheduledEndAt,
  );
  const isPast = new Date(appointment.scheduledEndAt) < new Date();
  if (!omitOuterPosition && pos.heightPx <= 0) return null;

  const badgeLabel = statusOverride ?? tone.label;
  const intakeChip = intakeStatusCalendarChip(
    appointment.clientIntakeStatus,
  );

  const shellClass = cn(
    'flex flex-col gap-s1 overflow-hidden rounded-[14px] border px-s3 py-s3 shadow-sm',
    'transition-shadow duration-fast hover:shadow-md',
    omitOuterPosition ? 'h-full min-h-0' : 'absolute left-s2 right-s2',
    tone.gradient,
    tone.border,
    alertStyle && 'border-amber/40 bg-gradient-to-b from-amber-pale to-white',
    isPast && appointment.state !== 'completed' && 'opacity-60',
    isSelected && 'ring-2 ring-accent shadow-md',
  );

  const shellStyle = omitOuterPosition
    ? undefined
    : {
        top: pos.topPx,
        height: pos.heightPx,
      };

  return (
    <div className={shellClass} style={shellStyle}>
      <div className="flex items-start justify-between gap-s2">
        <strong className="min-w-0 flex-1 truncate t-body-sm font-semibold text-ink">
          {service?.name ?? 'Service'}
        </strong>
        <div className="flex shrink-0 flex-col items-end gap-s1">
          <div className="flex items-center gap-s1">
            {appointment.seriesId ? (
              <span
                aria-label="Recurring"
                title="Recurring appointment"
                className="inline-flex h-[14px] w-[14px] items-center justify-center rounded-full bg-surface-2 text-[11px] leading-none text-ink-soft"
              >
                ↻
              </span>
            ) : null}
            <Badge tone={tone.badgeTone}>{badgeLabel}</Badge>
          </div>
          {intakeChip ? (
            <Badge tone={intakeChip.tone} className="max-w-[9rem] truncate">
              {intakeChip.label}
            </Badge>
          ) : null}
        </div>
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
