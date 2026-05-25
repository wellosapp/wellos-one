'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  deleteLocationGeofence,
  upsertLocationGeofence,
  type UpsertLocationGeofenceBody,
} from '@/lib/api/location-geofence';

// Server actions for the per-location geofence editor (PR 7 of the
// Geofence Auto Check-in epic). Two operations: upsert (PUT) and delete.
// One geofence per Location; the API enforces both the tenant scope and
// the field bounds (Zod). Wire shape mirrors apps/api/src/schemas/
// locationGeofence.ts.

// State shape is in ./_types.ts because `'use server'` files can only export
// async functions — types/constants need to live elsewhere or Next.js's
// invalid-use-server-value guard fails the build.
import type { UpdateGeofenceState } from './_types';

function readString(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseNumber(
  raw: string | undefined,
  field: string,
  fieldErrors: Record<string, string>,
): number | undefined {
  if (raw === undefined) {
    fieldErrors[field] = 'Required.';
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    fieldErrors[field] = 'Enter a valid number.';
    return undefined;
  }
  return n;
}

function parseInteger(
  raw: string | undefined,
  field: string,
  fieldErrors: Record<string, string>,
  min: number,
  max: number,
): number | undefined {
  if (raw === undefined) {
    fieldErrors[field] = 'Required.';
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    fieldErrors[field] = 'Enter a whole number.';
    return undefined;
  }
  if (n < min || n > max) {
    fieldErrors[field] = `Must be between ${min} and ${max}.`;
    return undefined;
  }
  return n;
}

function parseBody(formData: FormData): {
  body?: UpsertLocationGeofenceBody;
  fieldErrors?: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};

  const centerLat = parseNumber(
    readString(formData, 'centerLat'),
    'centerLat',
    fieldErrors,
  );
  const centerLng = parseNumber(
    readString(formData, 'centerLng'),
    'centerLng',
    fieldErrors,
  );

  // Geographic bounds (the API also enforces these via Zod).
  if (centerLat !== undefined && (centerLat < -90 || centerLat > 90)) {
    fieldErrors.centerLat = 'Latitude must be between -90 and 90.';
  }
  if (centerLng !== undefined && (centerLng < -180 || centerLng > 180)) {
    fieldErrors.centerLng = 'Longitude must be between -180 and 180.';
  }

  const radiusMeters = parseInteger(
    readString(formData, 'radiusMeters'),
    'radiusMeters',
    fieldErrors,
    25,
    200,
  );
  const checkInWindowBeforeMinutes = parseInteger(
    readString(formData, 'checkInWindowBeforeMinutes'),
    'checkInWindowBeforeMinutes',
    fieldErrors,
    0,
    60,
  );
  const checkInWindowAfterMinutes = parseInteger(
    readString(formData, 'checkInWindowAfterMinutes'),
    'checkInWindowAfterMinutes',
    fieldErrors,
    0,
    30,
  );
  const enabled = formData.get('enabled') === '1';

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    body: {
      centerLat: centerLat!,
      centerLng: centerLng!,
      radiusMeters: radiusMeters!,
      checkInWindowBeforeMinutes: checkInWindowBeforeMinutes!,
      checkInWindowAfterMinutes: checkInWindowAfterMinutes!,
      enabled,
    },
  };
}

function apiErrorToState(err: ApiError): UpdateGeofenceState {
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
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors,
    };
  }
  if (err.status === 403) {
    return {
      status: 'error',
      message: 'You must be an admin to update the geofence.',
    };
  }
  if (err.status === 404) {
    return { status: 'error', message: 'Location not found.' };
  }
  return { status: 'error', message: err.message };
}

export async function updateGeofenceAction(
  _prev: UpdateGeofenceState,
  formData: FormData,
): Promise<UpdateGeofenceState> {
  const locationId = readString(formData, 'locationId');
  if (!locationId) {
    return { status: 'error', message: 'Missing locationId.' };
  }

  const parsed = parseBody(formData);
  if (parsed.fieldErrors) {
    return {
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: parsed.fieldErrors,
    };
  }

  try {
    await upsertLocationGeofence(locationId, parsed.body!);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }

  revalidatePath('/admin/settings/geofence');
  return { status: 'success', message: 'Geofence saved.' };
}

export async function deleteGeofenceAction(
  _prev: UpdateGeofenceState,
  formData: FormData,
): Promise<UpdateGeofenceState> {
  const locationId = readString(formData, 'locationId');
  if (!locationId) {
    return { status: 'error', message: 'Missing locationId.' };
  }

  try {
    await deleteLocationGeofence(locationId);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }

  revalidatePath('/admin/settings/geofence');
  return { status: 'success', message: 'Geofence removed.' };
}
