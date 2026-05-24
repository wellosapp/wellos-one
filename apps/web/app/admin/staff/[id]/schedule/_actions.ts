'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import { updateStaff, DAY_KEYS, type DayKey, type WorkingHours } from '@/lib/api/staff';

import { parseWorkingHoursFromValues } from '../../_working-hours';

// Dedicated server action for the staff working-hours editor. Only
// updates the workingHours JSONB column — all other staff fields are
// left untouched by sending a partial PATCH with just `workingHours`.
// Validation rules (start < end, closed vs. set both) are shared with
// the create-staff flow via parseWorkingHoursFromValues.

export type WorkingHoursFormValues = Partial<
  Record<DayKey, { closed: boolean; start?: string; end?: string }>
>;

export type ScheduleActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  // Echo back per-day form values so the editor can re-render user
  // input on validation errors. Local state still takes priority on
  // render; this exists for completeness with the React-18 useFormState
  // re-render contract.
  values?: WorkingHoursFormValues;
};

function pick(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function valuesFromForm(formData: FormData): WorkingHoursFormValues {
  const out: WorkingHoursFormValues = {};
  for (const day of DAY_KEYS) {
    out[day] = {
      closed: formData.get(`workingHours_${day}_closed`) === '1',
      start: pick(formData, `workingHours_${day}_start`),
      end: pick(formData, `workingHours_${day}_end`),
    };
  }
  return out;
}

function parseWorkingHours(values: WorkingHoursFormValues): {
  workingHours?: WorkingHours;
  fieldErrors?: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};
  const workingHours = parseWorkingHoursFromValues(values, fieldErrors);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  return {
    workingHours: Object.keys(workingHours).length > 0 ? workingHours : undefined,
  };
}

export async function updateStaffScheduleAction(
  staffId: string,
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const values = valuesFromForm(formData);
  const parsed = parseWorkingHours(values);
  if (parsed.fieldErrors) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  try {
    await updateStaff(staffId, { workingHours: parsed.workingHours });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 403) {
        return {
          ok: false,
          error: 'You do not have permission to update staff schedule.',
          values,
        };
      }
      if (
        err.status === 400 &&
        err.body &&
        typeof err.body === 'object' &&
        'issues' in err.body
      ) {
        // Map API field-level errors back to form keys. API issue paths
        // look like "workingHours.mon" or "workingHours.mon.0.end" —
        // collapse to per-day form key (workingHours_mon).
        const issues = (err.body as { issues: Array<{ path: string; message: string }> })
          .issues;
        const fieldErrors: Record<string, string> = {};
        for (const issue of issues) {
          let formPath = issue.path;
          if (issue.path.startsWith('workingHours.')) {
            const day = issue.path.split('.')[1];
            if (day) formPath = `workingHours_${day}`;
          }
          if (formPath) fieldErrors[formPath] = issue.message;
        }
        return {
          ok: false,
          error: 'Please fix the highlighted fields.',
          fieldErrors,
          values,
        };
      }
      return { ok: false, error: err.message, values };
    }
    return { ok: false, error: 'Could not save working hours.', values };
  }

  revalidatePath(`/admin/staff/${staffId}/schedule`);
  revalidatePath(`/admin/staff/${staffId}`);
  return { ok: true, values };
}
