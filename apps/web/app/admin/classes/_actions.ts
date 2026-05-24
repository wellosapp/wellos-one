'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import {
  createClass,
  deleteClass,
  updateClass,
  type ClassWriteBody,
} from '@/lib/api/classes';
import { ApiError } from '@/lib/api/client';

// Server actions for admin Class CRUD. Mirrors services/_actions.ts.
// Phase 1 of the Classes epic — TEMPLATE only.

export type ClassFormValues = {
  name?: string;
  shortDescription?: string;
  longDescription?: string;
  // Stored as strings in form state so re-display preserves the user's
  // typed value even when it doesn't parse to a number.
  durationMinutes?: string;
  basePriceDollars?: string;
  maxCapacity?: string;
  minToRun?: string;
  allowWaitlist?: boolean;
  waitlistLimit?: string;
  color?: string;
  bufferBeforeMinutes?: string;
  bufferAfterMinutes?: string;
  active?: boolean;
  categoryId?: string;
  instructorIds?: string[];
};

export type ActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: ClassFormValues;
};

function pick(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function categoryIdFromForm(
  formData: FormData,
  mode: 'create' | 'update',
): string | null | undefined {
  const raw = formData.get('categoryId');
  if (raw === null || typeof raw !== 'string') return undefined;
  const t = raw.trim();
  if (t === '') return mode === 'update' ? null : undefined;
  return t;
}

function valuesFromForm(formData: FormData): ClassFormValues {
  return {
    name: pick(formData, 'name'),
    shortDescription: pick(formData, 'shortDescription'),
    longDescription: pick(formData, 'longDescription'),
    durationMinutes: pick(formData, 'durationMinutes'),
    basePriceDollars: pick(formData, 'basePriceDollars'),
    maxCapacity: pick(formData, 'maxCapacity'),
    minToRun: pick(formData, 'minToRun'),
    allowWaitlist: formData.get('allowWaitlist') === '1',
    waitlistLimit: pick(formData, 'waitlistLimit'),
    color: pick(formData, 'color'),
    bufferBeforeMinutes: pick(formData, 'bufferBeforeMinutes'),
    bufferAfterMinutes: pick(formData, 'bufferAfterMinutes'),
    active: formData.get('active') === '1',
    categoryId:
      typeof formData.get('categoryId') === 'string'
        ? (formData.get('categoryId') as string).trim()
        : undefined,
    instructorIds: formData
      .getAll('instructorIds')
      .filter((v): v is string => typeof v === 'string'),
  };
}

// Convert form-string values to the typed ClassWriteBody the API expects.
function parseBody(
  values: ClassFormValues,
  mode: 'create' | 'update',
  formData: FormData,
): {
  body?: ClassWriteBody;
  fieldErrors?: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};

  if (!values.name) fieldErrors.name = 'Name is required.';

  let durationMinutes: number | undefined;
  if (!values.durationMinutes) {
    fieldErrors.durationMinutes = 'Duration is required.';
  } else {
    const n = Number(values.durationMinutes);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 5 || n > 720) {
      fieldErrors.durationMinutes = 'Enter a whole number of minutes (5–720).';
    } else {
      durationMinutes = n;
    }
  }

  let basePriceCents: number | undefined;
  if (values.basePriceDollars === undefined) {
    // Treat blank as 0 (free class is a valid case).
    basePriceCents = 0;
  } else {
    const n = Number(values.basePriceDollars);
    if (!Number.isFinite(n) || n < 0) {
      fieldErrors.basePriceDollars = 'Enter a non-negative dollar amount.';
    } else {
      basePriceCents = Math.round(n * 100);
    }
  }

  let maxCapacity: number | undefined;
  if (!values.maxCapacity) {
    fieldErrors.maxCapacity = 'Max capacity is required.';
  } else {
    const n = Number(values.maxCapacity);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 500) {
      fieldErrors.maxCapacity = 'Enter a whole number 1–500.';
    } else {
      maxCapacity = n;
    }
  }

  let minToRun: number | undefined;
  if (values.minToRun !== undefined && values.minToRun !== '') {
    const n = Number(values.minToRun);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 500) {
      fieldErrors.minToRun = 'Enter a whole number 1–500.';
    } else {
      minToRun = n;
    }
  }

  if (
    maxCapacity !== undefined &&
    minToRun !== undefined &&
    minToRun > maxCapacity
  ) {
    fieldErrors.minToRun = 'Cannot exceed max capacity.';
  }

  let waitlistLimit: number | undefined;
  if (values.waitlistLimit !== undefined && values.waitlistLimit !== '') {
    const n = Number(values.waitlistLimit);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 500) {
      fieldErrors.waitlistLimit = 'Enter a whole number 0–500.';
    } else {
      waitlistLimit = n;
    }
  }

  let bufferBeforeMinutes: number | undefined;
  if (
    values.bufferBeforeMinutes !== undefined &&
    values.bufferBeforeMinutes !== ''
  ) {
    const n = Number(values.bufferBeforeMinutes);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 240) {
      fieldErrors.bufferBeforeMinutes = 'Enter 0–240 minutes.';
    } else {
      bufferBeforeMinutes = n;
    }
  }

  let bufferAfterMinutes: number | undefined;
  if (
    values.bufferAfterMinutes !== undefined &&
    values.bufferAfterMinutes !== ''
  ) {
    const n = Number(values.bufferAfterMinutes);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 240) {
      fieldErrors.bufferAfterMinutes = 'Enter 0–240 minutes.';
    } else {
      bufferAfterMinutes = n;
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const categoryId = categoryIdFromForm(formData, mode);

  const body: ClassWriteBody = {
    name: values.name!,
    shortDescription: values.shortDescription ?? null,
    longDescription: values.longDescription ?? null,
    durationMinutes: durationMinutes!,
    basePriceCents: basePriceCents!,
    maxCapacity: maxCapacity!,
    minToRun,
    allowWaitlist: values.allowWaitlist,
    waitlistLimit,
    color: values.color,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    active: values.active,
    categoryId,
    instructorIds: values.instructorIds ?? [],
  };

  return { body };
}

function apiErrorToState(
  err: ApiError,
  values: ClassFormValues,
): ActionState {
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
      const formPath =
        issue.path === 'basePriceCents' ? 'basePriceDollars' : issue.path;
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
    return { ok: false, error: 'Class not found.', values };
  }
  return { ok: false, error: err.message, values };
}

export async function createClassAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = valuesFromForm(formData);
  const parsed = parseBody(values, 'create', formData);
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
    result = await createClass(parsed.body!);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err, values);
    throw err;
  }

  revalidatePath('/admin/classes');
  redirect(`/admin/classes/${result.class.id}`);
}

export async function updateClassAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = valuesFromForm(formData);
  const parsed = parseBody(values, 'update', formData);
  if (parsed.fieldErrors) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  try {
    await updateClass(id, parsed.body!);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err, values);
    throw err;
  }

  revalidatePath('/admin/classes');
  revalidatePath(`/admin/classes/${id}`);
  return { ok: true, values };
}

export async function deleteClassAction(id: string): Promise<void> {
  try {
    await deleteClass(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Already gone — treat as success.
    } else {
      throw err;
    }
  }
  revalidatePath('/admin/classes');
  redirect('/admin/classes');
}
