'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  cancelWaitlistEntry,
  offerWaitlistEntry,
} from '@/lib/api/waitlist';

// Server actions for admin waitlist row-level operations. Both routes are
// idempotent at the API layer; we still treat 404 as a soft success so a
// double-click doesn't bubble a scary error.

export async function cancelWaitlistAction(id: string): Promise<void> {
  try {
    await cancelWaitlistEntry(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Already gone — treat as success.
    } else {
      throw err;
    }
  }
  revalidatePath('/admin/waitlist');
  revalidatePath(`/admin/waitlist/${id}`);
}

export async function offerWaitlistAction(id: string): Promise<void> {
  try {
    await offerWaitlistEntry(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Already gone — treat as success.
    } else {
      throw err;
    }
  }
  revalidatePath('/admin/waitlist');
  revalidatePath(`/admin/waitlist/${id}`);
}

export async function cancelWaitlistFromDetailAction(
  id: string,
): Promise<void> {
  try {
    await cancelWaitlistEntry(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Already gone — treat as success.
    } else {
      throw err;
    }
  }
  revalidatePath('/admin/waitlist');
  redirect('/admin/waitlist');
}
