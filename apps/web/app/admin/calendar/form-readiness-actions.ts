'use server';

import { ApiError } from '@/lib/api/client';
import {
  getServiceFormReadiness,
  type FormReadinessResult,
} from '@/lib/api/form-readiness';

// PR 8 — Server action wrapper for form-readiness reads. Bookmark for the
// Quick Book chip + admin client-book chip. Calling the API client directly
// from a client component would drag the Clerk server token into the bundle.

export type FormReadinessActionResult =
  | { ok: true; readiness: FormReadinessResult }
  | { ok: false; error: string };

export async function getServiceFormReadinessAction(args: {
  serviceId: string;
  clientId: string;
}): Promise<FormReadinessActionResult> {
  try {
    const readiness = await getServiceFormReadiness(args.serviceId, args.clientId);
    return { ok: true, readiness };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof Error) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: 'Unknown error.' };
  }
}
