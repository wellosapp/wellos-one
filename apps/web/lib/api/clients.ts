// Type-safe wrappers for /admin/clients endpoints. Mirrors the Zod schemas
// in apps/api/src/schemas/client.ts. Kept in sync by hand at MVP — when the
// shared types package fills in, move these to packages/shared.

import { apiFetch } from './client';

export type ClientIntakeStatus = 'pending' | 'sent' | 'completed' | 'expired';

export type Client = {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string | null;
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
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type DuplicateWarning = {
  matchedByEmail: number;
  matchedByPhone: number;
  matchIds: string[];
};

export type ClientWriteBody = {
  firstName: string;
  lastName?: string;
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

export async function getClient(id: string): Promise<{ client: Client }> {
  return apiFetch<{ client: Client }>(`/admin/clients/${id}`);
}

export async function createClient(
  body: ClientWriteBody,
): Promise<{ client: Client; duplicateWarning: DuplicateWarning | null }> {
  return apiFetch('/admin/clients', { method: 'POST', body });
}

export async function updateClient(
  id: string,
  body: Partial<ClientWriteBody>,
): Promise<{ client: Client; duplicateWarning: DuplicateWarning | null }> {
  return apiFetch(`/admin/clients/${id}`, { method: 'PATCH', body });
}

export async function deleteClient(id: string): Promise<void> {
  await apiFetch(`/admin/clients/${id}`, { method: 'DELETE' });
}
