// Type-safe wrappers for /admin/clients/:clientId/notes endpoints.
// Mirrors the Zod schemas in apps/api/src/schemas/clientNote.ts.
//
// The full ClientNote summary type lives in @/lib/api/timeline (the timeline
// + linkedRecords aggregator already exports it) — re-export instead of
// duplicating to keep one source of truth.

import { apiFetch } from './client';
import type {
  ClientNoteSummary,
  NoteAlertTrigger,
  NoteCategory,
  NotePriority,
  NoteSourceSurface,
  NoteVisibility,
} from './timeline';

export type {
  ClientNoteSummary,
  NoteAlertTrigger,
  NoteCategory,
  NotePriority,
  NoteSourceSurface,
  NoteVisibility,
} from './timeline';

export type CreateClientNoteBody = {
  category: NoteCategory;
  priority?: NotePriority;
  title?: string;
  body: string;
  appointmentId?: string;
  serviceId?: string;
  sourceSurface: NoteSourceSurface;
  visibility: NoteVisibility;
  customerVisible?: boolean;
  alertTriggers?: NoteAlertTrigger[];
  pinned?: boolean;
  expiresAt?: string;
};

export async function createClientNote(
  clientId: string,
  body: CreateClientNoteBody,
): Promise<{ note: ClientNoteSummary }> {
  return apiFetch(`/admin/clients/${clientId}/notes`, {
    method: 'POST',
    body,
  });
}

export type ListClientNotesQuery = {
  category?: NoteCategory;
  priority?: NotePriority;
  visibility?: NoteVisibility;
  appointmentId?: string;
  serviceId?: string;
  pinned?: boolean;
  includeArchived?: boolean;
  take?: number;
  skip?: number;
};

export async function listClientNotes(
  clientId: string,
  query: ListClientNotesQuery = {},
): Promise<{ notes: ClientNoteSummary[]; total: number }> {
  return apiFetch(`/admin/clients/${clientId}/notes`, {
    searchParams: {
      category: query.category,
      priority: query.priority,
      visibility: query.visibility,
      appointmentId: query.appointmentId,
      serviceId: query.serviceId,
      pinned: query.pinned,
      includeArchived: query.includeArchived,
      take: query.take,
      skip: query.skip,
    },
  });
}

export type AcknowledgeClientNoteBody = {
  staffId: string;
  triggerContext: 'booking' | 'check_in' | 'checkout' | 'manual';
  appointmentId?: string;
};

export async function acknowledgeClientNote(
  clientId: string,
  noteId: string,
  body: AcknowledgeClientNoteBody,
): Promise<{ acknowledgment: { id: string } }> {
  return apiFetch(`/admin/clients/${clientId}/notes/${noteId}/acknowledge`, {
    method: 'POST',
    body,
  });
}
