import { apiFetch } from './client';

export type ServiceCategory = {
  id: string;
  tenantId: string;
  name: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ListServiceCategoriesQuery = {
  q?: string;
  take?: number;
  skip?: number;
  includeDeleted?: boolean;
};

export type ListServiceCategoriesResponse = {
  categories: ServiceCategory[];
  total: number;
};

export async function listServiceCategories(
  query: ListServiceCategoriesQuery = {},
): Promise<ListServiceCategoriesResponse> {
  return apiFetch<ListServiceCategoriesResponse>('/admin/service-categories', {
    searchParams: {
      q: query.q,
      take: query.take,
      skip: query.skip,
      includeDeleted: query.includeDeleted,
    },
  });
}

export async function createServiceCategory(body: {
  name: string;
  displayOrder?: number;
}): Promise<{ category: ServiceCategory }> {
  return apiFetch('/admin/service-categories', { method: 'POST', body });
}

export async function deleteServiceCategory(id: string): Promise<void> {
  await apiFetch(`/admin/service-categories/${id}`, { method: 'DELETE' });
}
