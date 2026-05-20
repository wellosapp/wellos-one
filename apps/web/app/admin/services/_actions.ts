'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import {
  createService,
  deleteService,
  updateService,
  type ServicePriceDisplayMode,
  type ServiceWriteBody,
} from '@/lib/api/services';
import { ApiError } from '@/lib/api/client';

// Server actions for admin Service CRUD. Mirrors clients/_actions.ts.
// No duplicate-warning surface (services don't have email/phone).

export type ServiceFormValues = {
  name?: string;
  description?: string;
  descriptionShort?: string;
  // Stored as strings in form state so re-display preserves the user's
  // typed value even when it doesn't parse to a number (e.g. "15.0a").
  durationMinutes?: string;
  basePriceDollars?: string;
  color?: string;
  active?: boolean;
  publicVisible?: boolean;
  categoryId?: string;
  displayOrder?: string;
  bufferBeforeMinutes?: string;
  bufferAfterMinutes?: string;
  priceDisplayMode?: ServicePriceDisplayMode;
  // Staff IDs assigned to perform this service (StaffService M2M, inverse
  // of Staff.serviceIds).
  staffIds?: string[];
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

function valuesFromForm(formData: FormData): ServiceFormValues {
  const priceRaw = formData.get('priceDisplayMode');
  const priceDisplayMode =
    typeof priceRaw === 'string' &&
    priceRaw !== '' &&
    [
      'fixed',
      'starting_at',
      'range',
      'hidden',
      'consultation',
    ].includes(priceRaw)
      ? (priceRaw as ServicePriceDisplayMode)
      : undefined;

  return {
    name: pick(formData, 'name'),
    description: pick(formData, 'description'),
    descriptionShort: pick(formData, 'descriptionShort'),
    durationMinutes: pick(formData, 'durationMinutes'),
    basePriceDollars: pick(formData, 'basePriceDollars'),
    color: pick(formData, 'color'),
    active: formData.get('active') === '1',
    publicVisible: formData.get('publicVisible') === '1',
    categoryId:
      typeof formData.get('categoryId') === 'string'
        ? (formData.get('categoryId') as string).trim()
        : undefined,
    displayOrder: pick(formData, 'displayOrder'),
    bufferBeforeMinutes: pick(formData, 'bufferBeforeMinutes'),
    bufferAfterMinutes: pick(formData, 'bufferAfterMinutes'),
    priceDisplayMode,
    staffIds: formData.getAll('staffIds').filter(
      (v): v is string => typeof v === 'string',
    ),
  };
}

// Convert form-string values to the typed ServiceWriteBody the API expects.
function parseBody(
  values: ServiceFormValues,
  mode: 'create' | 'update',
  formData: FormData,
): {
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
      basePriceCents = Math.round(n * 100);
    }
  }

  let displayOrder: number | undefined;
  if (values.displayOrder !== undefined && values.displayOrder !== '') {
    const n = Number(values.displayOrder);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      fieldErrors.displayOrder = 'Enter a non-negative whole number.';
    } else {
      displayOrder = n;
    }
  }

  let bufferBeforeMinutes: number | undefined;
  if (values.bufferBeforeMinutes !== undefined && values.bufferBeforeMinutes !== '') {
    const n = Number(values.bufferBeforeMinutes);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 1440) {
      fieldErrors.bufferBeforeMinutes = 'Enter 0–1440 minutes.';
    } else {
      bufferBeforeMinutes = n;
    }
  }

  let bufferAfterMinutes: number | undefined;
  if (values.bufferAfterMinutes !== undefined && values.bufferAfterMinutes !== '') {
    const n = Number(values.bufferAfterMinutes);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 1440) {
      fieldErrors.bufferAfterMinutes = 'Enter 0–1440 minutes.';
    } else {
      bufferAfterMinutes = n;
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const categoryId = categoryIdFromForm(formData, mode);

  const body: ServiceWriteBody = {
    name: values.name!,
    description: values.description,
    descriptionShort: values.descriptionShort,
    durationMinutes: durationMinutes!,
    basePriceCents: basePriceCents!,
    color: values.color,
    active: values.active,
    publicVisible: values.publicVisible,
    categoryId,
    displayOrder,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    priceDisplayMode: values.priceDisplayMode,
    staffIds: values.staffIds ?? [],
  };

  return { body };
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
    return { ok: false, error: 'Service not found.', values };
  }
  return { ok: false, error: err.message, values };
}

export async function createServiceAction(
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
