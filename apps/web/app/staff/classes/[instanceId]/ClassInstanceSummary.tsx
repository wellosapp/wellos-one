import { Card } from '@/components/ui';
import type { InstanceSummary } from '@/lib/api/class-bookings';

// Post-completion summary card (Phase 4). Only visible when
// instance.state === 'completed'. Renders the per-row stats from
// services/classInstanceService.getInstanceSummary.

interface ClassInstanceSummaryProps {
  summary: InstanceSummary;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-s1 rounded-md border border-surface-3 bg-surface px-s4 py-s3">
      <span className="t-caption text-ink-soft">{label}</span>
      <span className="t-display-sm">{value}</span>
    </div>
  );
}

export function ClassInstanceSummary({ summary }: ClassInstanceSummaryProps) {
  const denom = summary.attended + summary.noShow;
  const attendanceRate =
    denom === 0 ? 0 : Math.round((summary.attended / denom) * 100);

  return (
    <Card padding="lg" className="flex flex-col gap-s4">
      <div className="flex flex-col gap-s1">
        <span className="t-eyebrow text-accent">Summary</span>
        <h2 className="t-display-md">Class summary</h2>
      </div>
      <div className="grid gap-s3 sm:grid-cols-2 md:grid-cols-4">
        <StatTile
          label="Attended"
          value={`${summary.attended} of ${summary.totalBooked}`}
        />
        <StatTile label="No-show" value={String(summary.noShow)} />
        <StatTile label="Late" value={String(summary.late)} />
        <StatTile label="Attendance rate" value={`${attendanceRate}%`} />
      </div>
      <p className="t-body-md text-ink-soft">
        {summary.attended} of {summary.totalBooked} attended — {attendanceRate}%
        attendance.
      </p>
    </Card>
  );
}
