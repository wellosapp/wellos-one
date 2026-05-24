// Type-safe wrapper for GET /admin/clients/:clientId/activity. Mirrors the
// response shape from apps/api/src/services/clientActivityService.ts.
// Kept in sync by hand — when packages/shared fills in, move.

import { apiFetch } from './client';

export type ClientActivityEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorType: string;
  createdAt: string;
};

export type ClientActivityResult = {
  items: ClientActivityEntry[];
  total: number;
};

export type ListClientActivityQuery = {
  take?: number;
  skip?: number;
};

export async function getClientActivity(
  clientId: string,
  query: ListClientActivityQuery = {},
): Promise<ClientActivityResult> {
  return apiFetch<ClientActivityResult>(
    `/admin/clients/${clientId}/activity`,
    {
      searchParams: {
        take: query.take,
        skip: query.skip,
      },
    },
  );
}
