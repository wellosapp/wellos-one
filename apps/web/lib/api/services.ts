// Type-safe wrappers for /admin/services endpoints. Mirrors the Zod schemas
// in apps/api/src/schemas/service.ts. Kept in sync by hand at MVP — when
// the shared types package fills in, move these to packages/shared.

import { apiFetch } from './client';

export type ServicePriceDisplayMode =
  | 'fixed'
  | 'starting_at'
  | 'range'
  | 'hidden'
  | 'consultation';

/** R2 §11 — booking policy for the public catalog. */
export type BookingPolicy =
  | 'instant'
  | 'request_approval'
  | 'staff_only';

export type ServiceCategorySummary = {
  id: string;
  name: string;
};

export type Service = {
  id: string;
  tenantId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  descriptionShort: string | null;
  durationMinutes: number;
  basePriceCents: number;
  priceDisplayMode: ServicePriceDisplayMode;
  displayOrder: number;
  publicVisible: boolean;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  color: string | null;
  active: boolean;
  bookingPolicy: BookingPolicy;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ServiceWriteBody = {
  name: string;
  description?: string;
  descriptionShort?: string;
  durationMinutes: number;
  basePriceCents: number;
  categoryId?: string | null;
  displayOrder?: number;
  publicVisible?: boolean;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  priceDisplayMode?: ServicePriceDisplayMode;
  color?: string;
  active?: boolean;
  bookingPolicy?: BookingPolicy;
  staffIds?: string[];
};

// Detail endpoint augments Service with staffIds (a derived projection of
// staff_services join rows). List endpoint omits this for performance.
export type ServiceWithStaff = Service & {
  staffIds: string[];
  category: ServiceCategorySummary | null;
};

export type ServiceListItem = Service & {
  category: ServiceCategorySummary | null;
};

export type ListServicesResponse = {
  services: ServiceListItem[];
  total: number;
};

export type ListServicesQuery = {
  q?: string;
  active?: boolean;
  publicVisible?: boolean;
  categoryId?: string;
  take?: number;
  skip?: number;
  includeDeleted?: boolean;
  /** Narrow to services this staff member may perform (join table); omit for full catalog. */
  staffId?: string;
};

export async function listServices(
  query: ListServicesQuery = {},
): Promise<ListServicesResponse> {
  return apiFetch<ListServicesResponse>('/admin/services', {
    searchParams: {
      q: query.q,
      active: query.active,
      publicVisible: query.publicVisible,
      categoryId: query.categoryId,
      take: query.take,
      skip: query.skip,
      includeDeleted: query.includeDeleted,
      staffId: query.staffId,
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
