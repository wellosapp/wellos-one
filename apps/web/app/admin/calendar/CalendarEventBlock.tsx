'use client';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatTimeLocal } from '@/lib/calendar';
import type {
  Appointment,
  AppointmentState,
} from '@/lib/api/appointments';
import type { Service } from '@/lib/api/services';
import { intakeStatusCalendarChip } from './intake-status-label';

// One appointment chip in the horizontal staff river. Parent positions
// (absolute left/top/width). Status keys the left-border tone; service
// keys an optional pale background hint. Past visits dim. Hover lifts.

const STATUS_TONE: Record<
  AppointmentState,
  {
    badgeTone: 'neutral' | 'accent' | 'red' | 'amber' | 'green';
    label: string;
    chip: string;
    leftBorder: string;
  }
> = {
  requested: {
    badgeTone: 'amber',
    label: 'Requested',
    chip: 'bg-amber-pale border-amber/30',
    leftBorder: 'border-l-amber',
  },
  scheduled: {
    badgeTone: 'neutral',
    label: 'Scheduled',
    chip: 'bg-sand-soft border-line',
    leftBorder: 'border-l-sand',
  },
  confirmed: {
    badgeTone: 'accent',
    label: 'Confirmed',
    chip: 'bg-sage-tint border-sage-soft',
    leftBorder: 'border-l-sage',
  },
  checked_in: {
    badgeTone: 'amber',
    label: 'Checked in',
    chip: 'bg-amber-pale border-amber/30',
    leftBorder: 'border-l-amber',
  },
  in_progress: {
    badgeTone: 'amber',
    label: 'In progress',
    chip: 'bg-amber-pale border-amber/35',
    leftBorder: 'border-l-amber',
  },
  completed: {
    badgeTone: 'green',
    label: 'Completed',
    chip: 'bg-green-pale border-green/30',
    leftBorder: 'border-l-green',
  },
  cancelled: {
    badgeTone: 'red',
    label: 'Cancelled',
    chip: 'bg-red-pale border-red/30',
    leftBorder: 'border-l-red',
  },
  no_show: {
    badgeTone: 'red',
    label: 'No-show',
    chip: 'bg-red-pale border-red/30',
    leftBorder: 'border-l-red',
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
   * When true, parent supplies positioning. The chip fills its container
   * with `h-full w-full`. Kept for backwards-compat with the grid wrapper.
   */
  omitOuterPosition?: boolean;
}

// TODO: appointment.seriesId is not yet on the Appointment type. When the
// recurring series API lands, expose it here for the ↻ badge.
function isRecurring(_appointment: Appointment): boolean {
  return false;
}

// TODO: appointment.client?.firstTime / group capacity are not on the
// Appointment shape on this branch. Stubbed to false until the API exposes
// them — see PR S3 follow-up.
function isFirstTime(_appointment: Appointment): boolean {
  return false;
}

function groupCapacity(
  _appointment: Appointment,
): { attending: number; capacity: number } | null {
  return null;
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
  const isPast = new Date(appointment.scheduledEndAt) < new Date();
  const isNextUp = statusOverride === 'Next up';

  const badgeLabel = statusOverride ?? tone.label;
  const intakeChip = intakeStatusCalendarChip(appointment.clientIntakeStatus);
  const showStatusBadge =
    statusOverride !== undefined || appointment.state !== 'confirmed';
  const recurring = isRecurring(appointment);
  const firstTime = isFirstTime(appointment);
  const capacity = groupCapacity(appointment);
  const hasAlertNote =
    Boolean(appointment.notes) &&
    appointment.state !== 'completed' &&
    appointment.state !== 'cancelled' &&
    Boolean(alertStyle);

  const shellClass = cn(
    'relative flex flex-col gap-s1 overflow-hidden rounded-md border border-l-[3px] px-s2 py-s2 shadow-sm',
    'transition-all duration-fast hover:-translate-y-px hover:shadow-md hover:z-10',
    tone.chip,
    tone.leftBorder,
    hasAlertNote && 'border-amber/40 bg-amber-pale',
    isPast && appointment.state !== 'completed' && 'opacity-60',
    isSelected && 'ring-2 ring-sage shadow-md',
    isNextUp && !isSelected && 'ring-2 ring-sage',
    omitOuterPosition ? 'h-full w-full' : 'h-full w-full',
  );

  const clientLabel = clientDisplayName ?? 'Client';
  const serviceLabel = service?.name ?? 'Service';

  return (
    <div className={shellClass}>
      {/* Top row: time pill + status badges + capacity ring + new pill */}
      <div className="flex items-center justify-between gap-s2">
        <div className="flex min-w-0 items-center gap-s1">
          <span className="font-mono text-[10px] text-ink-3">
            {formatTimeLocal(appointment.scheduledStartAt)}
          </span>
          {recurring ? (
            <span
              className="text-[11px] leading-none text-ink-3"
              title="Recurring appointment"
              aria-label="Recurring"
            >
              {'↻'}
            </span>
          ) : null}
          {hasAlertNote ? (
            <span
              className="text-[11px] leading-none text-amber"
              title="Has notes — review before session"
              aria-label="Has alert note"
            >
              {'⚠'}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-s1">
          {capacity ? (
            <CapacityRing
              attending={capacity.attending}
              capacity={capacity.capacity}
            />
          ) : null}
          {showStatusBadge ? (
            <Badge tone={tone.badgeTone}>{badgeLabel}</Badge>
          ) : null}
          {intakeChip ? (
            <Badge tone={intakeChip.tone} className="max-w-[9rem] truncate">
              {intakeChip.label}
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Middle: client name */}
      <div className="t-body-sm truncate font-semibold text-ink">
        {clientLabel}
      </div>

      {/* Bottom: service · staff (staff name comes from the lane label so we
          show service alone here — keeps the bottom line readable in narrow chips) */}
      <div className="truncate text-[11px] text-ink-3">{serviceLabel}</div>

      {/* First-time pill: bottom-right corner */}
      {firstTime ? (
        <span className="absolute bottom-s1 right-s1 rounded-sm bg-surface px-[5px] py-[1px] text-[9px] font-bold uppercase tracking-[0.06em] text-terracotta shadow-sm">
          NEW
        </span>
      ) : null}
    </div>
  );
}

interface CapacityRingProps {
  attending: number;
  capacity: number;
}

function CapacityRing({ attending, capacity }: CapacityRingProps) {
  const size = 16;
  const radius = size / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.min(1, attending / Math.max(1, capacity));
  const offset = circumference * (1 - fraction);
  return (
    <span
      className="inline-flex items-center gap-[3px] font-mono text-[10px] text-ink-3"
      title={`${attending}/${capacity} attending`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-line"
          strokeWidth={2}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-sage"
          strokeWidth={2}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span>
        {attending}/{capacity}
      </span>
    </span>
  );
}
