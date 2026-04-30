// Type-safe wrappers for /admin/services endpoints. Mirrors the Zod schemas
// in apps/api/src/schemas/service.ts. Kept in sync by hand at MVP — when
// the shared types package fills in, move these to packages/shared.

import { apiFetch } from './client';

export type Service = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  basePriceCents: number;
  color: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ServiceWriteBody = {
  name: string;
  description?: string;
  durationMinutes: number;
  basePriceCents: number;
  color?: string;
  active?: boolean;
  staffIds?: string[];
};

// Detail endpoint augments Service with staffIds (a derived projection of
// staff_services join rows). List endpoint omits this for performance.
export type ServiceWithStaff = Service & { staffIds: string[] };

export type ListServicesResponse = {
  services: Service[];
  total: number;
};

export type ListServicesQuery = {
  q?: string;
  active?: boolean;
  take?: number;
  skip?: number;
  includeDeleted?: boolean;
};

export async function listServices(
  query: ListServicesQuery = {},
): Promise<ListServicesResponse> {
  return apiFetch<ListServicesResponse>('/admin/services', {
    searchParams: {
      q: query.q,
      active: query.active,
      take: query.take,
      skip: query.skip,
      includeDeleted: query.includeDeleted,
    },
  });
}

export async function getService(
  id: string,
): Promise<{ service: ServiceWithStaff }> {
  return apiFetch<{ service: ServiceWithStaff }>(`/admin/services/${id}`);
}

export async function createService(
  body: ServiceWriteBody,
): Promise<{ service: ServiceWithStaff }> {
  return apiFetch('/admin/services', { method: 'POST', body });
}

export async function updateService(
  id: string,
  body: Partial<ServiceWriteBody>,
): Promise<{ service: ServiceWithStaff }> {
  return apiFetch(`/admin/services/${id}`, { method: 'PATCH', body });
}

export async function deleteService(id: string): Promise<void> {
  await apiFetch(`/admin/services/${id}`, { method: 'DELETE' });
}
