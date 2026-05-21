// Type-safe wrappers for /admin/appointment-series endpoints (PR S3).
// Mirrors apps/api/src/schemas/appointmentSeries.ts +
// apps/api/src/services/appointmentSeriesService.ts (ListSeriesRow etc.).
// Kept in sync by hand at MVP; move to packages/shared when it fills in.

import { apiFetch } from '@/lib/api/client';
import type { Appointment } from '@/lib/api/appointments';

export type SeriesCadence = 'weekly' | 'biweekly' | 'monthly';
export type SeriesStatus = 'active' | 'cancelled' | 'completed';

// AppointmentSeries row as returned by Prisma JSON serialization. Date columns
// arrive as ISO-8601 strings; anchorDate / endsOn are date-only on disk but
// Prisma still serializes a Date — so we receive ISO datetimes.
export type AppointmentSeries = {
  id: string;
  tenantId: string;
  clientId: string;
  staffId: string;
  serviceId: string;
  locationId: string;
  cadence: SeriesCadence;
  daysOfWeek: number[];
  timeOfDay: string;
  durationMinutesSnapshot: number;
  priceCentsSnapshot: number;
  anchorDate: string;
  occurrenceCount: number | null;
  endsOn: string | null;
  status: SeriesStatus;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancelReason: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CreateSeriesBody = {
  locationId: string;
  clientId: string;
  staffId: string;
  serviceId: string;
  cadence: SeriesCadence;
  daysOfWeek: number[];
  timeOfDay: string;
  anchorDate: string;
  endCondition:
    | { occurrenceCount: number }
    | { endsOn: string };
};

export type CreateSeriesSuccess = {
  series: AppointmentSeries;
  occurrences: Appointment[];
  truncated: boolean;
};

// Mirrors ListSeriesRow on the service side.
export type ListSeriesRow = {
  seriesId: string;
  cadence: SeriesCadence;
  status: SeriesStatus;
  clientId: string;
  clientFirstName: string;
  clientLastName: string | null;
  staffId: string;
  serviceId: string;
  nextOccurrenceAt: string | null;
  remainingOccurrences: number;
  createdAt: string;
};

export type ListSeriesResponse = {
  rows: ListSeriesRow[];
  nextCursor: string | null;
};

export type ListSeriesQuery = {
  cursor?: string;
  limit?: number;
  clientId?: string;
  staffId?: string;
  status?: SeriesStatus;
};

export type SeriesDetailResponse = {
  series: AppointmentSeries;
  occurrences: Appointment[];
};

export type CancelSeriesResponse = {
  cancelledOccurrences: number;
  alreadyTerminal: boolean;
};

export type SeriesConflictRow = {
  scheduledStartAt: string;
  scheduledEndAt: string;
  reason: 'appointment_overlap' | 'staff_schedule_block';
  conflictingId: string | null;
};

export async function listAppointmentSeries(
  query: ListSeriesQuery = {},
): Promise<ListSeriesResponse> {
  return apiFetch<ListSeriesResponse>('/admin/appointment-series', {
    searchParams: {
      cursor: query.cursor,
      limit: query.limit,
      clientId: query.clientId,
      staffId: query.staffId,
      status: query.status,
    },
  });
}

export async function getAppointmentSeries(
  id: string,
): Promise<SeriesDetailResponse> {
  return apiFetch<SeriesDetailResponse>(`/admin/appointment-series/${id}`);
}

export async function createAppointmentSeries(
  body: CreateSeriesBody,
  idempotencyKey: string,
): Promise<CreateSeriesSuccess> {
  return apiFetch<CreateSeriesSuccess>('/admin/appointment-series', {
    method: 'POST',
    body,
    headers: { 'idempotency-key': idempotencyKey },
  });
}

export async function cancelAppointmentSeries(
  id: string,
  reason?: string,
): Promise<CancelSeriesResponse> {
  return apiFetch<CancelSeriesResponse>(`/admin/appointment-series/${id}`, {
    method: 'DELETE',
    body: reason ? { reason } : {},
  });
}
