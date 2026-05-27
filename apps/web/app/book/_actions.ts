'use server';

import {
  PublicApiError,
  createPublicAppointmentRequest,
  fetchPublicAvailability,
  fetchPublicBookingCatalog,
  submitPublicClassBooking,
  type PublicBookingCatalogResponse,
  type AvailableSlotWire,
  type CreatePublicAppointmentResult,
  type CreatePublicClassBookingResult,
} from '@/lib/api/public-booking-server';
import {
  PublicWaitlistApiError,
  createPublicWaitlistEntry,
  type CreatePublicWaitlistBody,
  type CreatePublicWaitlistResult,
} from '@/lib/api/waitlist';

export async function loadPublicBookingCatalogAction(
  tenantSlug: string,
): Promise<
  | { ok: true; catalog: PublicBookingCatalogResponse }
  | { ok: false; message: string }
> {
  const slug = tenantSlug.trim();
  if (!slug) {
    return { ok: false, message: 'Missing tenant.' };
  }
  try {
    const catalog = await fetchPublicBookingCatalog(slug);
    return { ok: true, catalog };
  } catch (err) {
    if (err instanceof PublicApiError) {
      return {
        ok: false,
        message:
          err.status === 404
            ? 'This booking link is invalid.'
            : 'Could not load services. Try again.',
      };
    }
    throw err;
  }
}

export async function loadPublicAvailabilityAction(params: {
  tenantSlug: string;
  staffId: string;
  serviceId: string;
  locationId: string;
  date: string;
  tz?: string;
}): Promise<
  | { ok: true; slots: AvailableSlotWire[] }
  | { ok: false; message: string }
> {
  try {
    const { slots } = await fetchPublicAvailability(params);
    return { ok: true, slots };
  } catch (err) {
    if (err instanceof PublicApiError) {
      return {
        ok: false,
        message:
          err.status === 404
            ? 'Availability unavailable for this business.'
            : 'Could not load times. Try another date.',
      };
    }
    throw err;
  }
}

/** PR 8 — when the public booking is blocked because of unsatisfied forms,
 *  the API returns 422 + code='FORMS_REQUIRED' + the per-form list. The UI
 *  renders this as an amber "Required forms" alert instead of the generic
 *  red error message. */
export type PublicBookingRequiredForm = {
  formDefinitionGroupId: string;
  formTitle: string;
  formType: string;
};

export async function submitPublicBookingAction(args: {
  tenantSlug: string;
  guest: {
    firstName: string;
    lastName?: string;
    email: string;
    phone?: string;
  };
  locationId: string;
  staffId: string;
  serviceId: string;
  scheduledStartAt: string;
  notes?: string;
  idempotencyKey: string;
}): Promise<
  | { ok: true; result: CreatePublicAppointmentResult }
  | {
      ok: false;
      message: string;
      issues?: Array<{ path: string; message: string }>;
      /** Set when the API returned 422 + code='FORMS_REQUIRED'. */
      requiredForms?: PublicBookingRequiredForm[];
    }
> {
  try {
    const result = await createPublicAppointmentRequest(args);
    return { ok: true, result };
  } catch (err) {
    if (err instanceof PublicApiError) {
      const body = err.body as {
        message?: string;
        code?: string;
        issues?: Array<{ path: string; message: string }>;
        requiredForms?: PublicBookingRequiredForm[];
      } | null;

      // PR 8 — forms-required gate. 422 + code='FORMS_REQUIRED' surfaces the
      // amber alert card listing each unsatisfied form. No appointment row
      // was created — the API ran the check before the transaction.
      if (
        err.status === 422 &&
        body?.code === 'FORMS_REQUIRED' &&
        Array.isArray(body.requiredForms)
      ) {
        return {
          ok: false,
          message:
            typeof body.message === 'string'
              ? body.message
              : 'Required forms must be completed before booking.',
          requiredForms: body.requiredForms,
        };
      }

      const message =
        typeof body?.message === 'string'
          ? body.message
          : err.status === 409
            ? 'That time was just taken. Pick another slot.'
            : 'Booking failed. Try again.';
      return {
        ok: false,
        message,
        issues: body?.issues,
      };
    }
    throw err;
  }
}

export async function submitPublicClassBookingAction(args: {
  tenantSlug: string;
  classInstanceId: string;
  idempotencyKey: string;
  guest: {
    firstName: string;
    lastName?: string;
    email: string;
    phone?: string;
  };
}): Promise<
  | { ok: true; result: CreatePublicClassBookingResult }
  | {
      ok: false;
      message: string;
      code?: string;
      issues?: Array<{ path: string; message: string }>;
    }
> {
  try {
    const result = await submitPublicClassBooking(args);
    return { ok: true, result };
  } catch (err) {
    if (err instanceof PublicApiError) {
      const body = err.body as {
        message?: string;
        code?: string;
        issues?: Array<{ path: string; message: string }>;
      } | null;
      const message =
        typeof body?.message === 'string'
          ? body.message
          : err.status === 409
            ? 'That spot was just taken. Try another class.'
            : 'Booking failed. Try again.';
      return {
        ok: false,
        message,
        code: typeof body?.code === 'string' ? body.code : undefined,
        issues: body?.issues,
      };
    }
    throw err;
  }
}

export async function submitPublicWaitlistAction(
  body: CreatePublicWaitlistBody,
): Promise<
  | { ok: true; result: CreatePublicWaitlistResult }
  | {
      ok: false;
      message: string;
      issues?: Array<{ path: string; message: string }>;
    }
> {
  try {
    const result = await createPublicWaitlistEntry(body);
    return { ok: true, result };
  } catch (err) {
    if (err instanceof PublicWaitlistApiError) {
      const errBody = err.body as {
        message?: string;
        issues?: Array<{ path: string; message: string }>;
      } | null;
      return {
        ok: false,
        message:
          typeof errBody?.message === 'string'
            ? errBody.message
            : 'Could not join the waitlist. Try again.',
        issues: errBody?.issues,
      };
    }
    throw err;
  }
}
