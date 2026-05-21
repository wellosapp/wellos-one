'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import { listClients } from '@/lib/api/clients';
import { getService } from '@/lib/api/services';
import {
  cancelAppointmentSeries,
  createAppointmentSeries,
  type CreateSeriesBody,
  type SeriesCadence,
  type SeriesConflictRow,
} from './_api';

// Server actions for the recurring-series admin UI (PR S3). The Fastify
// route handles tenant + role scoping; these are thin wrappers that build a
// typed payload, attach an Idempotency-Key, and translate API errors into
// state objects the form can render inline.

export type ZodIssue = { path: string; message: string };

export type CreateSeriesActionState =
  | { ok: false }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
      conflicts?: SeriesConflictRow[];
      values?: SeriesFormValues;
    }
  | { ok: true };

export type SeriesFormValues = {
  clientId: string;
  serviceId: string;
  staffId: string;
  locationId: string;
  cadence: SeriesCadence;
  daysOfWeek: number[];
  timeOfDay: string;
  anchorDate: string;
  endMode: 'count' | 'date';
  occurrenceCount: string;
  endsOn: string;
};

function readForm(formData: FormData): SeriesFormValues {
  const cadenceRaw = String(formData.get('cadence') ?? 'weekly');
  const cadence: SeriesCadence =
    cadenceRaw === 'biweekly' || cadenceRaw === 'monthly'
      ? cadenceRaw
      : 'weekly';
  const daysOfWeek = formData
    .getAll('daysOfWeek')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  const endModeRaw = String(formData.get('endMode') ?? 'count');
  const endMode: 'count' | 'date' =
    endModeRaw === 'date' ? 'date' : 'count';
  return {
    clientId: String(formData.get('clientId') ?? '').trim(),
    serviceId: String(formData.get('serviceId') ?? '').trim(),
    staffId: String(formData.get('staffId') ?? '').trim(),
    locationId: String(formData.get('locationId') ?? '').trim(),
    cadence,
    daysOfWeek,
    timeOfDay: String(formData.get('timeOfDay') ?? '').trim(),
    anchorDate: String(formData.get('anchorDate') ?? '').trim(),
    endMode,
    occurrenceCount: String(formData.get('occurrenceCount') ?? '').trim(),
    endsOn: String(formData.get('endsOn') ?? '').trim(),
  };
}

function clientSideValidate(
  values: SeriesFormValues,
): Record<string, string> | null {
  const errors: Record<string, string> = {};
  if (!values.clientId) errors.clientId = 'Pick a client.';
  if (!values.serviceId) errors.serviceId = 'Pick a service.';
  if (!values.staffId) errors.staffId = 'Pick a staff member.';
  if (!values.locationId) errors.locationId = 'Pick a location.';
  if (!values.timeOfDay) errors.timeOfDay = 'Pick a time.';
  if (!values.anchorDate) errors.anchorDate = 'Pick an anchor date.';
  if (
    (values.cadence === 'weekly' || values.cadence === 'biweekly') &&
    values.daysOfWeek.length === 0
  ) {
    errors.daysOfWeek = 'Pick at least one day of the week.';
  }
  if (values.endMode === 'count') {
    const n = Number(values.occurrenceCount);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      errors.occurrenceCount = 'Enter a whole number between 1 and 365.';
    }
  } else if (!values.endsOn) {
    errors.endsOn = 'Pick an end date.';
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

function deriveDaysOfWeek(values: SeriesFormValues): number[] {
  if (values.cadence === 'monthly') {
    // Monthly cadence ignores daysOfWeek but the API expects min length 1 —
    // pass the anchor's ISO weekday derived from the local date. Compute via
    // a Date built from the YYYY-MM-DD parts to avoid local-zone drift.
    const parts = values.anchorDate.split('-').map((p) => Number(p));
    const [y, m, d] = parts;
    if (y === undefined || m === undefined || d === undefined) return [1];
    // getUTCDay returns 0=Sun..6=Sat; convert to ISO 1=Mon..7=Sun.
    const utc = new Date(Date.UTC(y, m - 1, d));
    const dow = utc.getUTCDay();
    const iso = dow === 0 ? 7 : dow;
    return [iso];
  }
  return values.daysOfWeek;
}

function apiErrorToState(
  err: ApiError,
  values: SeriesFormValues,
): CreateSeriesActionState {
  if (
    err.status === 400 &&
    err.body &&
    typeof err.body === 'object' &&
    'issues' in err.body
  ) {
    const issues = (err.body as { issues: ZodIssue[] }).issues;
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
  if (err.status === 409 && err.body && typeof err.body === 'object') {
    const conflicts = (err.body as { conflicts?: SeriesConflictRow[] }).conflicts ?? [];
    return {
      ok: false,
      error:
        'One or more occurrences conflict with existing appointments or blocked time.',
      conflicts,
      values,
    };
  }
  if (err.status === 422) {
    return {
      ok: false,
      error:
        'Your selection produces no valid occurrences. Pick a different anchor or end date.',
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

export async function createSeriesAction(
  _prev: CreateSeriesActionState,
  formData: FormData,
): Promise<CreateSeriesActionState> {
  const values = readForm(formData);

  const fieldErrors = clientSideValidate(values);
  if (fieldErrors) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors,
      values,
    };
  }

  const endCondition =
    values.endMode === 'count'
      ? { occurrenceCount: Number(values.occurrenceCount) }
      : { endsOn: values.endsOn };

  const body: CreateSeriesBody = {
    locationId: values.locationId,
    clientId: values.clientId,
    staffId: values.staffId,
    serviceId: values.serviceId,
    cadence: values.cadence,
    daysOfWeek: deriveDaysOfWeek(values),
    timeOfDay: values.timeOfDay,
    anchorDate: values.anchorDate,
    endCondition,
  };

  let created;
  try {
    created = await createAppointmentSeries(body, randomUUID());
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err, values);
    throw err;
  }

  revalidatePath('/admin/appointment-series');
  redirect(`/admin/appointment-series/${created.series.id}`);
}

export type CancelSeriesActionState =
  | { ok: false }
  | { ok: false; error: string }
  | { ok: true; cancelledOccurrences: number; alreadyTerminal: boolean };

export async function cancelSeriesAction(
  id: string,
  _prev: CancelSeriesActionState,
  formData: FormData,
): Promise<CancelSeriesActionState> {
  const reasonRaw = formData.get('reason');
  const reason =
    typeof reasonRaw === 'string' && reasonRaw.trim().length > 0
      ? reasonRaw.trim().slice(0, 500)
      : undefined;

  try {
    const result = await cancelAppointmentSeries(id, reason);
    revalidatePath('/admin/appointment-series');
    revalidatePath(`/admin/appointment-series/${id}`);
    return {
      ok: true,
      cancelledOccurrences: result.cancelledOccurrences,
      alreadyTerminal: result.alreadyTerminal,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

// Returns the staff ids assigned to a service. Used by CreateSeriesForm to
// filter the staff dropdown to those who can actually perform the chosen
// service. Mirrors the assignment-required check in
// appointmentSeriesService.validateSeriesReferences — the service rejects
// unrelated staff at create time even if assignmentCount > 0.
export async function getServiceStaffIdsAction(
  serviceId: string,
): Promise<{ staffIds: string[]; error?: string }> {
  if (!serviceId) return { staffIds: [] };
  try {
    const result = await getService(serviceId);
    return { staffIds: result.service.staffIds };
  } catch (err) {
    if (err instanceof ApiError) {
      return { staffIds: [], error: err.message };
    }
    throw err;
  }
}

// Client-search server action used by the typeahead in CreateSeriesForm.
// Mirrors apps/web/app/admin/calendar/_actions.ts:searchClientsAction.
export async function searchClientsForSeriesAction(
  q: string,
): Promise<{
  clients: Array<{
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  }>;
  error?: string;
}> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return { clients: [] };
  try {
    const result = await listClients({ q: trimmed, take: 12 });
    return {
      clients: result.clients.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
      })),
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return { clients: [], error: err.message };
    }
    throw err;
  }
}
