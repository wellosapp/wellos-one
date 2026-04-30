// Type-safe wrappers for /admin/staff endpoints. Mirrors the Zod schemas
// in apps/api/src/schemas/staff.ts. Kept in sync by hand at MVP.
//
// Day-of-week constants live in @/lib/staff-days so client components
// can import them without dragging in @clerk/nextjs/server.

import { apiFetch } from './client';
import type { WorkingHours } from '../staff-days';

export type {
  DayKey,
  Shift,
  WorkingHours,
} from '../staff-days';
export { DAY_KEYS, DAY_LABELS } from '../staff-days';

export type Staff = {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  workingHours: WorkingHours | null;
  hourlyRateCents: number | null;
  // Decimal serialized as string by Prisma's Json over the wire — coerce
  // to number on the consumer side.
  commissionRatePct: number | string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

// Detail endpoint augments Staff with the M2M assignment as a flat array.
// List endpoint omits this for performance.
export type StaffWithServices = Staff & { serviceIds: string[] };

export type StaffWriteBody = {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  workingHours?: WorkingHours;
  hourlyRateCents?: number;
  commissionRatePct?: number;
  active?: boolean;
  serviceIds?: string[];
};

export type ListStaffResponse = {
  staff: Staff[];
  total: number;
};

export type ListStaffQuery = {
  q?: string;
  active?: boolean;
  take?: number;
  skip?: number;
  includeDeleted?: boolean;
};

export async function listStaff(
  query: ListStaffQuery = {},
): Promise<ListStaffResponse> {
  return apiFetch<ListStaffResponse>('/admin/staff', {
    searchParams: {
      q: query.q,
      active: query.active,
      take: query.take,
      skip: query.skip,
      includeDeleted: query.includeDeleted,
    },
  });
}

export async function getStaff(
  id: string,
): Promise<{ staff: StaffWithServices }> {
  return apiFetch<{ staff: StaffWithServices }>(`/admin/staff/${id}`);
}

export async function createStaff(
  body: StaffWriteBody,
): Promise<{ staff: StaffWithServices }> {
  return apiFetch('/admin/staff', { method: 'POST', body });
}

export async function updateStaff(
  id: string,
  body: Partial<StaffWriteBody>,
): Promise<{ staff: StaffWithServices }> {
  return apiFetch(`/admin/staff/${id}`, { method: 'PATCH', body });
}

export async function deleteStaff(id: string): Promise<void> {
  await apiFetch(`/admin/staff/${id}`, { method: 'DELETE' });
}
