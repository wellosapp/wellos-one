// Type-safe wrappers for /admin/clients endpoints. Mirrors the Zod schemas
// in apps/api/src/schemas/client.ts. Kept in sync by hand at MVP.
//
// IMPORTANT: this file is server-only-tainted via `apiFetch` (which pulls
// in `@clerk/nextjs/server`). Client components must import TYPES from
// `@/lib/client-shared` instead of from here. We re-export the types
// below so existing server-only callers keep working unchanged.

import { apiFetch } from './client';
import type {
  Client as _Client,
  ClientIntakeStatus,
  ClientMediaResponse,
  ClientStats,
  ClientWithTags,
  ClientWriteBody,
  DuplicateWarning,
} from '../client-shared';

// Re-export types so any module that already imports from `@/lib/api/clients`
// (server actions, server components) keeps compiling without churn.
export type {
  Client,
  ClientIntakeStatus,
  ClientMediaResponse,
  ClientStats,
  ClientTagSummary,
  ClientWithTags,
  ClientWriteBody,
  DuplicateWarning,
} from '../client-shared';
export { formatClientNumber } from '../client-shared';

// ---- API call functions (server-only — these reference apiFetch) ----

export type ListClientsResponse = {
  clients: _Client[];
  total: number;
};

// List-query stays in this file — only used by listClients() so no benefit
// to extracting to client-shared.
export type ListClientsQuery = {
  q?: string;
  intakeStatus?: ClientIntakeStatus;
  take?: number;
  skip?: number;
  includeDeleted?: boolean;
};

export async function listClients(
  query: ListClientsQuery = {},
): Promise<ListClientsResponse> {
  return apiFetch<ListClientsResponse>('/admin/clients', {
    searchParams: {
      q: query.q,
      intakeStatus: query.intakeStatus,
      take: query.take,
      skip: query.skip,
      includeDeleted: query.includeDeleted,
    },
  });
}

export async function getClient(id: string): Promise<{ client: ClientWithTags }> {
  return apiFetch<{ client: ClientWithTags }>(`/admin/clients/${id}`);
}

export async function createClient(
  body: ClientWriteBody,
): Promise<{ client: ClientWithTags; duplicateWarning: DuplicateWarning | null }> {
  return apiFetch('/admin/clients', { method: 'POST', body });
}

export async function updateClient(
  id: string,
  body: Partial<ClientWriteBody>,
): Promise<{ client: ClientWithTags; duplicateWarning: DuplicateWarning | null }> {
  return apiFetch(`/admin/clients/${id}`, { method: 'PATCH', body });
}

export async function deleteClient(id: string): Promise<void> {
  await apiFetch(`/admin/clients/${id}`, { method: 'DELETE' });
}

// ---- E3-S7: aggregate endpoints ----

export async function getClientStats(id: string): Promise<ClientStats> {
  return apiFetch<ClientStats>(`/admin/clients/${id}/stats`);
}

export async function getClientMedia(
  id: string,
): Promise<ClientMediaResponse> {
  return apiFetch<ClientMediaResponse>(`/admin/clients/${id}/media`);
}
