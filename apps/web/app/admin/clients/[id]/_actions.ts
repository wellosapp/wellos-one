'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  createClientNote,
  type CreateClientNoteBody,
} from '@/lib/api/client-notes';

// Server actions scoped to the client profile (E3-S7). The parent
// /admin/clients _actions.ts already handles create/update/delete on the
// Client itself; this file adds the profile-level Add Note flow which
// has no appointmentId (a "general client memory" note rather than a
// visit-linked one).

export type ActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

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
  if (err.status === 403) {
    return { ok: false, error: 'You do not have admin access to this tenant.' };
  }
  if (err.status === 404) {
    return { ok: false, error: 'Client not found.' };
  }
  return { ok: false, error: err.message };
}

export async function addClientNoteAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const body: CreateClientNoteBody = {
    category: (pick(formData, 'category') ?? 'general') as CreateClientNoteBody['category'],
    priority: (pick(formData, 'priority') as CreateClientNoteBody['priority']) ?? 'normal',
    title: pick(formData, 'title'),
    body: pick(formData, 'body') ?? '',
    sourceSurface: 'client_profile',
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
  revalidatePath(`/admin/clients/${clientId}`);
  return { ok: true };
}
