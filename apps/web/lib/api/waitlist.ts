// Type-safe wrappers for the waitlist API. Two surfaces:
//
//   • Admin: /admin/waitlist (server-side, Clerk Bearer via apiFetch)
//   • Public: /public/booking/waitlist (no auth; called from a server action
//     using the same pattern as public-booking-server.ts so the secret API
//     URL stays server-side)
//
// Kept in sync by hand with apps/api/src/schemas/waitlist.ts.

import { apiFetch } from './client';

export type WaitlistEntryStatus =
  | 'active'
  | 'offered'
  | 'claimed'
  | 'expired'
  | 'cancelled';

export type WaitlistTimeOfDay = 'morning' | 'afternoon' | 'evening' | 'any';

export type WaitlistEntry = {
  id: string;
  tenantId: string;
  locationId: string;
  serviceId: string;
  staffId: string | null;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  preferredStart: string | null;
  preferredEnd: string | null;
  preferredTimeOfDay: WaitlistTimeOfDay | null;
  smsOptIn: boolean;
  notes: string | null;
  status: WaitlistEntryStatus;
  ttlExpiresAt: string;
  offeredAt: string | null;
  offeredAppointmentId: string | null;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---------- Admin (Clerk Bearer) ----------

export type ListWaitlistResponse = {
  entries: WaitlistEntry[];
  total: number;
  page: number;
  limit: number;
};

export type ListWaitlistQuery = {
  status?: WaitlistEntryStatus;
  serviceId?: string;
  staffId?: string;
  q?: string;
  page?: number;
  limit?: number;
  includeExpired?: boolean;
};

export async function listWaitlistEntries(
  query: ListWaitlistQuery = {},
): Promise<ListWaitlistResponse> {
  return apiFetch<ListWaitlistResponse>('/admin/waitlist', {
    searchParams: {
      status: query.status,
      serviceId: query.serviceId,
      staffId: query.staffId,
      q: query.q,
      page: query.page,
      limit: query.limit,
      includeExpired: query.includeExpired,
    },
  });
}

export async function getWaitlistEntry(
  id: string,
): Promise<{ entry: WaitlistEntry }> {
  return apiFetch<{ entry: WaitlistEntry }>(`/admin/waitlist/${id}`);
}

export async function cancelWaitlistEntry(
  id: string,
): Promise<{ entry: WaitlistEntry }> {
  return apiFetch<{ entry: WaitlistEntry }>(`/admin/waitlist/${id}/cancel`, {
    method: 'POST',
  });
}

export async function offerWaitlistEntry(
  id: string,
  body: { appointmentId?: string } = {},
): Promise<{ entry: WaitlistEntry }> {
  return apiFetch<{ entry: WaitlistEntry }>(`/admin/waitlist/${id}/offer`, {
    method: 'POST',
    body,
  });
}

// ---------- Public (no auth) ----------

const API_BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

export class PublicWaitlistApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Public waitlist API error ${status}`);
    this.name = 'PublicWaitlistApiError';
  }
}

export type CreatePublicWaitlistBody = {
  tenantSlug: string;
  locationId: string;
  serviceId: string;
  staffId?: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  preferredStart?: string;
  preferredEnd?: string;
  preferredTimeOfDay?: WaitlistTimeOfDay;
  smsOptIn: boolean;
  notes?: string;
};

export type CreatePublicWaitlistResult = {
  id: string;
  ttlExpiresAt: string;
  status: WaitlistEntryStatus;
  replacedExisting: boolean;
};

export async function createPublicWaitlistEntry(
  body: CreatePublicWaitlistBody,
): Promise<CreatePublicWaitlistResult> {
  const url = new URL('/public/booking/waitlist', API_BASE);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const parsed: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PublicWaitlistApiError(res.status, parsed);
  }
  return parsed as CreatePublicWaitlistResult;
}
