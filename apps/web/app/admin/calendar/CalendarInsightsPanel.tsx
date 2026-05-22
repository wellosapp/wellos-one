import { cn } from '@/lib/cn';
import type { Appointment } from '@/lib/api/appointments';

import { AdminCalendarInsights } from './AdminCalendarInsights';

interface CalendarInsightsPanelProps {
  appointments: Appointment[];
  /** True when ?pulse=1 is set in the URL. */
  open: boolean;
}

/**
 * Collapsible panel that wraps the existing AdminCalendarInsights cards. The
 * toolbar "Today's pulse" button toggles `?pulse=1`; this panel reads that
 * flag and slides open/closed accordingly. Default: collapsed.
 */
export function CalendarInsightsPanel({
  appointments,
  open,
}: CalendarInsightsPanelProps) {
  return (
    <section
      id="calendar-insights"
      aria-label="Today&apos;s pulse"
      className={cn(
        'overflow-hidden transition-[max-height,opacity] duration-base',
        open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0',
      )}
    >
      <div className="pt-s2">
        <span className="t-eyebrow text-accent">Today&apos;s pulse</span>
        <h2 className="sr-only">Calendar insights</h2>
        <div className="mt-s3">
          <AdminCalendarInsights appointments={appointments} />
        </div>
      </div>
    </section>
  );
}
