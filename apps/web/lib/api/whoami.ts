// Wrapper for /admin/whoami — proves auth + returns the tenant + active
// locations. Used by the calendar to resolve the default locationId for
// Quick Book without forcing the operator to pick on every booking.

import { apiFetch } from './client';

export type WhoamiLocation = {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
};

export type WhoamiTenant = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type WhoamiResponse = {
  user: {
    id: string;
    tenantId: string | null;
    roles: string[];
  };
  tenant: WhoamiTenant | null;
  roles: string[];
  locations: WhoamiLocation[];
};

export async function getWhoami(): Promise<WhoamiResponse> {
  return apiFetch<WhoamiResponse>('/admin/whoami');
}
