'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  type UpdateStaffBookingPreferencesBody,
  updateStaffBookingPreferences,
} from '@/lib/api/booking-settings';

// Per-staff booking override fields (R2 §12). Null = clear override (falls
// through to tenant default). Empty form input string → null.

export type StaffBookingPrefsFormValues = {
  bookingBufferMinutesOverride?: string;
  bookingMinNoticeHoursOverride?: string;
  bookingCalendarSyncOptedIn?: boolean;
};

export type ActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: StaffBookingPrefsFormValues;
};

function pick(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== 'string') return undefined;
  return v.trim();
}

function valuesFromForm(formData: FormData): StaffBookingPrefsFormValues {
  return {
    // pick may return '' — we keep that distinct from undefined because '' means
    // "user cleared the field, send null to clear the override".
    bookingBufferMinutesOverride: pick(formData, 'bookingBufferMinutesOverride'),
    bookingMinNoticeHoursOverride: pick(formData, 'bookingMinNoticeHoursOverride'),
    bookingCalendarSyncOptedIn: formData.get('bookingCalendarSyncOptedIn') === '1',
  };
}

function parseNullableInt(
  raw: string | undefined,
  field: keyof StaffBookingPrefsFormValues,
  fieldErrors: Record<string, string>,
  max: number,
): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    fieldErrors[field as string] = 'Enter a non-negative whole number, or leave blank.';
    return undefined;
  }
  if (n > max) {
    fieldErrors[field as string] = `Must be ${max} or less.`;
    return undefined;
  }
  return n;
}

function parseBody(values: StaffBookingPrefsFormValues): {
  body?: UpdateStaffBookingPreferencesBody;
  fieldErrors?: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};

  const buffer = parseNullableInt(
    values.bookingBufferMinutesOverride,
    'bookingBufferMinutesOverride',
    fieldErrors,
    24 * 60,
  );
  const minNotice = parseNullableInt(
    values.bookingMinNoticeHoursOverride,
    'bookingMinNoticeHoursOverride',
    fieldErrors,
    24 * 365,
  );

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  // Only emit keys the user touched. The form always submits all three
  // because of how HTML forms work, so we always send the body fully shaped.
  return {
    body: {
      bookingBufferMinutesOverride: buffer,
      bookingMinNoticeHoursOverride: minNotice,
      bookingCalendarSyncOptedIn: values.bookingCalendarSyncOptedIn,
    },
  };
}

export async function updateStaffBookingPrefsAction(
  staffId: string,
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
    await updateStaffBookingPreferences(staffId, parsed.body!);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 403) {
        return {
          ok: false,
          error: 'You do not have access to edit this staff member.',
          values,
        };
      }
      if (err.status === 404) {
        return { ok: false, error: 'Staff not found.', values };
      }
      return { ok: false, error: err.message, values };
    }
    throw err;
  }

  revalidatePath(`/admin/staff/${staffId}`);
  return { ok: true, values };
}
