'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  cancelClassBooking,
  createClassBooking,
  promoteClassWaitlistEntry,
  type CreateBookingOrWaitlistResponse,
  type PromoteWaitlistResponse,
} from '@/lib/api/class-bookings';
import { cancelClassInstance } from '@/lib/api/class-instances';
import {
  createClient,
  listClients,
  type Client,
} from '@/lib/api/clients';
import {
  approveAppointment,
  createAppointment,
  declineAppointment,
  logRequiredFormsBookingAcknowledgment,
  transitionAppointment,
  updateAppointment,
  type AppointmentSlotConflictBody,
  type AppointmentState,
} from '@/lib/api/appointments';
import {
  acknowledgeClientNote,
  createClientNote,
  type CreateClientNoteBody,
} from '@/lib/api/client-notes';
import {
  getAvailability,
  type AvailableSlot,
} from '@/lib/api/availability';
import {
  createStaffScheduleBlock,
  deleteStaffScheduleBlock,
  type CreateStaffScheduleBlockBody,
} from '@/lib/api/staff-schedule-blocks';
import { listServices } from '@/lib/api/services';
import { getStaffBookingClientContext } from '@/lib/api/staff-booking';
import {
  staffBookingFormsRequiringBookingAck,
  staffBookingItemsRequiringAcknowledgment,
  type StaffBookingClientContextResponse,
} from '@/lib/staff-booking/client-context-types';

// Server actions for the calendar drawer + Quick Book panel. Called from
// client components via formData. All errors flatten to an ActionState shape
// the client renders inline.
//
// Tenant scoping + role enforcement happens at the Fastify API. These
// actions only carry the user's Clerk session via the apiFetch wrapper.

export type ActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  // For Quick Book conflicts the API returns the conflicting slot details —
  // surface them so the operator knows what to do next.
  conflict?: AppointmentSlotConflictBody['conflict'];
};

const PAGE = '/admin/calendar';

function pick(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function apiErrorToState(err: ApiError): ActionState {
  if (err.status === 400 && err.body && typeof err.body === 'object' && 'issues' in err.body) {
    const issues = (err.body as { issues: Array<{ path: string; message: string }> }).issues;
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) {
      if (issue.path) fieldErrors[issue.path] = issue.message;
    }
    return { ok: false, error: 'Please fix the highlighted fields.', fieldErrors };
  }
  if (err.status === 409 && err.body && typeof err.body === 'object' && 'conflict' in err.body) {
    const body = err.body as AppointmentSlotConflictBody;
    return { ok: false, error: body.message, conflict: body.conflict };
  }
  if (err.status === 403) {
    return {
      ok: false,
      error: 'You do not have permission for this action in this tenant.',
    };
  }
  if (err.status === 404) {
    return { ok: false, error: 'Not found.' };
  }
  return { ok: false, error: err.message };
}

// ---- Status transition (drawer Overview tab buttons) ----

const TRANSITION_STATES: AppointmentState[] = [
  'requested',
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
];

export async function transitionAppointmentAction(
  appointmentId: string,
  to: AppointmentState,
  reason?: string,
): Promise<ActionState> {
  if (!TRANSITION_STATES.includes(to)) {
    return { ok: false, error: `Unknown target state: ${to}` };
  }

  try {
    await transitionAppointment(appointmentId, { to, reason });
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }

  revalidatePath(PAGE);
  return { ok: true };
}

// R2 §11.2 — approve / decline a request_approval booking. Thin wrappers
// over the dedicated /approve and /decline endpoints; UI calls these from
// the appointment drawer's Overview tab when state==='requested'.
export async function approveAppointmentAction(
  appointmentId: string,
): Promise<ActionState> {
  try {
    await approveAppointment(appointmentId);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
  revalidatePath(PAGE);
  return { ok: true };
}

export async function declineAppointmentAction(
  appointmentId: string,
  reason?: string,
): Promise<ActionState> {
  try {
    await declineAppointment(appointmentId, { reason });
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
  revalidatePath(PAGE);
  return { ok: true };
}

// ---- Update notes on an appointment ----

export async function updateAppointmentNotesAction(
  appointmentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const notes = pick(formData, 'notes') ?? '';
  try {
    await updateAppointment(appointmentId, { notes });
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
  revalidatePath(PAGE);
  return { ok: true };
}

/** Drag-to-reschedule from day calendar grid (sets analytics source via header). */
export async function rescheduleAppointmentCalendarDragAction(args: {
  appointmentId: string;
  scheduledStartAt: string;
  staffId: string;
}): Promise<ActionState> {
  try {
    await updateAppointment(
      args.appointmentId,
      {
        scheduledStartAt: args.scheduledStartAt,
        staffId: args.staffId,
      },
      { calendarDrag: true },
    );
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
  revalidatePath(PAGE);
  return { ok: true };
}

// ---- Notes tab: add a ClientNote linked to this appointment ----

export async function addClientNoteAction(
  clientId: string,
  appointmentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const body: CreateClientNoteBody = {
    category: (pick(formData, 'category') ?? 'session') as CreateClientNoteBody['category'],
    priority: (pick(formData, 'priority') as CreateClientNoteBody['priority']) ?? 'normal',
    title: pick(formData, 'title'),
    body: pick(formData, 'body') ?? '',
    appointmentId,
    sourceSurface: 'calendar_drawer',
    visibility: (pick(formData, 'visibility') ?? 'location') as CreateClientNoteBody['visibility'],
  };

  if (!body.body) {
    return {
      ok: false,
      error: 'Note body is required.',
      fieldErrors: { body: 'Required' },
    };
  }

  try {
    await createClientNote(clientId, body);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
  revalidatePath(PAGE);
  return { ok: true };
}

// ---- Quick Book ----

export async function createAppointmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const locationId = pick(formData, 'locationId');
  const clientId = pick(formData, 'clientId');
  const staffId = pick(formData, 'staffId');
  const serviceId = pick(formData, 'serviceId');
  const scheduledStartAt = pick(formData, 'scheduledStartAt');
  const notes = pick(formData, 'notes');

  // Light client-friendly validation. The API will Zod-validate authoritatively.
  const fieldErrors: Record<string, string> = {};
  if (!locationId) fieldErrors.locationId = 'Required';
  if (!clientId) fieldErrors.clientId = 'Required';
  if (!staffId) fieldErrors.staffId = 'Required';
  if (!serviceId) fieldErrors.serviceId = 'Required';
  if (!scheduledStartAt) fieldErrors.scheduledStartAt = 'Required';
  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: 'Please fill in all required fields.',
      fieldErrors,
    };
  }

  let quickBookStaffContext: StaffBookingClientContextResponse | undefined;
  try {
    quickBookStaffContext = await getStaffBookingClientContext({
      clientId: clientId!,
      serviceId: serviceId!,
      staffId: staffId!,
    });
    const ctx = quickBookStaffContext;
    const required = staffBookingItemsRequiringAcknowledgment(ctx);
    if (required.length > 0) {
      const missingAck: Record<string, string> = {};
      for (const a of required) {
        const key = `ack_alert_${a.id}`;
        const v = formData.get(key);
        const ok =
          v === 'on' ||
          v === 'true' ||
          v === '1' ||
          (typeof v === 'string' && v.toLowerCase() === 'on');
        if (!ok) missingAck[key] = 'Acknowledge this alert to continue.';
      }
      if (Object.keys(missingAck).length > 0) {
        return {
          ok: false,
          error:
            'One or more booking alerts require acknowledgment before booking.',
          fieldErrors: missingAck,
        };
      }
    }

    const formsNeedingAck = staffBookingFormsRequiringBookingAck(ctx);
    if (formsNeedingAck.length > 0) {
      const v = formData.get('ack_required_forms');
      const formsAckOk =
        v === 'on' ||
        v === 'true' ||
        v === '1' ||
        (typeof v === 'string' && v.toLowerCase() === 'on');
      if (!formsAckOk) {
        return {
          ok: false,
          error:
            'One or more forms require acknowledgment before booking (see checklist in the booking panel).',
          fieldErrors: {
            ack_required_forms:
              'Confirm you have reviewed required forms to continue.',
          },
        };
      }
    }
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        ok: false,
        error:
          err.message ||
          'Could not verify client booking alerts. Try again.',
      };
    }
    throw err;
  }

  let appointmentId: string;
  try {
    const { appointment } = await createAppointment({
      locationId: locationId!,
      clientId: clientId!,
      staffId: staffId!,
      serviceId: serviceId!,
      scheduledStartAt: scheduledStartAt!,
      source: 'quick_book',
    });
    appointmentId = appointment.id;

    const noteTrimmed = notes?.trim();
    if (noteTrimmed) {
      try {
        await createClientNote(clientId!, {
          category: 'session',
          body: noteTrimmed,
          appointmentId,
          sourceSurface: 'quick_book',
          visibility: 'location',
        });
      } catch (noteErr) {
        // Fallback: persist on the appointment row so the overview still shows text
        // if ClientNote creation fails (permissions, validation edge cases).
        try {
          await updateAppointment(appointmentId, { notes: noteTrimmed });
        } catch {
          if (noteErr instanceof ApiError) return apiErrorToState(noteErr);
          throw noteErr;
        }
      }
    }

    const ctx = quickBookStaffContext;
    if (!ctx) {
      throw new Error('Staff booking context missing after pre-flight.');
    }
    // Persist operator attestations after the appointment row exists (ack API
    // requires a real appointmentId). If a call below fails, the appointment
    // remains — treat as rare; operator can re-ack from the client note flow.
    for (const noteId of staffBookingItemsRequiringAcknowledgment(ctx).map(
      (a) => a.id,
    )) {
      await acknowledgeClientNote(clientId!, noteId, {
        staffId: staffId!,
        triggerContext: 'booking',
        appointmentId,
      });
    }
    if (staffBookingFormsRequiringBookingAck(ctx).length > 0) {
      await logRequiredFormsBookingAcknowledgment(appointmentId, {
        staffId: staffId!,
        clientId: clientId!,
        serviceId: serviceId!,
      });
    }
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
  revalidatePath(PAGE);
  // Refresh client profile when booking was created from Quick Book with a known client.
  revalidatePath(`/admin/clients/${clientId!}`);
  return { ok: true };
}

// ---- Quick Book: minimal inline client (staff booking + CRM spec flow B) ----

// ---- Staff schedule blocks (calendar-area-features §9) ----

export async function createStaffScheduleBlockAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staffId = pick(formData, 'staffId');
  const dateStr = pick(formData, 'date');
  const startTime = pick(formData, 'startTime');
  const endTime = pick(formData, 'endTime');
  const title = pick(formData, 'title');
  const category = pick(formData, 'category');
  const locationId = pick(formData, 'locationId');

  const fieldErrors: Record<string, string> = {};
  if (!staffId) fieldErrors.staffId = 'Required';
  if (!dateStr) fieldErrors.date = 'Required';
  if (!startTime) fieldErrors.startTime = 'Required';
  if (!endTime) fieldErrors.endTime = 'Required';
  if (!title) fieldErrors.title = 'Required';
  if (!category) fieldErrors.category = 'Required';
  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: 'Please fill in all required fields.',
      fieldErrors,
    };
  }

  const startsAt = new Date(`${dateStr}T${startTime}:00`).toISOString();
  const endsAt = new Date(`${dateStr}T${endTime}:00`).toISOString();
  if (!(new Date(endsAt) > new Date(startsAt))) {
    return {
      ok: false,
      error: 'End time must be after start time.',
      fieldErrors: { endTime: 'Must be after start' },
    };
  }

  const loc =
    locationId && locationId.length > 0 ? locationId : undefined;

  try {
    const body: CreateStaffScheduleBlockBody = {
      staffId: staffId!,
      locationId: loc ?? null,
      title: title!.trim(),
      category: category as CreateStaffScheduleBlockBody['category'],
      startsAt,
      endsAt,
      visibility: 'internal',
    };
    await createStaffScheduleBlock(body);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
  revalidatePath(PAGE);
  return { ok: true };
}

export async function deleteStaffScheduleBlockAction(
  blockId: string,
): Promise<ActionState> {
  try {
    await deleteStaffScheduleBlock(blockId);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
  revalidatePath(PAGE);
  return { ok: true };
}

export async function quickBookCreateClientInline(body: {
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
}): Promise<{ ok: true; client: Client } | { ok: false; error: string }> {
  const firstName = body.firstName.trim();
  if (firstName.length < 1) {
    return { ok: false, error: 'First name is required.' };
  }
  try {
    const result = await createClient({
      firstName,
      lastName: body.lastName?.trim() || undefined,
      phone: body.phone?.trim() || undefined,
      email: body.email?.trim() || undefined,
    });
    return { ok: true, client: result.client };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

// ---- Quick Book sub-actions: client typeahead + availability slots ----

export async function searchClientsAction(
  q: string,
): Promise<{ clients: Client[]; error?: string }> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return { clients: [] };
  try {
    const result = await listClients({ q: trimmed, take: 12 });
    return { clients: result.clients };
  } catch (err) {
    if (err instanceof ApiError) {
      return { clients: [], error: err.message };
    }
    throw err;
  }
}

/** Services eligible for Quick Book when a staff member is chosen (StaffService M2M). */
export async function listServicesForBookingAction(staffId?: string): Promise<{
  services: Awaited<ReturnType<typeof listServices>>['services'];
  error?: string;
}> {
  try {
    const result = await listServices({
      active: true,
      take: 200,
      ...(staffId ? { staffId } : {}),
    });
    return { services: result.services };
  } catch (err) {
    if (err instanceof ApiError) {
      return { services: [], error: err.message };
    }
    throw err;
  }
}

export async function loadStaffBookingClientContextAction(args: {
  clientId: string;
  serviceId?: string;
  staffId?: string;
}): Promise<{
  context: StaffBookingClientContextResponse | null;
  error?: string;
}> {
  if (!args.clientId) {
    return { context: null };
  }
  try {
    const context = await getStaffBookingClientContext({
      clientId: args.clientId,
      serviceId: args.serviceId,
      staffId: args.staffId,
    });
    return { context };
  } catch (err) {
    if (err instanceof ApiError) {
      return { context: null, error: err.message };
    }
    throw err;
  }
}

// ---- Class instances (Phase 2a of the Classes epic) ----

/** Cancel a class instance from the calendar drawer. Reason is optional. */
export async function cancelClassInstanceCalendarAction(args: {
  instanceId: string;
  reason?: string;
}): Promise<ActionState> {
  try {
    await cancelClassInstance(args.instanceId, { reason: args.reason });
  } catch (err) {
    if (err instanceof ApiError) {
      // 409 = already cancelled. Treat as success — the UI state matches.
      if (err.status === 409 || err.status === 404) {
        revalidatePath(PAGE);
        return { ok: true };
      }
      return apiErrorToState(err);
    }
    throw err;
  }
  revalidatePath(PAGE);
  return { ok: true };
}

export async function loadAvailabilitySlotsAction(args: {
  staffId: string;
  serviceId: string;
  locationId: string;
  date: string;
}): Promise<{ slots: AvailableSlot[]; error?: string }> {
  if (!args.staffId || !args.serviceId || !args.locationId || !args.date) {
    return { slots: [] };
  }
  try {
    const result = await getAvailability(args);
    return { slots: result.slots };
  } catch (err) {
    if (err instanceof ApiError) {
      return { slots: [], error: err.message };
    }
    throw err;
  }
}

// ---- Class bookings + waitlist (Phase 3a of the Classes epic) ----

// Booking-action error envelope carries the typed `code` from the API so the
// drawer can branch on CLASS_FULL / WAITLIST_FULL / DUPLICATE_BOOKING /
// INSTANCE_NOT_BOOKABLE / BOOKING_ALREADY_CANCELLED / WAITLIST_ENTRY_*
// without parsing free-text messages.
export type ClassBookingActionError = {
  ok: false;
  error: string;
  code?: string;
};

function classBookingApiErrorToState(err: ApiError): ClassBookingActionError {
  const body = err.body;
  const code =
    body && typeof body === 'object' && 'code' in body
      ? String((body as { code: unknown }).code)
      : undefined;
  return { ok: false, error: err.message, code };
}

export type AddClientToClassInstanceResult =
  | { ok: true; result: CreateBookingOrWaitlistResponse }
  | ClassBookingActionError;

export async function addClientToClassInstanceAction(args: {
  instanceId: string;
  clientId: string;
  idempotencyKey: string;
}): Promise<AddClientToClassInstanceResult> {
  try {
    const result = await createClassBooking(args.instanceId, {
      clientId: args.clientId,
      idempotencyKey: args.idempotencyKey,
    });
    revalidatePath(PAGE);
    return { ok: true, result };
  } catch (err) {
    if (err instanceof ApiError) return classBookingApiErrorToState(err);
    throw err;
  }
}

export type CancelClassBookingResult =
  | { ok: true }
  | ClassBookingActionError;

export async function cancelClassBookingAction(args: {
  instanceId: string;
  bookingId: string;
  reason?: string;
}): Promise<CancelClassBookingResult> {
  try {
    await cancelClassBooking(args.instanceId, args.bookingId, {
      reason: args.reason,
      initiatedBy: 'studio',
    });
    revalidatePath(PAGE);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) {
      // 409 'already cancelled' / 404 'not found' — surface as success because
      // the UI state matches the server state.
      if (err.status === 404) {
        revalidatePath(PAGE);
        return { ok: true };
      }
      return classBookingApiErrorToState(err);
    }
    throw err;
  }
}

export type PromoteWaitlistEntryResult =
  | { ok: true; result: PromoteWaitlistResponse }
  | ClassBookingActionError;

export async function promoteWaitlistEntryAction(args: {
  instanceId: string;
  entryId: string;
}): Promise<PromoteWaitlistEntryResult> {
  try {
    const result = await promoteClassWaitlistEntry(
      args.instanceId,
      args.entryId,
    );
    revalidatePath(PAGE);
    return { ok: true, result };
  } catch (err) {
    if (err instanceof ApiError) return classBookingApiErrorToState(err);
    throw err;
  }
}
