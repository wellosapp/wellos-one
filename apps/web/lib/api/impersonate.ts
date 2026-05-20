// Wrappers for /admin/impersonate/* endpoints. Mirrors the Zod shapes
// in apps/api/src/routes/admin/impersonate.ts.

import { apiFetch } from './client';

export type ImpersonationTarget = {
  id: string;
  clerkUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

export type StartImpersonationResponse = {
  actorTokenId: string;
  token: string;
  // Clerk-hosted sign-in URL that handles the actor-token ticket. Browser
  // should redirect here to perform the session swap.
  url: string | null;
  // ISO timestamp; the token expires this fast — exchange immediately.
  expiresAt: string;
  target: ImpersonationTarget;
};

export type ImpersonationActiveResponse =
  | { active: false }
  | {
      active: true;
      actor: { id: string; email: string; roles: string[] };
      subject: { id: string; email: string; roles: string[] };
    };

export type StartImpersonationOptions = {
  sessionMaxDurationInSeconds?: number;
};

export async function startImpersonationByUserId(
  targetUserId: string,
  options: StartImpersonationOptions = {},
): Promise<StartImpersonationResponse> {
  return apiFetch<StartImpersonationResponse>('/admin/impersonate/start', {
    method: 'POST',
    body: { targetUserId, ...options },
  });
}

export async function startImpersonationByEmail(
  targetEmail: string,
  options: StartImpersonationOptions = {},
): Promise<StartImpersonationResponse> {
  return apiFetch<StartImpersonationResponse>('/admin/impersonate/start', {
    method: 'POST',
    body: { targetEmail, ...options },
  });
}

export async function getImpersonationActive(): Promise<ImpersonationActiveResponse> {
  return apiFetch<ImpersonationActiveResponse>('/admin/impersonate/active');
}

export async function endImpersonation(): Promise<{
  active: false;
  endedAt?: string;
}> {
  return apiFetch<{ active: false; endedAt?: string }>(
    '/admin/impersonate/end',
    { method: 'POST' },
  );
}
