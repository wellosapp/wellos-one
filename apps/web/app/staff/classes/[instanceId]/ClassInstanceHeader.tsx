import type { ClassInstanceWithRelations } from '@/lib/api/class-instances';
import { Badge, Card } from '@/components/ui';
import { formatDateLong, formatTimeLocal } from '@/lib/calendar';

import { InstanceStateControls } from './InstanceStateControls';

// Server component header for the staff roster page (Phase 4). Renders class
// name + state badge, time/location/instructor row, capacity meter, and the
// admin-only lifecycle controls (delegated to a small client component for
// the action buttons).

type Tone = 'neutral' | 'accent' | 'amber' | 'green' | 'red';

const STATE_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATE_TONE: Record<string, Tone> = {
  scheduled: 'neutral',
  in_progress: 'accent',
  completed: 'green',
  cancelled: 'red',
};

interface ClassInstanceHeaderProps {
  instance: ClassInstanceWithRelations;
  /** Number of bookings currently checked-in (state='checked_in'). */
  checkedInCount: number;
  /** Number of active (confirmed + checked_in) bookings — drives capacity bar. */
  activeBookedCount: number;
  /** Effective capacity (instance.capacityOverride ?? class.maxCapacity). */
  capacity: number;
  /** Whether the current user can change instance state. */
  isAdminOrManager: boolean;
}

export function ClassInstanceHeader({
  instance,
  checkedInCount,
  activeBookedCount,
  capacity,
  isAdminOrManager,
}: ClassInstanceHeaderProps) {
  const start = formatTimeLocal(instance.scheduledStartAt);
  const end = formatTimeLocal(instance.scheduledEndAt);
  const day = formatDateLong(new Date(instance.scheduledStartAt));
  const instructorName = [instance.staff.firstName, instance.staff.lastName]
    .filter(Boolean)
    .join(' ');
  const pct = Math.max(
    0,
    Math.min(100, capacity === 0 ? 0 : (activeBookedCount / capacity) * 100),
  );

  return (
    <Card padding="lg" className="flex flex-col gap-s4">
      <div className="flex flex-col gap-s2 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-s2">
          <span className="t-eyebrow text-accent">Class</span>
          <h1 className="t-display-lg flex flex-wrap items-baseline gap-s3">
            {instance.class.name}
            <Badge tone={STATE_TONE[instance.state] ?? 'neutral'}>
              {STATE_LABEL[instance.state] ?? instance.state}
            </Badge>
          </h1>
          <div className="flex flex-wrap items-center gap-s3 t-body-md text-ink-soft">
            <span>{day}</span>
            <span aria-hidden="true">·</span>
            <span>
              {start} – {end}
            </span>
            <span aria-hidden="true">·</span>
            <span>{instance.location.name}</span>
            <span aria-hidden="true">·</span>
            <span>{instructorName}</span>
          </div>
        </div>

        {isAdminOrManager && instance.state !== 'cancelled' && (
          <InstanceStateControls
            instanceId={instance.id}
            state={instance.state}
          />
        )}
      </div>

      <div className="flex flex-col gap-s2">
        <div className="flex items-baseline justify-between">
          <span className="t-caption text-ink-soft">
            {checkedInCount} of {capacity} checked in
          </span>
          <span className="t-caption text-ink-soft">
            {activeBookedCount} active booking
            {activeBookedCount === 1 ? '' : 's'}
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-sm bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={capacity}
          aria-valuenow={checkedInCount}
          aria-label="Check-in progress"
        >
          <div
            className="h-full bg-accent"
            style={{
              width: `${capacity === 0 ? 0 : (checkedInCount / capacity) * 100}%`,
            }}
          />
          {/* Faint sage tint behind the bar to show active bookings vs capacity. */}
          <div
            className="-mt-2 h-full bg-accent-pale"
            style={{ width: `${pct}%` }}
            aria-hidden="true"
          />
        </div>
      </div>
    </Card>
  );
}
