'use server';

// Server actions that back the public confirmation page (PR 3 of 3 for
// returning-client recognition). The GET fetch happens in page.tsx
// directly server-side; this file only carries the POST that the
// "This isn't me" modal submits (so we don't ship API_URL to the client).

const API_BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

export type DisputeBranch = 'i_am_new' | 'wrong_person';

export type DisputeMatchActionResult =
  | {
      ok: true;
      branch: DisputeBranch;
      appointmentId: string;
      newClientId?: string;
    }
  | {
      ok: false;
      message: string;
      issues?: Array<{ path: string; message: string }>;
      /** Helps the modal surface specific copy for EMAIL_MISMATCH etc. */
      code?: string;
    };

interface SubmitDisputeArgs {
  appointmentId: string;
  branch: DisputeBranch;
  idempotencyKey: string;
  newClient?: {
    firstName: string;
    lastName?: string;
    email: string;
    phone?: string;
  };
}

/**
 * POST /public/booking/:appointmentId/dispute-match. The API enforces the
 * 30-min window + idempotency; we surface its error messages verbatim
 * because the spec copy lives there.
 */
export async function submitDisputeMatchAction(
  args: SubmitDisputeArgs,
): Promise<DisputeMatchActionResult> {
  const url = new URL(
    `/public/booking/${encodeURIComponent(args.appointmentId)}/dispute-match`,
    API_BASE,
  );
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Idempotency-Key': args.idempotencyKey,
    },
    body: JSON.stringify({
      branch: args.branch,
      ...(args.newClient ? { newClient: args.newClient } : {}),
    }),
    cache: 'no-store',
  });

  const body: unknown = await res.json().catch(() => null);

  if (res.ok) {
    const parsed = body as {
      appointmentId?: string;
      newClientId?: string;
    } | null;
    return {
      ok: true,
      branch: args.branch,
      appointmentId: parsed?.appointmentId ?? args.appointmentId,
      ...(parsed?.newClientId ? { newClientId: parsed.newClientId } : {}),
    };
  }

  const errBody = (body ?? {}) as {
    error?: string;
    message?: string;
    issues?: Array<{ path: string; message: string }>;
  };
  // The API doesn't ship a typed `code` field for dispute errors — it
  // surfaces them via status + message. Map status to a stable identifier
  // so the modal can branch its UI without parsing prose.
  const code = (() => {
    switch (res.status) {
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'ALREADY_DISPUTED';
      case 410:
        return 'WINDOW_EXPIRED';
      case 400:
        return errBody.issues?.[0]?.path === 'newClient.email'
          ? 'EMAIL_MISMATCH'
          : 'BAD_REQUEST';
      default:
        return undefined;
    }
  })();

  return {
    ok: false,
    message:
      typeof errBody.message === 'string'
        ? errBody.message
        : 'Could not submit. Try again.',
    issues: errBody.issues,
    code,
  };
}
