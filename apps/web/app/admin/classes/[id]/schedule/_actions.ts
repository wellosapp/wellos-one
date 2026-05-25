'use server';

import { revalidatePath } from 'next/cache';

import {
  cancelClassInstance,
  createClassInstance,
  type CreateClassInstanceBody,
} from '@/lib/api/class-instances';
import { ApiError } from '@/lib/api/client';
import {
  createRecurrenceRule,
  generateInstancesForRule,
  updateRecurrenceRule,
  type ByDay,
  type CreateRecurrenceRuleBody,
  type GenerateInstancesResponse,
  type UpdateRecurrenceRuleBody,
} from '@/lib/api/recurrence-rules';

// Server actions for the per-class schedule page. Phase 2a only ships
// manual creation and cancellation; update (reschedule) lives in the
// calendar drawer's edit affordance, not here.

export type ScheduleFormValues = {
  date?: string;
  time?: string;
  staffId?: string;
  locationId?: string;
  capacityOverride?: string;
  waitlistOverride?: string;
};

export type CreateInstanceActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: ScheduleFormValues;
};

function pick(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function valuesFromForm(formData: FormData): ScheduleFormValues {
  return {
    date: pick(formData, 'date'),
    time: pick(formData, 'time'),
    staffId: pick(formData, 'staffId'),
    locationId: pick(formData, 'locationId'),
    capacityOverride: pick(formData, 'capacityOverride'),
    waitlistOverride: pick(formData, 'waitlistOverride'),
  };
}

// Combine a "YYYY-MM-DD" + "HH:MM" pair (browser-local) into a UTC ISO string.
// Browser-local matches the operator's working zone — single-location tenants
// share that zone with their location.timezone. Multi-tz schedules ship later.
function combineLocalDateTimeToUtcIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  if (
    y === undefined ||
    mo === undefined ||
    d === undefined ||
    h === undefined ||
    mi === undefined
  ) {
    return null;
  }
  const local = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

function parseBody(
  classId: string,
  values: ScheduleFormValues,
): {
  body?: CreateClassInstanceBody;
  fieldErrors?: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};

  if (!values.date) fieldErrors.date = 'Date is required.';
  if (!values.time) fieldErrors.time = 'Time is required.';
  if (!values.staffId) fieldErrors.staffId = 'Instructor is required.';
  if (!values.locationId) fieldErrors.locationId = 'Location is required.';

  let scheduledStartAt: string | undefined;
  if (values.date && values.time) {
    const iso = combineLocalDateTimeToUtcIso(values.date, values.time);
    if (!iso) {
      fieldErrors.date = 'Invalid date or time.';
    } else {
      scheduledStartAt = iso;
    }
  }

  let capacityOverride: number | null | undefined;
  if (values.capacityOverride !== undefined && values.capacityOverride !== '') {
    const n = Number(values.capacityOverride);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 500) {
      fieldErrors.capacityOverride = 'Enter a whole number 1–500.';
    } else {
      capacityOverride = n;
    }
  }

  let waitlistOverride: number | null | undefined;
  if (values.waitlistOverride !== undefined && values.waitlistOverride !== '') {
    const n = Number(values.waitlistOverride);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 500) {
      fieldErrors.waitlistOverride = 'Enter a whole number 0–500.';
    } else {
      waitlistOverride = n;
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const body: CreateClassInstanceBody = {
    classId,
    staffId: values.staffId!,
    locationId: values.locationId!,
    scheduledStartAt: scheduledStartAt!,
    capacityOverride,
    waitlistOverride,
  };
  return { body };
}

function apiErrorToState(
  err: ApiError,
  values: ScheduleFormValues,
): CreateInstanceActionState {
  if (
    err.status === 400 &&
    err.body &&
    typeof err.body === 'object' &&
    'issues' in err.body
  ) {
    const issues = (
      err.body as { issues: Array<{ path: string; message: string }> }
    ).issues;
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) {
      if (issue.path) fieldErrors[issue.path] = issue.message;
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
  return { ok: false, error: err.message, values };
}

export async function createInstanceAction(
  classId: string,
  _prev: CreateInstanceActionState,
  formData: FormData,
): Promise<CreateInstanceActionState> {
  const values = valuesFromForm(formData);
  const parsed = parseBody(classId, values);
  if (parsed.fieldErrors) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  try {
    await createClassInstance(parsed.body!);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err, values);
    throw err;
  }

  revalidatePath(`/admin/classes/${classId}/schedule`);
  revalidatePath('/admin/calendar');
  // Return ok with cleared values so the form resets after a successful add.
  return { ok: true, values: {} };
}

export async function cancelInstanceAction(
  classId: string,
  instanceId: string,
  formData: FormData,
): Promise<void> {
  const raw = formData.get('reason');
  const reason =
    typeof raw === 'string' && raw.trim().length > 0
      ? raw.trim().slice(0, 500)
      : undefined;

  try {
    await cancelClassInstance(instanceId, { reason });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      // Already cancelled — treat as success so the UI reflects the state.
    } else if (err instanceof ApiError && err.status === 404) {
      // Already gone — same.
    } else {
      throw err;
    }
  }
  revalidatePath(`/admin/classes/${classId}/schedule`);
  revalidatePath('/admin/calendar');
}

// ---------- Recurrence rules (Phase 2b) ----------
//
// Server actions for the RecurrenceRulesList + RecurrenceRuleEditor.
// State shape mirrors CreateInstanceActionState so the form components
// share the same useFormState contract.

export type RecurrenceRuleFormValues = {
  staffId?: string;
  locationId?: string;
  startDate?: string;
  endDate?: string;
  byday?: ByDay[];
  startTime?: string;
  durationMinutes?: string;
  timezone?: string;
};

export type RecurrenceRuleActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: RecurrenceRuleFormValues;
};

const ALL_BYDAYS: readonly ByDay[] = [
  'SU',
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
];

function pickBydayArray(formData: FormData): ByDay[] {
  // The chip group uses checkbox inputs with name="byday" and value=SU..SA.
  // FormData.getAll returns every selected value.
  const raw = formData.getAll('byday');
  const out: ByDay[] = [];
  for (const v of raw) {
    if (typeof v === 'string' && (ALL_BYDAYS as readonly string[]).includes(v)) {
      out.push(v as ByDay);
    }
  }
  return out;
}

function ruleValuesFromForm(formData: FormData): RecurrenceRuleFormValues {
  return {
    staffId: pick(formData, 'staffId'),
    locationId: pick(formData, 'locationId'),
    startDate: pick(formData, 'startDate'),
    endDate: pick(formData, 'endDate'),
    byday: pickBydayArray(formData),
    startTime: pick(formData, 'startTime'),
    durationMinutes: pick(formData, 'durationMinutes'),
    timezone: pick(formData, 'timezone'),
  };
}

type ParsedRulePayload = {
  staffId: string;
  locationId: string;
  startDate: string;
  endDate: string | null;
  byday: ByDay[];
  startTime: string;
  durationMinutes: number;
  timezone: string;
};

function parseRulePayload(values: RecurrenceRuleFormValues): {
  data?: ParsedRulePayload;
  fieldErrors?: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};

  if (!values.staffId) fieldErrors.staffId = 'Instructor is required.';
  if (!values.locationId) fieldErrors.locationId = 'Location is required.';
  if (!values.startDate) fieldErrors.startDate = 'Start date is required.';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(values.startDate)) {
    fieldErrors.startDate = 'Invalid date.';
  }
  if (values.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(values.endDate)) {
    fieldErrors.endDate = 'Invalid date.';
  }
  if (
    values.startDate &&
    values.endDate &&
    !fieldErrors.startDate &&
    !fieldErrors.endDate &&
    values.endDate < values.startDate
  ) {
    fieldErrors.endDate = 'End date must be on or after the start date.';
  }
  if (!values.startTime) fieldErrors.startTime = 'Start time is required.';
  else if (!/^\d{2}:\d{2}$/.test(values.startTime)) {
    fieldErrors.startTime = 'Invalid time.';
  }
  if (!values.timezone) fieldErrors.timezone = 'Timezone is required.';

  let durationMinutes: number | undefined;
  if (!values.durationMinutes) {
    fieldErrors.durationMinutes = 'Duration is required.';
  } else {
    const n = Number(values.durationMinutes);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 5 || n > 720) {
      fieldErrors.durationMinutes = 'Enter a whole number 5–720 minutes.';
    } else {
      durationMinutes = n;
    }
  }

  const byday = values.byday ?? [];
  if (byday.length === 0) {
    fieldErrors.byday = 'Pick at least one day of the week.';
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  return {
    data: {
      staffId: values.staffId!,
      locationId: values.locationId!,
      startDate: values.startDate!,
      endDate: values.endDate ?? null,
      byday,
      startTime: values.startTime!,
      durationMinutes: durationMinutes!,
      timezone: values.timezone!,
    },
  };
}

function ruleApiErrorToState(
  err: ApiError,
  values: RecurrenceRuleFormValues,
): RecurrenceRuleActionState {
  if (
    err.status === 400 &&
    err.body &&
    typeof err.body === 'object' &&
    'issues' in err.body
  ) {
    const issues = (
      err.body as { issues: Array<{ path: string; message: string }> }
    ).issues;
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) {
      if (issue.path) fieldErrors[issue.path] = issue.message;
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
  return { ok: false, error: err.message, values };
}

export async function createRecurrenceRuleAction(
  classId: string,
  _prev: RecurrenceRuleActionState,
  formData: FormData,
): Promise<RecurrenceRuleActionState> {
  const values = ruleValuesFromForm(formData);
  const parsed = parseRulePayload(values);
  if (parsed.fieldErrors) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  const body: CreateRecurrenceRuleBody = {
    classId,
    staffId: parsed.data!.staffId,
    locationId: parsed.data!.locationId,
    startDate: parsed.data!.startDate,
    endDate: parsed.data!.endDate,
    byday: parsed.data!.byday,
    startTime: parsed.data!.startTime,
    durationMinutes: parsed.data!.durationMinutes,
    timezone: parsed.data!.timezone,
  };

  try {
    await createRecurrenceRule(body);
  } catch (err) {
    if (err instanceof ApiError) return ruleApiErrorToState(err, values);
    throw err;
  }

  revalidatePath(`/admin/classes/${classId}/schedule`);
  return { ok: true, values: {} };
}

export async function updateRecurrenceRuleAction(
  classId: string,
  ruleId: string,
  _prev: RecurrenceRuleActionState,
  formData: FormData,
): Promise<RecurrenceRuleActionState> {
  const values = ruleValuesFromForm(formData);
  const parsed = parseRulePayload(values);
  if (parsed.fieldErrors) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  const body: UpdateRecurrenceRuleBody = {
    staffId: parsed.data!.staffId,
    locationId: parsed.data!.locationId,
    startDate: parsed.data!.startDate,
    endDate: parsed.data!.endDate,
    byday: parsed.data!.byday,
    startTime: parsed.data!.startTime,
    durationMinutes: parsed.data!.durationMinutes,
    timezone: parsed.data!.timezone,
  };

  try {
    await updateRecurrenceRule(ruleId, body);
  } catch (err) {
    if (err instanceof ApiError) return ruleApiErrorToState(err, values);
    throw err;
  }

  revalidatePath(`/admin/classes/${classId}/schedule`);
  return { ok: true, values };
}

// Toggle active/paused. Same endpoint as full update; we only PATCH the
// `active` field. Wraps in try/catch because the row may have been deleted
// between list render and click.
export async function toggleRuleActiveAction(
  classId: string,
  ruleId: string,
  nextActive: boolean,
): Promise<void> {
  try {
    await updateRecurrenceRule(ruleId, { active: nextActive });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Already gone — fall through to revalidate so the UI catches up.
    } else {
      throw err;
    }
  }
  revalidatePath(`/admin/classes/${classId}/schedule`);
}

// Manual generation trigger. Returns the API result so the caller can show
// "Created X, skipped Y" feedback. Revalidates the page so the new
// instances appear in InstancesTable below.
export async function generateInstancesAction(
  classId: string,
  ruleId: string,
  horizonWeeks: number = 12,
): Promise<GenerateInstancesResponse> {
  const result = await generateInstancesForRule(ruleId, { horizonWeeks });
  revalidatePath(`/admin/classes/${classId}/schedule`);
  revalidatePath('/admin/calendar');
  return result;
}
