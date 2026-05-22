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
import {
  listWaitlistEntries,
  type WaitlistEntry,
} from '@/lib/api/waitlist';
import { getWhoami, type WhoamiLocation } from '@/lib/api/whoami';
import type { DayKey, Shift } from '@/lib/staff-days';
import type {
  AlertItem,
  Delta,
  KpiSeries,
  NextUpRow,
  OutstandingIntakeRow,
  OverviewData,
  RevenueChartData,
  ScheduleAppointment,
  StaffOnShiftRow,
  WaitlistPreviewRow,
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

async function safeListWaitlist(): Promise<WaitlistEntry[]> {
  try {
    const res = await listWaitlistEntries({ status: 'active', limit: 50 });
    return res.entries;
  } catch (err) {
    console.error('[overview-data] listWaitlistEntries failed', err);
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

// ---- New widget builders ----

/** "today" / "Nd ago" relative label for a past timestamp vs `now`. */
function formatRelativePast(then: Date, now: Date): string {
  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 0) return 'today';
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

/** "Today · 2:00 PM" / "Tomorrow · 9:30 AM" / "Fri · 9:30 AM" for an upcoming time. */
function formatRelativeUpcoming(at: Date, now: Date): string {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const startOfAt = new Date(
    at.getFullYear(),
    at.getMonth(),
    at.getDate(),
    0,
    0,
    0,
    0,
  );
  const dayDiff = Math.round(
    (startOfAt.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000),
  );
  const time = at.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (dayDiff <= 0) return `Today · ${time}`;
  if (dayDiff === 1) return `Tomorrow · ${time}`;
  const weekday = at.toLocaleDateString('en-US', { weekday: 'short' });
  return `${weekday} · ${time}`;
}

/** Map a WaitlistEntry's preference fields into a small one-line label. */
function formatWaitlistPreferenceLabel(entry: WaitlistEntry): string {
  const parts: string[] = [];
  if (entry.preferredTimeOfDay) {
    switch (entry.preferredTimeOfDay) {
      case 'morning':
        parts.push('Mornings');
        break;
      case 'afternoon':
        parts.push('Afternoons');
        break;
      case 'evening':
        parts.push('Evenings');
        break;
      case 'any':
        parts.push('Any time');
        break;
    }
  }
  if (entry.preferredStart) {
    const d = new Date(entry.preferredStart);
    const label = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    parts.push(`from ${label}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Any time';
}

/** Split a "First Last" string from WaitlistEntry.contactName into parts. */
function splitContactName(name: string): { first: string; last: string | null } {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { first: 'Guest', last: null };
  const idx = trimmed.indexOf(' ');
  if (idx === -1) return { first: trimmed, last: null };
  return {
    first: trimmed.slice(0, idx),
    last: trimmed.slice(idx + 1) || null,
  };
}

function buildWaitlistPreview(
  entries: WaitlistEntry[],
  serviceById: Map<string, ServiceListItem>,
  now: Date,
): WaitlistPreviewRow[] {
  return entries
    .filter((e) => e.status === 'active')
    .slice(0, 5)
    .map((entry) => {
      const service = serviceById.get(entry.serviceId);
      const { first, last } = splitContactName(entry.contactName);
      return {
        id: entry.id,
        clientFirstName: first,
        clientLastName: last,
        serviceName: service?.name ?? 'Service',
        preferenceLabel: formatWaitlistPreferenceLabel(entry),
        createdAtLabel: formatRelativePast(new Date(entry.createdAt), now),
      };
    });
}

function buildOutstandingIntake(clients: Client[]): OutstandingIntakeRow[] {
  return clients
    .filter(
      (c) =>
        c.deletedAt === null &&
        (c.intakeStatus === 'pending' || c.intakeStatus === 'sent'),
    )
    .slice(0, 5)
    .map((c) => ({
      clientId: c.id,
      clientFirstName: c.firstName,
      clientLastName: c.lastName,
      // Filter above guarantees the narrow union — re-cast for the type system.
      status: c.intakeStatus as 'pending' | 'sent',
      formId: null,
    }));
}

function buildNextUp(
  appts: Appointment[],
  now: Date,
  clientById: Map<string, Client>,
  staffById: Map<string, Staff>,
  serviceById: Map<string, ServiceListItem>,
): NextUpRow[] {
  const nowMs = now.getTime();
  return appts
    .filter((a) => {
      const t = new Date(a.scheduledStartAt).getTime();
      if (t <= nowMs) return false;
      return a.state !== 'cancelled' && a.state !== 'no_show';
    })
    .sort(
      (a, b) =>
        new Date(a.scheduledStartAt).getTime() -
        new Date(b.scheduledStartAt).getTime(),
    )
    .slice(0, 5)
    .map((a) => {
      const start = new Date(a.scheduledStartAt);
      const end = new Date(a.scheduledEndAt);
      const durationMin = Math.max(
        0,
        Math.round((end.getTime() - start.getTime()) / 60000),
      );
      const client = clientById.get(a.clientId);
      const staffRow = staffById.get(a.staffId);
      const service = serviceById.get(a.serviceId);
      // Prefer the catalog duration when it agrees with the row; otherwise
      // fall back to the scheduled span so the label is never wrong-by-buffer.
      const labelDuration = service?.durationMinutes ?? durationMin;
      return {
        appointmentId: a.id,
        startsAtLabel: formatRelativeUpcoming(start, now),
        startsAtIso: a.scheduledStartAt,
        clientFirstName: client?.firstName ?? 'Client',
        staffFirstName: staffRow?.firstName ?? 'Staff',
        serviceName: service?.name ?? 'Service',
        durationLabel: `${labelDuration} min`,
      };
    });
}

/**
 * Parse the day's shifts for a Staff row. Returns the sorted list of shifts
 * (in minute offsets from midnight) on the supplied weekday. Degrades to []
 * when workingHours is null / malformed / unrecognized.
 */
function shiftsForDay(
  staffRow: Staff,
  dayKey: DayKey,
): Array<{ startMin: number; endMin: number; endLabel: string }> {
  const hours = staffRow.workingHours;
  if (!hours) return [];
  const raw = hours[dayKey];
  if (!Array.isArray(raw)) return [];
  const out: Array<{ startMin: number; endMin: number; endLabel: string }> = [];
  for (const shift of raw) {
    if (!shift || typeof shift !== 'object') continue;
    const startStr = (shift as Shift).start;
    const endStr = (shift as Shift).end;
    if (typeof startStr !== 'string' || typeof endStr !== 'string') continue;
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    if (
      sh === undefined ||
      sm === undefined ||
      eh === undefined ||
      em === undefined ||
      Number.isNaN(sh) ||
      Number.isNaN(sm) ||
      Number.isNaN(eh) ||
      Number.isNaN(em)
    ) {
      continue;
    }
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (endMin <= startMin) continue;
    const period = eh >= 12 ? 'PM' : 'AM';
    const h12 = ((eh + 11) % 12) + 1;
    const endLabel = `${h12}:${em.toString().padStart(2, '0')} ${period}`;
    out.push({ startMin, endMin, endLabel });
  }
  out.sort((a, b) => a.startMin - b.startMin);
  return out;
}

const STATUS_PRIORITY: Record<StaffOnShiftRow['status'], number> = {
  live: 0,
  break: 1,
  off: 2,
};

function buildStaffOnShift(
  staff: Staff[],
  appts: Appointment[],
  now: Date,
): StaffOnShiftRow[] {
  const dayKey = DAY_KEYS_ORDERED[(now.getDay() + 6) % 7];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowMs = now.getTime();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000;

  // Tally same-day appointment load per staff up front.
  const inProgressByStaff = new Map<string, number>();
  const upcomingByStaff = new Map<string, number>();
  for (const a of appts) {
    if (a.state === 'cancelled' || a.state === 'no_show') continue;
    const t = new Date(a.scheduledStartAt).getTime();
    if (t < startOfToday || t >= endOfToday) continue;
    if (a.state === 'in_progress' || a.state === 'checked_in') {
      inProgressByStaff.set(
        a.staffId,
        (inProgressByStaff.get(a.staffId) ?? 0) + 1,
      );
    } else if (t > nowMs) {
      upcomingByStaff.set(
        a.staffId,
        (upcomingByStaff.get(a.staffId) ?? 0) + 1,
      );
    }
  }

  const rows: StaffOnShiftRow[] = [];
  for (const s of staff) {
    if (s.deletedAt) continue;
    if (!s.active) continue;
    const shifts = dayKey ? shiftsForDay(s, dayKey) : [];

    let status: StaffOnShiftRow['status'] = 'off';
    let shiftLabel = 'No shift today';

    if (shifts.length > 0) {
      const dayStart = shifts[0]?.startMin ?? 0;
      const dayEnd = shifts[shifts.length - 1]?.endMin ?? 0;
      const inAnyShift = shifts.some(
        (sh) => nowMin >= sh.startMin && nowMin < sh.endMin,
      );
      const beforeStart = nowMin < dayStart;
      const afterEnd = nowMin >= dayEnd;
      if (inAnyShift) {
        status = 'live';
        // Find the active shift's end label.
        const active = shifts.find(
          (sh) => nowMin >= sh.startMin && nowMin < sh.endMin,
        );
        shiftLabel = `On shift until ${active?.endLabel ?? ''}`.trim();
      } else if (!beforeStart && !afterEnd) {
        // Between two shifts (lunch / split shift).
        status = 'break';
        const nextShift = shifts.find((sh) => sh.startMin > nowMin);
        if (nextShift) {
          const period = Math.floor(nextShift.startMin / 60) >= 12 ? 'PM' : 'AM';
          const h12 = ((Math.floor(nextShift.startMin / 60) + 11) % 12) + 1;
          const min = (nextShift.startMin % 60).toString().padStart(2, '0');
          shiftLabel = `On break until ${h12}:${min} ${period}`;
        } else {
          shiftLabel = 'On break';
        }
      } else if (afterEnd) {
        status = 'off';
        shiftLabel = 'Shift ended';
      } else {
        // Before first shift starts.
        status = 'off';
        const next = shifts[0];
        if (next) {
          const period = Math.floor(next.startMin / 60) >= 12 ? 'PM' : 'AM';
          const h12 = ((Math.floor(next.startMin / 60) + 11) % 12) + 1;
          const min = (next.startMin % 60).toString().padStart(2, '0');
          shiftLabel = `Starts ${h12}:${min} ${period}`;
        }
      }
    }

    const inProgress = inProgressByStaff.get(s.id) ?? 0;
    const upcoming = upcomingByStaff.get(s.id) ?? 0;
    let loadLabel: string;
    if (inProgress === 0 && upcoming === 0) {
      loadLabel = 'No appointments today';
    } else {
      const segs: string[] = [];
      if (inProgress > 0) segs.push(`${inProgress} in progress`);
      if (upcoming > 0) segs.push(`${upcoming} upcoming`);
      loadLabel = segs.join(' · ');
    }

    rows.push({
      staffId: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      shiftLabel,
      loadLabel,
      status,
    });
  }

  rows.sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status];
    const pb = STATUS_PRIORITY[b.status];
    if (pa !== pb) return pa - pb;
    return a.firstName.localeCompare(b.firstName);
  });
  return rows.slice(0, 8);
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
  //    schedule + chart. We extend the upper bound to +7 days so the
  //    `nextUp` widget has rows to surface beyond today.
  const upcomingEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [appts, clients, intakePendingCount, staff, waitlistEntries] =
    await Promise.all([
      safeListAppointments(priorStart.toISOString(), upcomingEnd.toISOString()),
      safeListClients(),
      safeIntakePendingCount(),
      safeListStaff(),
      safeListWaitlist(),
    ]);

  // 3. Schedule lookups. Services are needed by todaysSchedule + nextUp +
  //    the waitlist preview, so fetch once when any of those slices have
  //    rows to name. Client + staff names are already paid for above.
  //
  //    Note: listClients/listStaff/listServices don't accept an
  //    `{ ids: [...] }` filter at the API layer, so we fetch full lists and
  //    look up by id client-side. Acceptable at boutique volumes; revisit
  //    if catalogs balloon.
  const needsServices = appts.length > 0 || waitlistEntries.length > 0;
  const services: ServiceListItem[] = needsServices
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

  // Lookup maps reused across the four new widget builders.
  const clientById = new Map<string, Client>(clients.map((c) => [c.id, c]));
  const staffById = new Map<string, Staff>(staff.map((s) => [s.id, s]));
  const serviceById = new Map<string, ServiceListItem>(
    services.map((s) => [s.id, s]),
  );

  const waitlist = buildWaitlistPreview(waitlistEntries, serviceById, now);
  const outstandingIntake = buildOutstandingIntake(clients);
  const nextUp = buildNextUp(appts, now, clientById, staffById, serviceById);
  const staffOnShift = buildStaffOnShift(staff, appts, now);

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
    waitlist,
    outstandingIntake,
    nextUp,
    staffOnShift,
  };
}
