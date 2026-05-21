'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  type TenantBookingSettings,
  type UpdateTenantBookingSettingsBody,
  updateTenantBookingSettings,
} from '@/lib/api/booking-settings';

// Form-string values mirror the field names rendered in BookingSettingsForm.
// Money is shown in dollars in the UI; converted to cents on submit
// (matches StaffForm hourly-rate pattern).
export type BookingSettingsFormValues = {
  bookingDepositsEnabled?: boolean;
  bookingDepositAmountDollars?: string;
  bookingCancellationWindowHours?: string;
  bookingCancellationFeeDollars?: string;
  bookingNoShowFeeDollars?: string;
  bookingMinNoticeHours?: string;
  bookingMaxWindowDays?: string;
  bookingDefaultBufferMinutes?: string;
  bookingWalkInsAllowed?: boolean;
  bookingTipsEnabled?: boolean;
  bookingClientRecognitionMode?: TenantBookingSettings['bookingClientRecognitionMode'];
  bookingOverrideRoles?: string;
};

export type ActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: BookingSettingsFormValues;
};

function pick(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function checkbox(formData: FormData, key: string): boolean {
  return formData.get(key) === '1';
}

function valuesFromForm(formData: FormData): BookingSettingsFormValues {
  const mode = pick(formData, 'bookingClientRecognitionMode');
  return {
    bookingDepositsEnabled: checkbox(formData, 'bookingDepositsEnabled'),
    bookingDepositAmountDollars: pick(formData, 'bookingDepositAmountDollars'),
    bookingCancellationWindowHours: pick(formData, 'bookingCancellationWindowHours'),
    bookingCancellationFeeDollars: pick(formData, 'bookingCancellationFeeDollars'),
    bookingNoShowFeeDollars: pick(formData, 'bookingNoShowFeeDollars'),
    bookingMinNoticeHours: pick(formData, 'bookingMinNoticeHours'),
    bookingMaxWindowDays: pick(formData, 'bookingMaxWindowDays'),
    bookingDefaultBufferMinutes: pick(formData, 'bookingDefaultBufferMinutes'),
    bookingWalkInsAllowed: checkbox(formData, 'bookingWalkInsAllowed'),
    bookingTipsEnabled: checkbox(formData, 'bookingTipsEnabled'),
    bookingClientRecognitionMode:
      mode === 'email_only' || mode === 'email_phone' || mode === 'email_name'
        ? mode
        : undefined,
    bookingOverrideRoles: pick(formData, 'bookingOverrideRoles'),
  };
}

function parseDollarsToCents(
  raw: string | undefined,
  field: keyof BookingSettingsFormValues,
  fieldErrors: Record<string, string>,
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    fieldErrors[field as string] = 'Enter a non-negative dollar amount.';
    return undefined;
  }
  return Math.round(n * 100);
}

function parseNonNegInt(
  raw: string | undefined,
  field: keyof BookingSettingsFormValues,
  fieldErrors: Record<string, string>,
  max: number,
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    fieldErrors[field as string] = 'Enter a non-negative whole number.';
    return undefined;
  }
  if (n > max) {
    fieldErrors[field as string] = `Must be ${max} or less.`;
    return undefined;
  }
  return n;
}

function parseBody(values: BookingSettingsFormValues): {
  body?: UpdateTenantBookingSettingsBody;
  fieldErrors?: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};

  const depositCents = parseDollarsToCents(
    values.bookingDepositAmountDollars,
    'bookingDepositAmountDollars',
    fieldErrors,
  );
  const cancelFeeCents = parseDollarsToCents(
    values.bookingCancellationFeeDollars,
    'bookingCancellationFeeDollars',
    fieldErrors,
  );
  const noShowFeeCents = parseDollarsToCents(
    values.bookingNoShowFeeDollars,
    'bookingNoShowFeeDollars',
    fieldErrors,
  );

  const cancelWindow = parseNonNegInt(
    values.bookingCancellationWindowHours,
    'bookingCancellationWindowHours',
    fieldErrors,
    24 * 365,
  );
  const minNotice = parseNonNegInt(
    values.bookingMinNoticeHours,
    'bookingMinNoticeHours',
    fieldErrors,
    24 * 365,
  );
  const maxWindow = parseNonNegInt(
    values.bookingMaxWindowDays,
    'bookingMaxWindowDays',
    fieldErrors,
    365 * 2,
  );
  const buffer = parseNonNegInt(
    values.bookingDefaultBufferMinutes,
    'bookingDefaultBufferMinutes',
    fieldErrors,
    24 * 60,
  );

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    body: {
      bookingDepositsEnabled: values.bookingDepositsEnabled,
      bookingDepositAmountCents: depositCents,
      bookingCancellationWindowHours: cancelWindow,
      bookingCancellationFeeCents: cancelFeeCents,
      bookingNoShowFeeCents: noShowFeeCents,
      bookingMinNoticeHours: minNotice,
      bookingMaxWindowDays: maxWindow,
      bookingDefaultBufferMinutes: buffer,
      bookingWalkInsAllowed: values.bookingWalkInsAllowed,
      bookingTipsEnabled: values.bookingTipsEnabled,
      bookingClientRecognitionMode: values.bookingClientRecognitionMode,
      bookingOverrideRoles: values.bookingOverrideRoles,
    },
  };
}

function apiErrorToState(
  err: ApiError,
  values: BookingSettingsFormValues,
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
      // API path → form field. Cents fields surface as their dollar twin.
      let formPath = issue.path;
      if (issue.path === 'bookingDepositAmountCents')
        formPath = 'bookingDepositAmountDollars';
      else if (issue.path === 'bookingCancellationFeeCents')
        formPath = 'bookingCancellationFeeDollars';
      else if (issue.path === 'bookingNoShowFeeCents')
        formPath = 'bookingNoShowFeeDollars';
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
    return { ok: false, error: 'Tenant not found.', values };
  }
  return { ok: false, error: err.message, values };
}

export async function updateBookingSettingsAction(
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
    await updateTenantBookingSettings(parsed.body!);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err, values);
    throw err;
  }

  revalidatePath('/admin/settings');
  return { ok: true, values };
}
