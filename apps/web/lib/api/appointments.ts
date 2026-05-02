// Type-safe wrappers for /admin/appointments + /admin/availability endpoints.
// Mirrors the Zod schemas in apps/api/src/schemas/appointment.ts. Kept in
// sync by hand at MVP — when packages/shared fills in, move these.

import { apiFetch } from './client';

// AppointmentState string union — matches AppointmentStatusSchema in the API.
export type AppointmentState =
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

// AppointmentSource — matches the AppointmentSource Prisma enum. The list/get
// endpoints return null when the row was created without an explicit source.
export type AppointmentSource =
  | 'web'
  | 'staff'
  | 'widget'
  | 'api'
  | 'import'
  | 'campaign'
  | 'walk_in'
  | 'quick_book';

// Appointment row as returned by APPOINTMENT_SAFE_FIELDS in
// apps/api/src/services/appointmentService.ts. The list + detail endpoints
// return the same shape.
export type Appointment = {
  id: string;
  tenantId: string;
  locationId: string;
  clientId: string;
  staffId: string;
  serviceId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  state: AppointmentState;
  source: AppointmentSource | null;
  notes: string | null;
  createdByUserId: string | null;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ListAppointmentsResponse = {
  appointments: Appointment[];
  total: number;
};

export type ListAppointmentsQuery = {
  staffId?: string;
  clientId?: string;
  state?: AppointmentState;
  // UTC ISO strings.
  from?: string;
  to?: string;
  take?: number;
  skip?: number;
  includeDeleted?: boolean;
};

export async function listAppointments(
  query: ListAppointmentsQuery = {},
): Promise<ListAppointmentsResponse> {
  return apiFetch<ListAppointmentsResponse>('/admin/appointments', {
    searchParams: {
      staffId: query.staffId,
      clientId: query.clientId,
      state: query.state,
      from: query.from,
      to: query.to,
      take: query.take,
      skip: query.skip,
      includeDeleted: query.includeDeleted,
    },
  });
}

export async function getAppointment(
  id: string,
): Promise<{ appointment: Appointment }> {
  return apiFetch<{ appointment: Appointment }>(`/admin/appointments/${id}`);
}

// Create body — matches CreateAppointmentBodySchema.
export type CreateAppointmentBody = {
  locationId: string;
  clientId: string;
  staffId: string;
  serviceId: string;
  scheduledStartAt: string; // UTC ISO
  state?: AppointmentState;
  notes?: string;
};

export async function createAppointment(
  body: CreateAppointmentBody,
): Promise<{ appointment: Appointment }> {
  return apiFetch('/admin/appointments', { method: 'POST', body });
}

// 409 conflict body shape from the create route. Surfaces in catch blocks.
export type AppointmentSlotConflictBody = {
  error: 'Conflict';
  message: string;
  conflict: {
    appointmentId: string;
    staffId: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
  };
};

export type TransitionAppointmentBody = {
  to: AppointmentState;
  reason?: string;
};

export async function transitionAppointment(
  id: string,
  body: TransitionAppointmentBody,
): Promise<{ appointment: Appointment }> {
  return apiFetch(`/admin/appointments/${id}/transition`, {
    method: 'POST',
    body,
  });
}

export type UpdateAppointmentBody = {
  notes?: string;
};

export async function updateAppointment(
  id: string,
  body: UpdateAppointmentBody,
): Promise<{ appointment: Appointment }> {
  return apiFetch(`/admin/appointments/${id}`, { method: 'PATCH', body });
}

// Booking answers (Intake tab). Same row shape as
// BookingAnswerSummary in @/lib/api/timeline.
export type BookingAnswer = {
  id: string;
  appointmentId: string;
  questionId: string;
  questionKeySnapshot: string;
  questionLabelSnapshot: string;
  questionTypeSnapshot:
    | 'chips_single'
    | 'chips_multi'
    | 'short_text'
    | 'long_text'
    | 'slider'
    | 'yes_no'
    | 'photo_upload';
  answerValue: unknown;
  createdAt: string;
};

export async function listBookingAnswers(
  appointmentId: string,
): Promise<{ answers: BookingAnswer[] }> {
  return apiFetch<{ answers: BookingAnswer[] }>(
    `/admin/appointments/${appointmentId}/booking-answers`,
  );
}
