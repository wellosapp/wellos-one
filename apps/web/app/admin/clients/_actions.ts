'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import {
  createClient,
  deleteClient,
  updateClient,
  type ClientIntakeStatus,
  type ClientWriteBody,
  type DuplicateWarning,
} from '@/lib/api/clients';
import { ApiError } from '@/lib/api/client';

// Server actions for admin client CRUD. Called from the ClientForm client
// component via useActionState. On validation failure or duplicate-warning,
// return a state object the form can render. On success, revalidate the
// list path and redirect to the detail page.
//
// Tenant scoping + role enforcement happens at the Fastify API. These
// actions only carry the user's Clerk session via the apiFetch wrapper
// (auth().getToken()).

export type ActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  duplicateWarning?: DuplicateWarning;
  // Echoed back so the form can re-display what the user typed when there's
  // a non-success state (validation error, duplicate warning awaiting
  // confirmation).
  values?: Partial<ClientWriteBody>;
};

const VALID_INTAKE_STATUSES: ClientIntakeStatus[] = [
  'pending',
  'sent',
  'completed',
  'expired',
];

function pick(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildBodyFromForm(formData: FormData): ClientWriteBody {
  const intakeRaw = pick(formData, 'intakeStatus');
  const intakeStatus =
    intakeRaw && (VALID_INTAKE_STATUSES as string[]).includes(intakeRaw)
      ? (intakeRaw as ClientIntakeStatus)
      : undefined;
  const tagIds = formData
    .getAll('tagIds')
    .filter((v): v is string => typeof v === 'string');
  return {
    firstName: pick(formData, 'firstName') ?? '',
    lastName: pick(formData, 'lastName'),
    preferredName: pick(formData, 'preferredName'),
    email: pick(formData, 'email'),
    phone: pick(formData, 'phone'),
    dateOfBirth: pick(formData, 'dateOfBirth'),
    addressLine1: pick(formData, 'addressLine1'),
    addressLine2: pick(formData, 'addressLine2'),
    city: pick(formData, 'city'),
    state: pick(formData, 'state'),
    postalCode: pick(formData, 'postalCode'),
    country: pick(formData, 'country'),
    emergencyContactName: pick(formData, 'emergencyContactName'),
    emergencyContactPhone: pick(formData, 'emergencyContactPhone'),
    intakeStatus,
    notes: pick(formData, 'notes'),
    tagIds,
  };
}

function apiErrorToState(err: ApiError, values: ClientWriteBody): ActionState {
  // Backend Zod errors come back as { error, message, issues: [{ path, message }] }.
  if (err.status === 400 && err.body && typeof err.body === 'object' && 'issues' in err.body) {
    const issues = (err.body as { issues: Array<{ path: string; message: string }> }).issues;
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) {
      if (issue.path) fieldErrors[issue.path] = issue.message;
    }
    return { ok: false, error: 'Please fix the highlighted fields.', fieldErrors, values };
  }
  if (err.status === 403) {
    return { ok: false, error: 'You do not have admin access to this tenant.', values };
  }
  if (err.status === 404) {
    return { ok: false, error: 'Client not found.', values };
  }
  return { ok: false, error: err.message, values };
}

export async function createClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const body = buildBodyFromForm(formData);

  // The user has been shown a duplicate-warning state and clicked "Save anyway".
  // We surface this via a hidden field; the API doesn't actually need to know,
  // it has no flag for it — we just bypass our client-side gate.
  const acknowledgedDuplicate = formData.get('acknowledgeDuplicate') === '1';

  let result;
  try {
    result = await createClient(body);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err, body);
    throw err;
  }

  if (result.duplicateWarning && !acknowledgedDuplicate) {
    return {
      ok: false,
      error: 'A client with this email or phone already exists.',
      duplicateWarning: result.duplicateWarning,
      values: body,
    };
  }

  revalidatePath('/admin/clients');
  redirect(`/admin/clients/${result.client.id}`);
}

export async function updateClientAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const body = buildBodyFromForm(formData);
  const acknowledgedDuplicate = formData.get('acknowledgeDuplicate') === '1';

  let result;
  try {
    result = await updateClient(id, body);
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err, body);
    throw err;
  }

  if (result.duplicateWarning && !acknowledgedDuplicate) {
    return {
      ok: false,
      error: 'Another client with this email or phone already exists.',
      duplicateWarning: result.duplicateWarning,
      values: body,
    };
  }

  revalidatePath('/admin/clients');
  revalidatePath(`/admin/clients/${id}`);
  return { ok: true, values: body };
}

export async function deleteClientAction(id: string): Promise<void> {
  try {
    await deleteClient(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Already gone — treat as success.
    } else {
      throw err;
    }
  }
  revalidatePath('/admin/clients');
  redirect('/admin/clients');
}
