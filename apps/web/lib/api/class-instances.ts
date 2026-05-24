// Type-safe wrappers for /admin/class-instances endpoints (Classes Phase 2a).
// Mirrors the Zod schemas in apps/api/src/schemas/classInstance.ts. Kept in
// sync by hand at MVP — when @wellos/shared fills in, move these.

import { apiFetch } from './client';

export type ClassInstanceState =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type ClassInstance = {
  id: string;
  tenantId: string;
  classId: string;
  staffId: string;
  locationId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  capacityOverride: number | null;
  waitlistOverride: number | null;
  state: ClassInstanceState;
  cancelledReason: string | null;
  cancelledAt: string | null;
  recurrenceRuleId: string | null;
  createdAt: string;
  updatedAt: string;
};

// List/get wire shape: instance scalars + class/staff/location summaries for
// display in calendar chips and instance tables without a second round-trip.
export type ClassInstanceWithRelations = ClassInstance & {
  class: {
    id: string;
    name: string;
    color: string | null;
    durationMinutes: number;
    maxCapacity: number;
    waitlistLimit: number;
  };
  staff: {
    id: string;
    firstName: string;
    lastName: string | null;
    jobTitle: string | null;
  };
  location: { id: string; name: string };
};

export type ListClassInstancesResponse = {
  instances: ClassInstanceWithRelations[];
  total: number;
};

export type ListClassInstancesQuery = {
  classId?: string;
  staffId?: string;
  locationId?: string;
  /** UTC ISO. */
  fromDate?: string;
  /** UTC ISO. */
  toDate?: string;
  state?: ClassInstanceState;
  take?: number;
  skip?: number;
};

export async function listClassInstances(
  query: ListClassInstancesQuery = {},
): Promise<ListClassInstancesResponse> {
  return apiFetch<ListClassInstancesResponse>('/admin/class-instances', {
    searchParams: {
      classId: query.classId,
      staffId: query.staffId,
      locationId: query.locationId,
      fromDate: query.fromDate,
      toDate: query.toDate,
      state: query.state,
      take: query.take,
      skip: query.skip,
    },
  });
}

export async function getClassInstance(
  id: string,
): Promise<{ instance: ClassInstanceWithRelations }> {
  return apiFetch<{ instance: ClassInstanceWithRelations }>(
    `/admin/class-instances/${id}`,
  );
}

export type CreateClassInstanceBody = {
  classId: string;
  staffId: string;
  locationId: string;
  scheduledStartAt: string;
  /** Optional. Server computes from class duration + buffers when omitted. */
  scheduledEndAt?: string;
  capacityOverride?: number | null;
  waitlistOverride?: number | null;
};

export async function createClassInstance(
  body: CreateClassInstanceBody,
): Promise<{ instance: ClassInstance }> {
  return apiFetch('/admin/class-instances', { method: 'POST', body });
}

export type UpdateClassInstanceBody = {
  staffId?: string;
  locationId?: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  capacityOverride?: number | null;
  waitlistOverride?: number | null;
};

export async function updateClassInstance(
  id: string,
  body: UpdateClassInstanceBody,
): Promise<{ instance: ClassInstance }> {
  return apiFetch(`/admin/class-instances/${id}`, { method: 'PATCH', body });
}

export async function cancelClassInstance(
  id: string,
  body: { reason?: string } = {},
): Promise<{ instance: ClassInstance }> {
  return apiFetch(`/admin/class-instances/${id}/cancel`, {
    method: 'POST',
    body,
  });
}
