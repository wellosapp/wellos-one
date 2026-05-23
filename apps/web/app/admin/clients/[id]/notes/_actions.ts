'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  createClientNote,
  deleteClientNote,
  pinClientNote,
  type CreateClientNoteBody,
  type NoteCategory,
  type NotePriority,
} from '@/lib/api/client-notes';

// The 8 user-facing categories surfaced in the composer dropdown. Other
// enum values still render as badges on existing notes, but new notes
// can only be created from this short list.
const USER_FACING_CATEGORIES = new Set<NoteCategory>([
  'general',
  'preference',
  'formula',
  'allergy',
  'medical',
  'behavioral',
  'billing',
  'internal',
]);

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

  // Category — fall back to 'general' silently if the submitted value isn't
  // in the user-facing list (forward-compat for future dropdown changes).
  const categoryRaw = formData.get('category');
  const categoryCandidate =
    typeof categoryRaw === 'string' ? (categoryRaw as NoteCategory) : 'general';
  const category: NoteCategory = USER_FACING_CATEGORIES.has(categoryCandidate)
    ? categoryCandidate
    : 'general';

  // Priority — default 'normal' if anything other than 'alert' comes through.
  const priorityRaw = formData.get('priority');
  const priority: NotePriority =
    typeof priorityRaw === 'string' && priorityRaw === 'alert'
      ? 'alert'
      : 'normal';

  // Title — optional; empty string normalizes to undefined.
  const titleRaw = formData.get('title');
  const titleTrimmed =
    typeof titleRaw === 'string' ? titleRaw.trim() : '';
  const title = titleTrimmed.length > 0 ? titleTrimmed : undefined;

  const payload: CreateClientNoteBody = {
    category,
    priority,
    title,
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
