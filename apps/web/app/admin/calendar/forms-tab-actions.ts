'use server';

import { ApiError } from '@/lib/api/client';
import { listAppointmentForms } from '@/lib/api/appointment-forms';
import type { IntakeFormSubmissionDto } from '@/lib/api/intake-forms';

// PR 8 — server-action wrapper for the appointment-drawer Forms tab.

export type ListAppointmentFormsResult =
  | { ok: true; submissions: IntakeFormSubmissionDto[] }
  | { ok: false; error: string };

export async function listAppointmentFormsAction(
  appointmentId: string,
): Promise<ListAppointmentFormsResult> {
  try {
    const res = await listAppointmentForms(appointmentId);
    return { ok: true, submissions: res.submissions };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof Error) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: 'Unknown error.' };
  }
}
