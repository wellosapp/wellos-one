'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import { regenerateStaffCalendarFeed } from '@/lib/api/staff-calendar-sync';

// Server action for the Calendar Feed card on the staff detail page.
// Returns the raw token + subscribe URL exactly once — the API stores
// only a SHA-256 hash, so this is the only time it can be displayed.

export type CalendarFeedActionState = {
  ok: boolean;
  token?: string;
  subscribeUrl?: string;
  error?: string;
};

export async function regenerateCalendarFeedAction(
  staffId: string,
  _prev: CalendarFeedActionState,
  _formData: FormData,
): Promise<CalendarFeedActionState> {
  try {
    const result = await regenerateStaffCalendarFeed(staffId);
    revalidatePath(`/admin/staff/${staffId}`);
    return {
      ok: true,
      token: result.token,
      subscribeUrl: result.subscribeUrl,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 403) {
        return { ok: false, error: 'You do not have admin access to this tenant.' };
      }
      if (err.status === 404) {
        return { ok: false, error: 'Staff not found.' };
      }
      return { ok: false, error: err.message };
    }
    throw err;
  }
}
