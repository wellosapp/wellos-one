import type { IntakeFormSubmissionDto } from './intake-forms';
import { apiFetch } from './client';

// Forms System PR 8 — Forms tab on the appointment drawer.
//
// Read-only listing of IntakeFormSubmission rows attached to an appointment.
// Mutations (send, resend, cancel) reuse the existing
// /admin/intake-form-submissions/... endpoints via `intake-forms.ts`.

export async function listAppointmentForms(
  appointmentId: string,
): Promise<{ submissions: IntakeFormSubmissionDto[] }> {
  return apiFetch<{ submissions: IntakeFormSubmissionDto[] }>(
    `/admin/appointments/${appointmentId}/forms`,
  );
}
