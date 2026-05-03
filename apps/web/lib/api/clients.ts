// Type-safe wrappers for /admin/clients endpoints. Mirrors the Zod schemas
// in apps/api/src/schemas/client.ts. Kept in sync by hand at MVP — when the
// shared types package fills in, move these to packages/shared.

import { apiFetch } from './client';

export type ClientIntakeStatus = 'pending' | 'sent' | 'completed' | 'expired';

// Compact tag projection returned alongside Client rows for badge rendering.
// Soft-deleted tags are filtered out server-side; matches the shape sent
// by clientService.loadTagsForClients.
export type ClientTagSummary = {
  id: string;
  name: string;
  color: string | null;
};

export type Client = {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string | null;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  intakeStatus: ClientIntakeStatus;
  notes: string | null;
  // Tier A — communication preferences + banned flag.
  smsOptedOut: boolean;
  emailOptedOut: boolean;
  preferredChannel: string;
  banned: boolean;
  bannedReason: string | null;
  bannedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // List + detail responses both include the tag projection.
  tags: ClientTagSummary[];
};

// Detail endpoint augments Client with tagIds (a derived projection of
// client_tag_assignments rows). List rows OMIT this — they only carry
// the display projection in `tags`.
export type ClientWithTags = Client & { tagIds: string[] };

export type DuplicateWarning = {
  matchedByEmail: number;
  matchedByPhone: number;
  matchIds: string[];
};

export type ClientWriteBody = {
  firstName: string;
  lastName?: string;
  preferredName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  intakeStatus?: ClientIntakeStatus;
  notes?: string;
  tagIds?: string[];
};

export type ListClientsResponse = {
  clients: Client[];
  total: number;
};

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
