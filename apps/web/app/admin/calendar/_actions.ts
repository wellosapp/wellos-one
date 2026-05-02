'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  createAppointment,
  transitionAppointment,
  updateAppointment,
  type AppointmentSlotConflictBody,
  type AppointmentState,
} from '@/lib/api/appointments';
import {
  createClientNote,
  type CreateClientNoteBody,
} from '@/lib/api/client-notes';
import { listClients, type Client } from '@/lib/api/clients';
import {
  getAvailability,
  type AvailableSlot,
} from '@/lib/api/availability';

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
    return { ok: false, error: 'You do not have admin access to this tenant.' };
  }
  if (err.status === 404) {
    return { ok: false, error: 'Not found.' };
  }
  return { ok: false, error: err.message };
}

// ---- Status transition (drawer Overview tab buttons) ----

const TRANSITION_STATES: AppointmentState[] = [
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

  try {
    await createAppointment({
      locationId: locationId!,
      clientId: clientId!,
      staffId: staffId!,
      serviceId: serviceId!,
      scheduledStartAt: scheduledStartAt!,
      notes,
    });
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
  revalidatePath(PAGE);
  return { ok: true };
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
