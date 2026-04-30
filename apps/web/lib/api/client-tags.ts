// Type-safe wrappers for /admin/client-tags endpoints. Mirrors the Zod
// schemas in apps/api/src/schemas/clientTag.ts. Kept in sync by hand at
// MVP — when the shared types package fills in, move these to
// packages/shared.

import { apiFetch } from './client';

export type ClientTag = {
  id: string;
  tenantId: string;
  name: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ClientTagWriteBody = {
  name: string;
  color?: string;
};

export type ListClientTagsResponse = {
  tags: ClientTag[];
  total: number;
};

export type ListClientTagsQuery = {
  q?: string;
  take?: number;
  skip?: number;
  includeDeleted?: boolean;
};

export async function listClientTags(
  query: ListClientTagsQuery = {},
): Promise<ListClientTagsResponse> {
  return apiFetch<ListClientTagsResponse>('/admin/client-tags', {
    searchParams: {
      q: query.q,
      take: query.take,
      skip: query.skip,
      includeDeleted: query.includeDeleted,
    },
  });
}

export async function getClientTag(
  id: string,
): Promise<{ tag: ClientTag }> {
  return apiFetch<{ tag: ClientTag }>(`/admin/client-tags/${id}`);
}

export async function createClientTag(
  body: ClientTagWriteBody,
): Promise<{ tag: ClientTag }> {
  return apiFetch('/admin/client-tags', { method: 'POST', body });
}

export async function updateClientTag(
  id: string,
  body: Partial<ClientTagWriteBody>,
): Promise<{ tag: ClientTag }> {
  return apiFetch(`/admin/client-tags/${id}`, { method: 'PATCH', body });
}

export async function deleteClientTag(id: string): Promise<void> {
  await apiFetch(`/admin/client-tags/${id}`, { method: 'DELETE' });
}
