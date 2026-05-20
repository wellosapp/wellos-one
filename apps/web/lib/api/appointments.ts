// Type-safe wrappers for /admin/appointments + /admin/availability endpoints.
// Mirrors the Zod schemas in apps/api/src/schemas/appointment.ts. Kept in
// sync by hand at MVP — when packages/shared fills in, move these.

import { apiFetch } from './client';

/** Mirrors Prisma `ClientIntakeStatus` — joined on appointment list/detail. */
export type ClientIntakeStatus =
  | 'pending'
  | 'sent'
  | 'completed'
  | 'expired';

// AppointmentState string union — matches AppointmentStatusSchema in the API.
export type AppointmentState =
  | 'requested'
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
  | 'quick_book'
  | 'calendar_drag';

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
  /** List price in cents, locked at booking (Services & Catalog). */
  bookedBasePriceCents: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** From linked Client row; present on list + GET /admin/appointments/:id. */
  clientIntakeStatus?: ClientIntakeStatus;
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
  source?: AppointmentSource;
};

export async function createAppointment(
  body: CreateAppointmentBody,
): Promise<{ appointment: Appointment }> {
  return apiFetch('/admin/appointments', { method: 'POST', body });
}

/** Persists audit when operator acknowledged required forms during Quick Book. */
export async function logRequiredFormsBookingAcknowledgment(
  appointmentId: string,
  body: { staffId: string; clientId: string; serviceId: string },
): Promise<{ ok: true }> {
  return apiFetch(
    `/admin/appointments/${appointmentId}/required-forms-booking-ack`,
    { method: 'POST', body },
  );
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

/** R2 §11.2 — staff approves a request_approval booking (requested → confirmed). */
export async function approveAppointment(
  id: string,
): Promise<{ appointment: Appointment }> {
  return apiFetch(`/admin/appointments/${id}/approve`, {
    method: 'POST',
  });
}

/** R2 §11.2 — staff declines a request_approval booking (requested → cancelled). */
export async function declineAppointment(
  id: string,
  body: { reason?: string } = {},
): Promise<{ appointment: Appointment }> {
  return apiFetch(`/admin/appointments/${id}/decline`, {
    method: 'POST',
    body,
  });
}

export type UpdateAppointmentBody = {
  notes?: string;
  scheduledStartAt?: string;
  staffId?: string;
  locationId?: string;
};

export type UpdateAppointmentOptions = {
  /** Sends x-wellos-calendar-drag so the API can record source = calendar_drag. */
  calendarDrag?: boolean;
};

export async function updateAppointment(
  id: string,
  body: UpdateAppointmentBody,
  options?: UpdateAppointmentOptions,
): Promise<{ appointment: Appointment }> {
  return apiFetch(`/admin/appointments/${id}`, {
    method: 'PATCH',
    body,
    headers:
      options?.calendarDrag === true
        ? { 'x-wellos-calendar-drag': '1' }
        : undefined,
  });
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
