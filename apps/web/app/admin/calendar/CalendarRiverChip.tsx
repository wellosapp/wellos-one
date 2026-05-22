import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatTimeLocal } from '@/lib/calendar';
import type {
  Appointment,
  AppointmentState,
} from '@/lib/api/appointments';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';

// Hybrid color treatment per the design package:
//   - chip background tints by SERVICE (warm/sage/plum/sky/amber/red)
//   - 3px left rule + status badge by STATE (preserves existing state vocabulary)
// Past chips dim to 60%; the "next up" chip gets ring-2 ring-accent.

const STATUS_TONE: Record<
  AppointmentState,
  {
    badgeTone: 'neutral' | 'accent' | 'red' | 'amber' | 'green';
    label: string;
    /** Tailwind class for the 3px left rule color (border-l-*). */
    ruleClass: string;
  }
> = {
  requested: {
    badgeTone: 'amber',
    label: 'Requested',
    ruleClass: 'border-l-amber',
  },
  scheduled: {
    badgeTone: 'neutral',
    label: 'Scheduled',
    ruleClass: 'border-l-ink-soft',
  },
  confirmed: {
    badgeTone: 'accent',
    label: 'Confirmed',
    ruleClass: 'border-l-accent',
  },
  checked_in: {
    badgeTone: 'amber',
    label: 'Checked in',
    ruleClass: 'border-l-amber',
  },
  in_progress: {
    badgeTone: 'amber',
    label: 'In progress',
    ruleClass: 'border-l-amber',
  },
  completed: {
    badgeTone: 'green',
    label: 'Completed',
    ruleClass: 'border-l-green',
  },
  cancelled: {
    badgeTone: 'red',
    label: 'Cancelled',
    ruleClass: 'border-l-red',
  },
  no_show: {
    badgeTone: 'red',
    label: 'No-show',
    ruleClass: 'border-l-red',
  },
};

// Service color palette — keyed by a deterministic hash of Service.id so each
// service is a stable color across reloads, but new services don't require
// schema work to render. The first four use existing *-pale tokens; the
// warm/plum/sky variants reference arbitrary bg-[#…] values that map to the
// expanded palette landing with the shell PR.
const SERVICE_PALETTE = [
  'bg-accent-pale', // sage
  'bg-amber-pale', // amber
  'bg-red-pale', // red
  'bg-green-pale', // green
  // TODO(shell-pr): swap to token classes (bg-warm-pale, bg-plum-pale, bg-sky-pale)
  // when the expanded palette merges. Hex values are the design's warm/plum/sky variants.
  'bg-[#f6dfd2]', // warm (candlelight)
  'bg-[#ece4f0]', // plum (restorative)
  'bg-[#e7eef8]', // sky (reformer/ocean)
] as const;

function serviceBgClass(serviceId: string | undefined): string {
  if (!serviceId) return 'bg-surface-2';
  let h = 0;
  for (let i = 0; i < serviceId.length; i++) {
    h = (h * 31 + serviceId.charCodeAt(i)) >>> 0;
  }
  return SERVICE_PALETTE[h % SERVICE_PALETTE.length] ?? 'bg-surface-2';
}

/* ──────────────── stub helpers ─────────────────
   These return false/null until backing data lands on main. Names match the
   design vocabulary so the chip renders the right surface once data exists. */

// TODO(data): flip when Client.firstTime field lands.
function isFirstTime(_a: Appointment): boolean {
  return false;
}

// TODO(data): flip when Appointment.group structure lands.
function groupCapacity(
  _a: Appointment,
): { attending: number; cap: number } | null {
  return null;
}

// TODO(data): flip when Appointment.seriesId lands.
function isRecurring(_a: Appointment): boolean {
  return false;
}

interface CalendarRiverChipProps {
  appointment: Appointment;
  service: Service | null;
  staff: Staff | null;
  clientDisplayName?: string;
  isSelected: boolean;
  isNextUp: boolean;
}

export function CalendarRiverChip({
  appointment,
  service,
  staff,
  clientDisplayName,
  isSelected,
  isNextUp,
}: CalendarRiverChipProps) {
  const tone = STATUS_TONE[appointment.state];
  const isPast =
    new Date(appointment.scheduledEndAt) < new Date() &&
    appointment.state !== 'completed';

  const bgClass = serviceBgClass(service?.id);
  const cap = groupCapacity(appointment);
  const firstTime = isFirstTime(appointment);
  const recurring = isRecurring(appointment);

  const staffName = staff ? staff.firstName : '';

  return (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col gap-s1 overflow-hidden rounded-md px-s3 py-s2',
        'border border-surface-3 border-l-[3px] shadow-sm',
        'transition-[transform,box-shadow] duration-fast hover:-translate-y-px hover:shadow-md',
        bgClass,
        tone.ruleClass,
        isPast && 'opacity-60',
        isSelected && 'ring-2 ring-accent shadow-md',
        !isSelected && isNextUp && 'ring-2 ring-accent',
      )}
      title={`${service?.name ?? 'Service'} · ${formatTimeLocal(appointment.scheduledStartAt)}–${formatTimeLocal(appointment.scheduledEndAt)}`}
    >
      <div className="flex items-center justify-between gap-s2">
        <span className="t-caption font-mono font-semibold text-ink truncate">
          {formatTimeLocal(appointment.scheduledStartAt)}
          {' – '}
          {formatTimeLocal(appointment.scheduledEndAt)}
        </span>
        <div className="flex shrink-0 items-center gap-s1">
          {recurring && (
            <span
              aria-label="Recurring"
              className="t-caption font-semibold text-ink-soft"
            >
              {/* TODO(data): real recurring icon when Appointment.seriesId lands. */}
              ↻
            </span>
          )}
          {firstTime && !cap && (
            <Badge tone="accent" className="shrink-0">
              NEW
            </Badge>
          )}
          {cap ? (
            <Badge tone="neutral" className="shrink-0 font-mono">
              {cap.attending}/{cap.cap}
            </Badge>
          ) : (
            <Badge tone={tone.badgeTone} className="shrink-0">
              {isNextUp ? 'Next up' : tone.label}
            </Badge>
          )}
        </div>
      </div>
      <strong className="min-w-0 truncate t-body-sm font-semibold text-ink">
        {clientDisplayName ?? 'Client'}
      </strong>
      <span className="min-w-0 truncate t-caption text-ink-soft">
        {service?.name ?? 'Service'}
        {staffName ? ` · ${staffName}` : ''}
      </span>
    </div>
  );
}
