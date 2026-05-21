// Type-safe wrappers for /admin/disputed-matches endpoints. Mirrors the Zod
// schemas in apps/api/src/schemas/clientMatch.ts and the response shape in
// apps/api/src/routes/admin/disputed-matches.ts. Local to this page until a
// shared types package exists.
//
// Auth: admin Clerk Bearer via apiFetch (server-side only).

import { apiFetch } from '@/lib/api/client';

export type ClientMatchStrength = 'strong' | 'weak' | 'name_only' | 'ambiguous';

export type AppointmentState =
  | 'scheduled'
  | 'requested'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type DisputedMatchRow = {
  appointmentId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  state: AppointmentState;
  matchStrength: ClientMatchStrength | null;
  clientMatchDisputed: boolean;
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
  staffReviewedAt: string | null;
  createdAt: string;
};

export type ListDisputedMatchesResponse = {
  rows: DisputedMatchRow[];
  nextCursor: string | null;
};

export type ListDisputedMatchesQuery = {
  cursor?: string;
  limit?: number;
  includeResolved?: boolean;
};

export async function listDisputedMatches(
  query: ListDisputedMatchesQuery = {},
): Promise<ListDisputedMatchesResponse> {
  return apiFetch<ListDisputedMatchesResponse>('/admin/disputed-matches', {
    searchParams: {
      cursor: query.cursor,
      limit: query.limit,
      includeResolved: query.includeResolved,
    },
  });
}

export type ResolveDisputedMatchBody =
  | { action: 'dismiss' }
  | { action: 'reassign_to_client'; targetClientId: string };

export type ResolveDisputedMatchResponse = {
  appointmentId: string;
  action: 'dismiss' | 'reassign_to_client';
  clientId: string;
};

export async function resolveDisputedMatch(
  appointmentId: string,
  body: ResolveDisputedMatchBody,
): Promise<ResolveDisputedMatchResponse> {
  return apiFetch<ResolveDisputedMatchResponse>(
    `/admin/disputed-matches/${appointmentId}/resolve`,
    { method: 'POST', body },
  );
}
