// Shared helper for validating + transforming per-day working-hours
// form rows into the API's WorkingHours JSONB shape. Used by both the
// create/update-staff action (apps/web/app/admin/staff/_actions.ts) and
// the dedicated schedule action
// (apps/web/app/admin/staff/[id]/schedule/_actions.ts). Lives outside
// `_actions.ts` so it doesn't fall under the `'use server'` directive
// (which requires all module exports to be async).

import { DAY_KEYS, type DayKey, type WorkingHours } from '@/lib/api/staff';

export type WorkingHoursFormRows = Partial<
  Record<DayKey, { closed: boolean; start?: string; end?: string }>
>;

// Returns the working hours object (empty if all closed) and accumulates
// per-day errors into the passed-in fieldErrors map. Error keys are
// `workingHours_${day}` to match the form input names.
export function parseWorkingHoursFromValues(
  values: WorkingHoursFormRows | undefined,
  fieldErrors: Record<string, string>,
): WorkingHours {
  const workingHours: WorkingHours = {};
  if (!values) return workingHours;
  for (const day of DAY_KEYS) {
    const row = values[day];
    if (!row || row.closed) continue;
    if (!row.start || !row.end) {
      fieldErrors[`workingHours_${day}`] = 'Set both start and end, or mark closed.';
      continue;
    }
    if (row.start >= row.end) {
      fieldErrors[`workingHours_${day}`] = 'End must be after start.';
      continue;
    }
    workingHours[day] = [{ start: row.start, end: row.end }];
  }
  return workingHours;
}
