'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import {
  createStaff,
  deleteStaff,
  updateStaff,
  DAY_KEYS,
  type DayKey,
  type StaffWriteBody,
} from '@/lib/api/staff';
import { ApiError } from '@/lib/api/client';

import { parseWorkingHoursFromValues } from './_working-hours';

// Server actions for admin Staff CRUD with inline StaffService M2M
// assignment. Mirrors services/_actions.ts. No duplicate-warning
// surface (Staff doesn't carry one).

export type StaffFormValues = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  // Strings preserve user input on validation re-render even if numeric
  // fields don't parse.
  hourlyRateDollars?: string;
  commissionRatePct?: string;
  active?: boolean;
  // Working hours flattened to per-day form fields. closed: true means
  // "no shift today"; otherwise start + end form a single shift.
  workingHours?: Partial<
    Record<DayKey, { closed: boolean; start?: string; end?: string }>
  >;
  // Selected service IDs from the multi-select checklist.
  serviceIds?: string[];
};

export type ActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: StaffFormValues;
};

function pick(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function valuesFromForm(formData: FormData): StaffFormValues {
  // The Overview StaffForm hides the working-hours fieldset; per-day
  // shifts are edited from a dedicated tab. Only read workingHours_*
  // fields when the form posts the `includeWorkingHours` marker —
  // otherwise leave workingHours undefined so parseBody emits undefined
  // to the API (partial update, shifts untouched).
  const includeWorkingHours = formData.get('includeWorkingHours') === '1';
  let workingHours: StaffFormValues['workingHours'];
  if (includeWorkingHours) {
    const rows: NonNullable<StaffFormValues['workingHours']> = {};
    for (const day of DAY_KEYS) {
      rows[day] = {
        closed: formData.get(`workingHours_${day}_closed`) === '1',
        start: pick(formData, `workingHours_${day}_start`),
        end: pick(formData, `workingHours_${day}_end`),
      };
    }
    workingHours = rows;
  }
  // The Overview StaffForm hides the services fieldset; service
  // assignments are edited from a dedicated tab. Only read serviceIds
  // from FormData when the form posts the `includeServiceIds` marker —
  // otherwise leave serviceIds undefined so parseBody emits undefined to
  // the API (partial update, M2M untouched).
  const includeServiceIds = formData.get('includeServiceIds') === '1';
  return {
    firstName: pick(formData, 'firstName'),
    lastName: pick(formData, 'lastName'),
    email: pick(formData, 'email'),
    phone: pick(formData, 'phone'),
    jobTitle: pick(formData, 'jobTitle'),
    hourlyRateDollars: pick(formData, 'hourlyRateDollars'),
    commissionRatePct: pick(formData, 'commissionRatePct'),
    active: formData.get('active') === '1',
    workingHours,
    serviceIds: includeServiceIds
      ? formData.getAll('serviceIds').filter(
          (v): v is string => typeof v === 'string',
        )
      : undefined,
  };
}

// Convert form-string values to the typed StaffWriteBody. Returns either
// a parsed body or a fieldErrors map.
function parseBody(values: StaffFormValues): {
  body?: StaffWriteBody;
  fieldErrors?: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};

  if (!values.firstName) fieldErrors.firstName = 'First name is required.';

  let hourlyRateCents: number | undefined;
  if (values.hourlyRateDollars !== undefined) {
    const n = Number(values.hourlyRateDollars);
    if (!Number.isFinite(n) || n < 0) {
      fieldErrors.hourlyRateDollars = 'Enter a non-negative dollar amount.';
    } else {
      hourlyRateCents = Math.round(n * 100);
    }
  }

  let commissionRatePct: number | undefined;
  if (values.commissionRatePct !== undefined) {
    const n = Number(values.commissionRatePct);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      fieldErrors.commissionRatePct = 'Enter a percentage between 0 and 100.';
    } else {
      commissionRatePct = n;
    }
  }

  // Working hours: only emit days that aren't closed and have both start
  // and end. The API allows closed days to be absent rather than empty
  // arrays (per the strict() schema). Returns {} when values is undefined
  // (Overview form hides the fieldset and omits the includeWorkingHours
  // marker) — combined with the `workingHours: undefined` emit below,
  // that leaves shifts untouched on partial PATCHes.
  const workingHours = parseWorkingHoursFromValues(values.workingHours, fieldErrors);

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  return {
    body: {
      firstName: values.firstName!,
      lastName: values.lastName,
      email: values.email,
      phone: values.phone,
      jobTitle: values.jobTitle,
      workingHours: Object.keys(workingHours).length > 0 ? workingHours : undefined,
      hourlyRateCents,
      commissionRatePct,
      active: values.active,
      // Pass-through: undefined → leave staff_services untouched; [] →
      // clear all; [...] → replace. Default-to-[] would wipe assignments
      // any time the Overview form (which hides the services fieldset)
      // is saved.
      serviceIds: values.serviceIds,
    },
  };
}

function apiErrorToState(
  err: ApiError,
  values: StaffFormValues,
): ActionState {
  if (
    err.status === 400 &&
    err.body &&
    typeof err.body === 'object' &&
    'issues' in err.body
  ) {
    const issues = (err.body as { issues: Array<{ path: string; message: string }> })
      .issues;
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) {
      // API field hourlyRateCents -> form field hourlyRateDollars.
      // Working hours errors look like "workingHours.mon.0.end" or
      // "workingHours.mon" — collapse to per-day form key.
      let formPath = issue.path;
      if (issue.path === 'hourlyRateCents') formPath = 'hourlyRateDollars';
      else if (issue.path.startsWith('workingHours.')) {
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
  if (err.status === 403) {
    return {
      ok: false,
      error: 'You do not have admin access to this tenant.',
      values,
    };
  }
  if (err.status === 404) {
    return { ok: false, error: 'Staff not found.', values };
  }
  return { ok: false, error: err.message, values };
}

export async function createStaffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = valuesFromForm(formData);
  const parsed = parseBody(values);
  if (parsed.fieldErrors) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  let result;
  try {
    result = await createStaff(parsed.body!);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err, values);
    throw err;
  }

  revalidatePath('/admin/staff');
  redirect(`/admin/staff/${result.staff.id}`);
}

export async function updateStaffAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = valuesFromForm(formData);
  const parsed = parseBody(values);
  if (parsed.fieldErrors) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  try {
    await updateStaff(id, parsed.body!);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err, values);
    throw err;
  }

  revalidatePath('/admin/staff');
  revalidatePath(`/admin/staff/${id}`);
  return { ok: true, values };
}

export async function deleteStaffAction(id: string): Promise<void> {
  try {
    await deleteStaff(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Already gone — treat as success.
    } else {
      throw err;
    }
  }
  revalidatePath('/admin/staff');
  redirect('/admin/staff');
}
