// Public form completion entry — PR 7 of the Forms System epic.
//
// Server component. Fetches the form payload via the magic-link token
// (purpose='form_submission'), then branches into:
//   - submitted   → FormReadOnlyView      (already done — show captured answers)
//   - else        → FormCompletionView    (interactive filler)
//   - error       → FormErrorState        (token expired / cancelled / etc.)
//
// No Clerk gate — magic-link clients aren't signed in. Tenant scope and
// identity flow entirely through the token + the API's middleware.

import { ApiError } from '@/lib/api/client';
import { getPublicForm } from '@/lib/api/public-forms';

import { FormCompletionView } from './FormCompletionView';
import { FormErrorState } from './FormErrorState';
import { FormReadOnlyView } from './FormReadOnlyView';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function PublicFormPage({ params }: PageProps) {
  const { token } = await params;

  // Defensive shape check — the API also rejects malformed tokens with a
  // 401, but bouncing locally saves a round-trip and short-circuits
  // bot-traffic to the API.
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return <FormErrorState code="MALFORMED_TOKEN" />;
  }

  try {
    const data = await getPublicForm(token);

    if (data.submission.status === 'submitted') {
      return <FormReadOnlyView data={data} />;
    }
    return <FormCompletionView token={token} data={data} />;
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { code?: string; message?: string } | null;
      const code = typeof body?.code === 'string' ? body.code : 'UNKNOWN';
      return <FormErrorState code={code} message={body?.message ?? err.message} />;
    }
    return <FormErrorState code="UNKNOWN" message="Could not load this form." />;
  }
}
