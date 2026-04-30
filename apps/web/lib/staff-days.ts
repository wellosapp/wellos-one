// Day-of-week constants/labels used by both the server StaffForm action
// (apps/web/app/admin/staff/_actions.ts) and the client StaffForm
// component (apps/web/app/admin/staff/StaffForm.tsx). Kept in its own
// module — pulling these from `@/lib/api/staff` would suck the whole
// `apiFetch` chain (and its server-only `@clerk/nextjs/server` import)
// into the client bundle.

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const DAY_KEYS: readonly DayKey[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export type Shift = { start: string; end: string };
export type WorkingHours = Partial<Record<DayKey, Shift[]>>;
