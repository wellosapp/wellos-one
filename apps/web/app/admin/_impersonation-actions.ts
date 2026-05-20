'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  endImpersonation,
  startImpersonationByEmail,
} from '@/lib/api/impersonate';

// Server actions for the super-admin "Sign in as" flow. Mirrors the
// staff CRUD action shape — { ok, error } so forms can render an
// inline error without a custom hook.

export type ImpersonationStartActionState = {
  ok: boolean;
  error?: string;
};

export async function startImpersonationByEmailAction(
  _prev: ImpersonationStartActionState,
  formData: FormData,
): Promise<ImpersonationStartActionState> {
  const rawEmail = formData.get('targetEmail');
  if (typeof rawEmail !== 'string' || !rawEmail.trim()) {
    return { ok: false, error: 'Enter an email address.' };
  }
  const targetEmail = rawEmail.trim();

  let result;
  try {
    result = await startImpersonationByEmail(targetEmail);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 403) {
        return { ok: false, error: 'You do not have super-admin access.' };
      }
      if (err.status === 404) {
        return { ok: false, error: 'Target user not found.' };
      }
      if (err.status === 409) {
        return {
          ok: false,
          error:
            'This target cannot be impersonated yet — magic-link client impersonation ships in a later phase.',
        };
      }
      return { ok: false, error: err.message };
    }
    throw err;
  }

  if (!result.url) {
    return {
      ok: false,
      error:
        'Clerk did not return a sign-in URL. Check Clerk dashboard configuration for actor tokens.',
    };
  }

  // Redirect the browser to Clerk's hosted sign-in URL. Clerk handles the
  // ticket exchange, sets the new session cookies (now with the actor
  // claim), and redirects back to the configured fallback URL — usually
  // /dashboard. The super-admin is now signed in as the target.
  redirect(result.url);
}

export type ImpersonationEndActionState = {
  ok: boolean;
  error?: string;
};

export async function endImpersonationAction(): Promise<void> {
  try {
    await endImpersonation();
  } catch (err) {
    if (err instanceof ApiError) {
      // Swallow — the audit row may not have been written, but we still
      // want to take the user out of the impersonation session client-side.
      // A failed end should not strand them as the impersonated user.
      console.error('endImpersonation API call failed:', err.message);
    } else {
      throw err;
    }
  }

  // The actual session swap-back is client-side via Clerk JS — see
  // ImpersonationBanner. We just clear the cached active state.
  revalidatePath('/admin', 'layout');
}
