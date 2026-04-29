'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import {
  createService,
  deleteService,
  updateService,
  type ServiceWriteBody,
} from '@/lib/api/services';
import { ApiError } from '@/lib/api/client';

// Server actions for admin Service CRUD. Mirrors clients/_actions.ts.
// No duplicate-warning surface (services don't have email/phone).

export type ServiceFormValues = {
  name?: string;
  description?: string;
  // Stored as strings in form state so re-display preserves the user's
  // typed value even when it doesn't parse to a number (e.g. "15.0a").
  durationMinutes?: string;
  basePriceDollars?: string;
  color?: string;
  active?: boolean;
};

export type ActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: ServiceFormValues;
};

function pick(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function valuesFromForm(formData: FormData): ServiceFormValues {
  return {
    name: pick(formData, 'name'),
    description: pick(formData, 'description'),
    durationMinutes: pick(formData, 'durationMinutes'),
    basePriceDollars: pick(formData, 'basePriceDollars'),
    color: pick(formData, 'color'),
    active: formData.get('active') === '1',
  };
}

// Convert form-string values to the typed ServiceWriteBody the API expects.
// Returns either a parsed body or a fieldErrors map.
function parseBody(values: ServiceFormValues): {
  body?: ServiceWriteBody;
  fieldErrors?: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};

  if (!values.name) fieldErrors.name = 'Name is required.';

  let durationMinutes: number | undefined;
  if (!values.durationMinutes) {
    fieldErrors.durationMinutes = 'Duration is required.';
  } else {
    const n = Number(values.durationMinutes);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      fieldErrors.durationMinutes = 'Enter a whole number of minutes.';
    } else {
      durationMinutes = n;
    }
  }

  let basePriceCents: number | undefined;
  if (values.basePriceDollars === undefined) {
    fieldErrors.basePriceDollars = 'Price is required.';
  } else {
    const n = Number(values.basePriceDollars);
    if (!Number.isFinite(n) || n < 0) {
      fieldErrors.basePriceDollars = 'Enter a non-negative dollar amount.';
    } else {
      // Convert dollars to cents. Round to handle floating-point drift on
      // values like 19.99 (which is 1998.9999... in float).
      basePriceCents = Math.round(n * 100);
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  return {
    body: {
      name: values.name!,
      description: values.description,
      durationMinutes: durationMinutes!,
      basePriceCents: basePriceCents!,
      color: values.color,
      active: values.active,
    },
  };
}

function apiErrorToState(
  err: ApiError,
  values: ServiceFormValues,
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
      // API uses basePriceCents but the form labels the field basePriceDollars;
      // remap so the error shows on the right input.
      const formPath = issue.path === 'basePriceCents' ? 'basePriceDollars' : issue.path;
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
    return { ok: false, error: 'Service not found.', values };
  }
  return { ok: false, error: err.message, values };
}

export async function createServiceAction(
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
    result = await createService(parsed.body!);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err, values);
    throw err;
  }

  revalidatePath('/admin/services');
  redirect(`/admin/services/${result.service.id}`);
}

export async function updateServiceAction(
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
    await updateService(id, parsed.body!);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err, values);
    throw err;
  }

  revalidatePath('/admin/services');
  revalidatePath(`/admin/services/${id}`);
  return { ok: true, values };
}

export async function deleteServiceAction(id: string): Promise<void> {
  try {
    await deleteService(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Already gone — treat as success.
    } else {
      throw err;
    }
  }
  revalidatePath('/admin/services');
  redirect('/admin/services');
}
