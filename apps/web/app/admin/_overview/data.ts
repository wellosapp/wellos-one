import 'server-only';

// Server-only data layer for the admin overview dashboard. Produces the
// OverviewData contract in ./types.ts by fanning out to existing /admin
// list endpoints (no dedicated aggregate endpoint exists). Each top-level
// fetch is wrapped in try/catch so a single bad call degrades only its
// metric — the page never throws.
//
// Volume assumption: boutique tenants (single location, <1000 clients,
// <2 weeks of appointments at a time). We cap pagination at 1000 rows
// per fetch and accept the round-trip overhead for clarity over a
// custom aggregate endpoint.

import { listAppointments, type Appointment } from '@/lib/api/appointments';
import { listClients, type Client } from '@/lib/api/clients';
import { listStaff, type Staff } from '@/lib/api/staff';
import { listServices, type ServiceListItem } from '@/lib/api/services';
import { getWhoami, type WhoamiLocation } from '@/lib/api/whoami';
import type { DayKey, Shift } from '@/lib/staff-days';
import type {
  AlertItem,
  Delta,
  KpiSeries,
  OverviewData,
  RevenueChartData,
  ScheduleAppointment,
} from './types';

// ---- Constants ----

const PAGE_CAP = 1000;
const COLOR_BUCKETS: ScheduleAppointment['colorBucket'][] = [
  'sage',
  'sand',
  'sky',
  'plum',
  'warm',
];

// ---- Pure helpers (exported alongside) ----

/**
 * Monday-anchored week window relative to `now`. Returns this week's
 * [start, now] and the full prior week [start, just-before-thisStart].
 * Computed in browser/runtime local TZ — the caller is expected to
 * resolve `now` against tenant TZ if needed (see `nowInTenantTz`).
 */
export function weekWindow(now: Date): {
  thisStart: Date;
  thisEnd: Date;
  priorStart: Date;
  priorEnd: Date;
} {
  // getDay: Sun=0..Sat=6. Convert to Mon=0..Sun=6.
  const day = (now.getDay() + 6) % 7;
  const thisStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - day,
    0,
    0,
    0,
    0,
  );
  const priorStart = new Date(thisStart);
  priorStart.setDate(thisStart.getDate() - 7);
  const priorEnd = new Date(thisStart.getTime() - 1);
  return { thisStart, thisEnd: now, priorStart, priorEnd };
}

const COUNTED_STATES_FOR_REVENUE: Appointment['state'][] = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'requested',
];

/**
 * Sum bookedBasePriceCents for appointments whose scheduledStartAt falls in
 * [range.from, range.to) AND state is NOT 'cancelled' / 'no_show'.
 */
export function sumRevenueCents(
  appts: Appointment[],
  range: { from: Date; to: Date },
): number {
  const fromMs = range.from.getTime();
  const toMs = range.to.getTime();
  let total = 0;
  for (const a of appts) {
    const t = new Date(a.scheduledStartAt).getTime();
    if (t < fromMs || t >= toMs) continue;
    if (!COUNTED_STATES_FOR_REVENUE.includes(a.state)) continue;
    total += a.bookedBasePriceCents;
  }
  return total;
}

/** Length-7 array indexed Mon..Sun. Entry = dollar total (cents/100). */
export function dailyRevenueSeries(
  appts: Appointment[],
  weekStart: Date,
): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  const startMs = weekStart.getTime();
  const endMs = startMs + 7 * 24 * 60 * 60 * 1000;
  for (const a of appts) {
    const t = new Date(a.scheduledStartAt).getTime();
    if (t < startMs || t >= endMs) continue;
    if (!COUNTED_STATES_FOR_REVENUE.includes(a.state)) continue;
    const dayIdx = Math.floor((t - startMs) / (24 * 60 * 60 * 1000));
    if (dayIdx < 0 || dayIdx > 6) continue;
    out[dayIdx] = (out[dayIdx] ?? 0) + a.bookedBasePriceCents / 100;
  }
  return out;
}

/** Length-7 array indexed Mon..Sun. Entry = count of non-cancelled/no-show. */
export function dailyBookingsSeries(
  appts: Appointment[],
  weekStart: Date,
): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  const startMs = weekStart.getTime();
  const endMs = startMs + 7 * 24 * 60 * 60 * 1000;
  for (const a of appts) {
    const t = new Date(a.scheduledStartAt).getTime();
    if (t < startMs || t >= endMs) continue;
    if (!COUNTED_STATES_FOR_REVENUE.includes(a.state)) continue;
    const dayIdx = Math.floor((t - startMs) / (24 * 60 * 60 * 1000));
    if (dayIdx < 0 || dayIdx > 6) continue;
    out[dayIdx] = (out[dayIdx] ?? 0) + 1;
  }
  return out;
}

const DAY_KEYS_ORDERED: DayKey[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
];

function shiftMinutes(s: Shift): number {
  const [sh, sm] = s.start.split(':').map(Number);
  const [eh, em] = s.end.split(':').map(Number);
  if (
    sh === undefined ||
    sm === undefined ||
    eh === undefined ||
    em === undefined
  ) {
    return 0;
  }
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return Math.max(0, end - start);
}

/**
 * Total available staff-minutes inside [weekStart, weekEnd] across all active
 * (non-deleted) staff. Iterates each day in the range and sums the matching
 * weekday's shifts. workingHours === null or {} contributes zero.
 */
export function staffAvailableMinutes(
  staff: Staff[],
  weekStart: Date,
  weekEnd: Date,
): number {
  if (weekEnd.getTime() <= weekStart.getTime()) return 0;
  let total = 0;
  const oneDayMs = 24 * 60 * 60 * 1000;
  for (const s of staff) {
    if (s.deletedAt) continue;
    if (!s.active) continue;
    const hours = s.workingHours;
    if (!hours) continue;
    // Walk each calendar day in [weekStart, weekEnd).
    for (
      let day = new Date(weekStart);
      day.getTime() < weekEnd.getTime();
      day = new Date(day.getTime() + oneDayMs)
    ) {
      const dayKey = DAY_KEYS_ORDERED[(day.getDay() + 6) % 7];
      if (!dayKey) continue;
      const shifts = hours[dayKey];
      if (!shifts) continue;
      for (const shift of shifts) {
        total += shiftMinutes(shift);
      }
    }
  }
  return total;
}

function roundOneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Null when prior was 0 (caller renders em-dash). */
export function pctDelta(curr: number, prior: number): Delta {
  if (prior === 0) return null;
  const pct = roundOneDecimal(((curr - prior) / prior) * 100);
  return { pct, dir: curr >= prior ? 'up' : 'down' };
}

// ---- Tenant timezone helpers ----

/**
 * Computes a Date representing "now in the tenant's timezone" by reading
 * the wall-clock parts in `tz` and rebuilding a Date with those parts as if
 * they were local. The returned Date is then suitable for the local-TZ math
 * in weekWindow() — its getDay/getDate/etc reflect tenant-local values.
 *
 * If `tz` is undefined or invalid we fall through to system-local time.
 * TODO: replace with a date-fns-tz roundtrip once the dependency is added.
 */
function nowInTenantTz(tz: string | undefined): Date {
  if (!tz) return new Date();
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const grab = (t: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((p) => p.type === t)?.value ?? '0');
    const year = grab('year');
    const month = grab('month');
    const day = grab('day');
    // 'hour' in en-US hour12:false comes back as '24' at midnight.
    let hour = grab('hour');
    if (hour === 24) hour = 0;
    const minute = grab('minute');
    const second = grab('second');
    return new Date(year, month - 1, day, hour, minute, second, 0);
  } catch {
    return new Date();
  }
}

/** "Wednesday · May 21" rendered in the tenant's TZ when available. */
function formatTodayLabel(now: Date, tz: string | undefined): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  };
  if (tz) opts.timeZone = tz;
  const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${weekday} · ${month} ${day}`;
}

/** Short header label e.g. "May 18" for the Mon of the current week. */
function formatWeekOf(weekStart: Date): string {
  const month = weekStart.toLocaleString('en-US', { month: 'long' });
  return `${month} ${weekStart.getDate()}`;
}

// ---- Color bucket ----

/** Deterministic 5-bucket color from the serviceId so a service reads consistent. */
function colorBucketForService(
  serviceId: string,
): ScheduleAppointment['colorBucket'] {
  // Use the first 4 hex chars where possible; fall back to a char-sum.
  const hexMatch = serviceId.match(/[0-9a-fA-F]{4}/);
  let n: number;
  if (hexMatch) {
    n = parseInt(hexMatch[0], 16);
  } else {
    n = 0;
    for (const ch of serviceId) n = (n + ch.charCodeAt(0)) % 1_000_000;
  }
  const idx = Math.abs(n) % COLOR_BUCKETS.length;
  return COLOR_BUCKETS[idx] ?? 'sage';
}

// ---- Fallback shapes ----

const EMPTY_KPI: KpiSeries = { value: null, delta: null, sparkline: [] };

function emptyRevenueChart(weekStart: Date): RevenueChartData {
  return {
    weekOf: formatWeekOf(weekStart),
    currentWeek: [0, 0, 0, 0, 0, 0, 0],
    priorWeek: [0, 0, 0, 0, 0, 0, 0],
    total: 0,
    deltaPct: null,
  };
}

// ---- Wrapped fetches ----

async function safeListAppointments(
  fromIso: string,
  toIso: string,
): Promise<Appointment[]> {
  try {
    const res = await listAppointments({
      from: fromIso,
      to: toIso,
      take: PAGE_CAP,
    });
    return res.appointments;
  } catch (err) {
    console.error('[overview-data] listAppointments failed', err);
    return [];
  }
}

async function safeListClients(): Promise<Client[]> {
  try {
    const res = await listClients({ take: PAGE_CAP });
    return res.clients;
  } catch (err) {
    console.error('[overview-data] listClients failed', err);
    return [];
  }
}

async function safeIntakePendingCount(): Promise<number> {
  try {
    const res = await listClients({ intakeStatus: 'pending', take: PAGE_CAP });
    return res.total;
  } catch (err) {
    console.error('[overview-data] listClients(pending) failed', err);
    return 0;
  }
}

async function safeListStaff(): Promise<Staff[]> {
  try {
    const res = await listStaff({ take: PAGE_CAP });
    return res.staff;
  } catch (err) {
    console.error('[overview-data] listStaff failed', err);
    return [];
  }
}

async function safeListServices(): Promise<ServiceListItem[]> {
  try {
    const res = await listServices({ take: PAGE_CAP });
    return res.services;
  } catch (err) {
    console.error('[overview-data] listServices failed', err);
    return [];
  }
}

async function safeTenantTimezone(): Promise<string | undefined> {
  try {
    const w = await getWhoami();
    const loc: WhoamiLocation | undefined = w.locations[0];
    return loc?.timezone;
  } catch (err) {
    console.error('[overview-data] getWhoami failed', err);
    return undefined;
  }
}

// ---- Per-section assembly ----

function buildAlerts(intakePendingCount: number): AlertItem[] {
  const alerts: AlertItem[] = [];
  if (intakePendingCount > 0) {
    alerts.push({
      id: 'intake-pending',
      icon: 'clipboard',
      text: `${intakePendingCount} client${intakePendingCount === 1 ? '' : 's'} ${intakePendingCount === 1 ? 'has' : 'have'} outstanding intake forms.`,
      action: { label: 'Review', href: '/admin/intake-forms' },
      kind: 'computed',
    });
  }
  alerts.push({
    id: 'block-approvals',
    icon: 'warn',
    text: 'Block approval queue coming with the schedule rework.',
    action: null,
    kind: 'coming-soon',
  });
  return alerts;
}

/**
 * Counts appointments scheduled today (not cancelled / no_show).
 * Builds a 7-day sparkline of daily booking counts for the current week.
 * Delta compares today vs same weekday prior week.
 */
function buildBookingsKpi(
  appts: Appointment[],
  now: Date,
  thisStart: Date,
  priorStart: Date,
): KpiSeries {
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  let todayCount = 0;
  const todayStartMs = todayStart.getTime();
  const todayEndMs = todayEnd.getTime();
  for (const a of appts) {
    const t = new Date(a.scheduledStartAt).getTime();
    if (t < todayStartMs || t >= todayEndMs) continue;
    if (!COUNTED_STATES_FOR_REVENUE.includes(a.state)) continue;
    todayCount += 1;
  }

  // Same-weekday prior week comparison.
  const priorDayStart = new Date(
    priorStart.getTime() +
      (todayStartMs - thisStart.getTime()),
  );
  const priorDayEnd = new Date(priorDayStart.getTime() + 24 * 60 * 60 * 1000);
  let priorCount = 0;
  for (const a of appts) {
    const t = new Date(a.scheduledStartAt).getTime();
    if (t < priorDayStart.getTime() || t >= priorDayEnd.getTime()) continue;
    if (!COUNTED_STATES_FOR_REVENUE.includes(a.state)) continue;
    priorCount += 1;
  }

  return {
    value: todayCount,
    delta: pctDelta(todayCount, priorCount),
    sparkline: dailyBookingsSeries(appts, thisStart),
  };
}

function buildRevenueKpi(
  appts: Appointment[],
  thisStart: Date,
  thisEnd: Date,
  priorStart: Date,
  priorEnd: Date,
): KpiSeries {
  const currCents = sumRevenueCents(appts, { from: thisStart, to: thisEnd });
  const priorCents = sumRevenueCents(appts, {
    from: priorStart,
    to: priorEnd,
  });
  return {
    value: Math.round(currCents / 100),
    delta: pctDelta(currCents, priorCents),
    sparkline: dailyRevenueSeries(appts, thisStart),
  };
}

function buildNewClientsKpi(
  clients: Client[],
  thisStart: Date,
  thisEnd: Date,
  priorStart: Date,
  priorEnd: Date,
): KpiSeries {
  const thisStartMs = thisStart.getTime();
  const thisEndMs = thisEnd.getTime();
  const priorStartMs = priorStart.getTime();
  const priorEndMs = priorEnd.getTime();

  let curr = 0;
  let prior = 0;
  // 7-bucket sparkline indexed Mon..Sun for current week.
  const spark = [0, 0, 0, 0, 0, 0, 0];

  for (const c of clients) {
    const t = new Date(c.createdAt).getTime();
    if (t >= thisStartMs && t < thisEndMs) {
      curr += 1;
      const dayIdx = Math.floor(
        (t - thisStartMs) / (24 * 60 * 60 * 1000),
      );
      if (dayIdx >= 0 && dayIdx < 7) {
        spark[dayIdx] = (spark[dayIdx] ?? 0) + 1;
      }
    } else if (t >= priorStartMs && t <= priorEndMs) {
      prior += 1;
    }
  }

  return {
    value: curr,
    delta: pctDelta(curr, prior),
    sparkline: spark,
  };
}

function buildUtilizationKpi(
  appts: Appointment[],
  staff: Staff[],
  thisStart: Date,
  thisEnd: Date,
  priorStart: Date,
  priorEnd: Date,
): KpiSeries {
  const availMinutes = staffAvailableMinutes(staff, thisStart, thisEnd);
  if (availMinutes === 0) {
    return { value: null, delta: null, sparkline: [] };
  }

  // Booked minutes in current window.
  const thisStartMs = thisStart.getTime();
  const thisEndMs = thisEnd.getTime();
  let bookedMinutes = 0;
  for (const a of appts) {
    const s = new Date(a.scheduledStartAt).getTime();
    if (s < thisStartMs || s >= thisEndMs) continue;
    if (!COUNTED_STATES_FOR_REVENUE.includes(a.state)) continue;
    const e = new Date(a.scheduledEndAt).getTime();
    bookedMinutes += Math.max(0, (e - s) / 60000);
  }
  const currPct = roundOneDecimal((bookedMinutes / availMinutes) * 100);

  // Prior-week delta — same arithmetic over the prior window.
  const priorAvail = staffAvailableMinutes(staff, priorStart, priorEnd);
  let priorBooked = 0;
  if (priorAvail > 0) {
    const priorStartMs = priorStart.getTime();
    const priorEndMs = priorEnd.getTime();
    for (const a of appts) {
      const s = new Date(a.scheduledStartAt).getTime();
      if (s < priorStartMs || s > priorEndMs) continue;
      if (!COUNTED_STATES_FOR_REVENUE.includes(a.state)) continue;
      const e = new Date(a.scheduledEndAt).getTime();
      priorBooked += Math.max(0, (e - s) / 60000);
    }
  }
  const priorPct =
    priorAvail > 0
      ? roundOneDecimal((priorBooked / priorAvail) * 100)
      : 0;

  return {
    value: currPct,
    delta: pctDelta(currPct, priorPct),
    sparkline: [],
  };
}

function buildTodaysSchedule(
  appts: Appointment[],
  clients: Client[],
  staff: Staff[],
  services: ServiceListItem[],
  now: Date,
): ScheduleAppointment[] {
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const todayStartMs = todayStart.getTime();
  const todayEndMs = todayEnd.getTime();

  const clientById = new Map<string, Client>(clients.map((c) => [c.id, c]));
  const staffById = new Map<string, Staff>(staff.map((s) => [s.id, s]));
  const serviceById = new Map<string, ServiceListItem>(
    services.map((s) => [s.id, s]),
  );

  const out: ScheduleAppointment[] = [];
  for (const a of appts) {
    const startDate = new Date(a.scheduledStartAt);
    const startMs = startDate.getTime();
    if (startMs < todayStartMs || startMs >= todayEndMs) continue;

    const endDate = new Date(a.scheduledEndAt);
    const durationMs = endDate.getTime() - startMs;
    const durationHours = Math.max(0, durationMs / (60 * 60 * 1000));
    const startHour =
      startDate.getHours() + startDate.getMinutes() / 60;

    const client = clientById.get(a.clientId);
    const staffRow = staffById.get(a.staffId);
    const service = serviceById.get(a.serviceId);

    out.push({
      id: a.id,
      startHour,
      durationHours,
      clientFirstName: client?.firstName ?? 'Client',
      staffFirstName: staffRow?.firstName ?? 'Staff',
      serviceName: service?.name ?? 'Service',
      state: a.state,
      colorBucket: colorBucketForService(a.serviceId),
    });
  }
  out.sort((a, b) => a.startHour - b.startHour);
  return out;
}

function buildRevenueChart(
  appts: Appointment[],
  thisStart: Date,
  priorStart: Date,
): RevenueChartData {
  const currentWeek = dailyRevenueSeries(appts, thisStart);
  const priorWeek = dailyRevenueSeries(appts, priorStart);
  const currTotal = currentWeek.reduce((acc, n) => acc + n, 0);
  const priorTotal = priorWeek.reduce((acc, n) => acc + n, 0);
  const deltaPct =
    priorTotal === 0
      ? null
      : roundOneDecimal(((currTotal - priorTotal) / priorTotal) * 100);
  return {
    weekOf: formatWeekOf(thisStart),
    currentWeek,
    priorWeek,
    total: Math.round(currTotal),
    deltaPct,
  };
}

// ---- Entry point ----

/**
 * Aggregates everything the admin overview dashboard needs. One round trip
 * for the four core fetches, plus a second batch is implicit — we use
 * fetch-all-then-filter for client/staff/service lookups because the
 * existing /admin list endpoints don't support `{ ids: [...] }` filtering.
 *
 * Never throws. Each fetch is wrapped in its own try/catch; a failed call
 * leaves its slice in the fallback shape (KPI value: null, arrays empty).
 */
export async function getOverviewData(): Promise<OverviewData> {
  // 1. Resolve tenant TZ first so the day-bounded queries land on the right
  //    "today". whoami is cheap (single DB hit) and the rest of the work
  //    depends on the window math.
  const tz = await safeTenantTimezone();
  const now = nowInTenantTz(tz);
  const { thisStart, thisEnd, priorStart, priorEnd } = weekWindow(now);

  // Today bounds derive from `now` (in tenant TZ).
  const todayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );

  // 2. Parallel core fetches. The appointments query covers prior week +
  //    this week + (rest of today) — one trip serves bookings + revenue +
  //    schedule + chart.
  const [appts, clients, intakePendingCount, staff] = await Promise.all([
    safeListAppointments(priorStart.toISOString(), todayEnd.toISOString()),
    safeListClients(),
    safeIntakePendingCount(),
    safeListStaff(),
  ]);

  // 3. Schedule lookups. Only fetch services if we have schedule rows that
  //    need names — saves a round trip on empty days. Client + staff names
  //    are already paid for above.
  const hasScheduleToday = appts.some((a) => {
    const t = new Date(a.scheduledStartAt).getTime();
    const dayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    ).getTime();
    return t >= dayStart && t < todayEnd.getTime();
  });
  // Note: listClients/listStaff/listServices don't accept an `{ ids: [...] }`
  // filter at the API layer, so we fetch full lists and look up by id
  // client-side. Acceptable at boutique volumes; revisit if catalogs balloon.
  const services: ServiceListItem[] = hasScheduleToday
    ? await safeListServices()
    : [];

  const alerts = buildAlerts(intakePendingCount);
  const bookings = buildBookingsKpi(appts, now, thisStart, priorStart);
  const revenue = buildRevenueKpi(
    appts,
    thisStart,
    thisEnd,
    priorStart,
    priorEnd,
  );
  const newClients = buildNewClientsKpi(
    clients,
    thisStart,
    thisEnd,
    priorStart,
    priorEnd,
  );
  const utilization = buildUtilizationKpi(
    appts,
    staff,
    thisStart,
    thisEnd,
    priorStart,
    priorEnd,
  );
  const todaysSchedule = buildTodaysSchedule(
    appts,
    clients,
    staff,
    services,
    now,
  );
  const revenueChart = appts.length
    ? buildRevenueChart(appts, thisStart, priorStart)
    : emptyRevenueChart(thisStart);

  // Defensive: if a fetch failed and degraded a slice to its empty shape,
  // honor that — bookings/revenue/etc above already use EMPTY_KPI semantics
  // implicitly via the empty `appts` array. Nothing extra to wire here.
  void EMPTY_KPI;

  return {
    alerts,
    bookings,
    revenue,
    newClients,
    utilization,
    todaysSchedule,
    todayLabel: formatTodayLabel(now, tz),
    revenueChart,
  };
}
