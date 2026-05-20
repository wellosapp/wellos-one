// Type-safe wrapper for Epic 7 Phase 5 staff calendar-sync endpoints.
// Mirrors the Zod shape in apps/api/src/routes/admin/staff-calendar-sync.ts.

import { apiFetch } from './client';

export type RegenerateStaffCalendarFeedResponse = {
  subscribeUrl: string;
  token: string;
  message: string;
};

export async function regenerateStaffCalendarFeed(
  staffId: string,
): Promise<RegenerateStaffCalendarFeedResponse> {
  return apiFetch<RegenerateStaffCalendarFeedResponse>(
    `/admin/staff/${staffId}/calendar-feed/regenerate`,
    { method: 'POST' },
  );
}
