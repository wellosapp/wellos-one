// Shared type contract for the admin overview dashboard.
//
// `apps/web/app/admin/_overview/data.ts` is the only place that PRODUCES
// these shapes (server-only, computed from raw appointment + client +
// staff data). Every widget under `apps/web/app/admin/_overview/`
// CONSUMES them via props. Keep this file alignment-only — no logic
// goes here.

/**
 * A single tile in the AlertsStrip row. Two render modes:
 *   - 'computed' → real data; renders the action button.
 *   - 'coming-soon' → tile shows up dimmed with an italic 'Coming soon'
 *     caption and no action. Used for items that need backend work the
 *     overview page isn't blocked on (e.g. Block.approvalStatus).
 */
export type AlertItem = {
  id: string;
  icon: 'warn' | 'bell' | 'clipboard';
  text: string;
  action: { label: string; href: string } | null;
  kind: 'computed' | 'coming-soon';
};

/** Up/down percentage relative to prior week. Null when prior was zero. */
export type Delta = { pct: number; dir: 'up' | 'down' } | null;

/**
 * Standard KPI shape consumed by KpiCard. `value === null` means the
 * computation couldn't run (e.g. utilization with zero scheduled hours);
 * the UI renders an em-dash and explains via tooltip.
 */
export type KpiSeries = {
  value: number | null;
  delta: Delta;
  sparkline: number[];
};

/** One appointment positioned on the horizontal time strip. */
export type ScheduleAppointment = {
  id: string;
  /** 24-hour decimal in the tenant's timezone; e.g. 14.25 = 2:15 PM. */
  startHour: number;
  durationHours: number;
  clientFirstName: string;
  staffFirstName: string;
  serviceName: string;
  state:
    | 'scheduled'
    | 'confirmed'
    | 'checked_in'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | 'no_show'
    | 'requested'
    | 'declined';
  /** Rotated by service id so the same service reads the same color. */
  colorBucket: 'sage' | 'sand' | 'sky' | 'plum' | 'warm';
};

/** Numbers feed into the inline-SVG line chart in RevenueChart. */
export type RevenueChartData = {
  /** Short label for the chart header — e.g. 'May 18'. */
  weekOf: string;
  /** 7 daily dollar totals, Monday → Sunday. */
  currentWeek: number[];
  /** Same shape for the prior week. */
  priorWeek: number[];
  /** Sum of currentWeek (dollars). */
  total: number;
  /** Null when prior week's total was zero. */
  deltaPct: number | null;
};

/** Single root shape returned by getOverviewData(). */
export type OverviewData = {
  alerts: AlertItem[];
  /** Count of non-cancelled non-no-show appointments scheduled today. */
  bookings: KpiSeries;
  /** Dollars (not cents). Spark is daily dollar totals for the last 7 days. */
  revenue: KpiSeries;
  /** Count of Client rows created within the last 7 days. */
  newClients: KpiSeries;
  /** Percentage 0-100. value is null when no staff working-hours configured. */
  utilization: KpiSeries;
  /** Sorted by scheduledStartAt ascending. */
  todaysSchedule: ScheduleAppointment[];
  /** e.g. 'Wednesday · May 21'. */
  todayLabel: string;
  revenueChart: RevenueChartData;
  waitlist: WaitlistPreviewRow[];
  outstandingIntake: OutstandingIntakeRow[];
  nextUp: NextUpRow[];
  staffOnShift: StaffOnShiftRow[];
};

export type WaitlistPreviewRow = {
  id: string;
  clientFirstName: string;
  clientLastName: string | null;
  serviceName: string;
  /** Human-friendly time preference. e.g. 'Mornings · Tue/Thu'. */
  preferenceLabel: string;
  /** e.g. 'today', '2d ago' — server-formatted relative. */
  createdAtLabel: string;
};

export type OutstandingIntakeRow = {
  clientId: string;
  clientFirstName: string;
  clientLastName: string | null;
  /** 'pending' | 'sent' — drives the badge tone. */
  status: 'pending' | 'sent';
  /** Optional: id of the intake form template if we have it. Null when unknown. */
  formId: string | null;
};

export type NextUpRow = {
  appointmentId: string;
  startsAtLabel: string;          // e.g. 'Tomorrow · 2:00 PM' or 'Fri · 9:30 AM'
  startsAtIso: string;             // for the calendar deep-link
  clientFirstName: string;
  staffFirstName: string;
  serviceName: string;
  durationLabel: string;           // e.g. '50 min'
};

export type StaffOnShiftRow = {
  staffId: string;
  firstName: string;
  lastName: string | null;
  /** e.g. 'On shift until 5:00 PM'. */
  shiftLabel: string;
  /** Optional small text under the name. Number of appointments currently in progress + queued today. */
  loadLabel: string;
  /** Drives the small colored dot — design tokens '.status-dot live | break | off'. */
  status: 'live' | 'break' | 'off';
};
