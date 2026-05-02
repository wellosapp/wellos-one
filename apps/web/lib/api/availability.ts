// Type-safe wrapper for /admin/availability. Mirrors
// ListAvailabilityQuerySchema in apps/api/src/schemas/appointment.ts and the
// listAvailableSlots service return shape.

import { apiFetch } from './client';

export type AvailableSlot = {
  startAt: string; // UTC ISO
  endAt: string; // UTC ISO
};

export type ListAvailabilityQuery = {
  staffId: string;
  serviceId: string;
  locationId: string;
  date: string; // YYYY-MM-DD
  tz?: string; // IANA TZ; defaults to location.timezone server-side
};

export async function getAvailability(
  query: ListAvailabilityQuery,
): Promise<{ slots: AvailableSlot[] }> {
  return apiFetch<{ slots: AvailableSlot[] }>('/admin/availability', {
    searchParams: {
      staffId: query.staffId,
      serviceId: query.serviceId,
      locationId: query.locationId,
      date: query.date,
      tz: query.tz,
    },
  });
}
