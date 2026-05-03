// Wrapper for /admin/whoami — auth + tenant + locations + optional Staff row
// linked by Work email. Used by calendars for default location and staff
// schedule identity.

import { apiFetch } from './client';
import type { Staff } from './staff';

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
  /** Present when the signed-in user's email matches an active Staff row. */
  staffMember: Staff | null;
};

export async function getWhoami(): Promise<WhoamiResponse> {
  return apiFetch<WhoamiResponse>('/admin/whoami');
}
