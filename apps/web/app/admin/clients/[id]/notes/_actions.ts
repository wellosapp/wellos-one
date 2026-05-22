'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  createClientNote,
  deleteClientNote,
  pinClientNote,
  type CreateClientNoteBody,
} from '@/lib/api/client-notes';

// Server actions for the client profile Notes section. Thin wrappers around
// the API helpers. Tenant scoping + role enforcement (admin-only DELETE, etc.)
// happen at the Fastify API. We surface 403/404/422 here as friendly errors
// the form can render.

export type NotesActionState = {
  ok: boolean;
  error?: string;
};

function apiErrToState(err: unknown, fallback: string): NotesActionState {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return {
        ok: false,
        error: 'You do not have permission to perform this action.',
      };
    }
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

export async function createClientNoteAction(
  clientId: string,
  _prev: NotesActionState,
  formData: FormData,
): Promise<NotesActionState> {
  const bodyRaw = formData.get('body');
  const body = typeof bodyRaw === 'string' ? bodyRaw.trim() : '';
  if (body.length === 0) {
    return { ok: false, error: 'Note body is required.' };
  }

  const pinned = formData.get('pinned') === '1';

  // The composer is intentionally minimal (per plan §"Out of scope"): we
  // only collect body + pinned. Other API-supported fields (category,
  // priority, visibility, etc.) default to admin-internal values.
  const payload: CreateClientNoteBody = {
    category: 'general',
    priority: 'normal',
    body,
    sourceSurface: 'client_profile',
    visibility: 'admin_only',
    pinned,
  };

  try {
    await createClientNote(clientId, payload);
  } catch (err) {
    return apiErrToState(err, 'Could not create note.');
  }

  revalidatePath(`/admin/clients/${clientId}/notes`);
  return { ok: true };
}

export async function pinClientNoteAction(
  clientId: string,
  noteId: string,
  pinned: boolean,
): Promise<NotesActionState> {
  try {
    await pinClientNote(clientId, noteId, { pinned });
  } catch (err) {
    return apiErrToState(
      err,
      pinned ? 'Could not pin note.' : 'Could not unpin note.',
    );
  }
  revalidatePath(`/admin/clients/${clientId}/notes`);
  return { ok: true };
}

export async function deleteClientNoteAction(
  clientId: string,
  noteId: string,
): Promise<NotesActionState> {
  try {
    await deleteClientNote(clientId, noteId);
  } catch (err) {
    return apiErrToState(err, 'Could not delete note.');
  }
  revalidatePath(`/admin/clients/${clientId}/notes`);
  return { ok: true };
}
