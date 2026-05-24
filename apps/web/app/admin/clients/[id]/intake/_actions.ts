'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  createClientIntakeSubmission,
  patchClientIntakeSubmission,
} from '@/lib/api/intake-forms';

export type ClientIntakeActionState = {
  ok: boolean;
  error?: string;
};

export async function startClientIntakeDraftAction(
  clientId: string,
  definitionId: string,
): Promise<ClientIntakeActionState> {
  if (!definitionId.trim()) {
    return { ok: false, error: 'Choose a published form.' };
  }
  try {
    await createClientIntakeSubmission(clientId, { definitionId });
    revalidatePath(`/admin/clients/${clientId}/intake`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError ? err.message : 'Could not start intake draft.',
    };
  }
}

export async function submitClientIntakeAction(
  clientId: string,
  submissionId: string,
  answers?: Record<string, unknown>,
): Promise<ClientIntakeActionState> {
  try {
    await patchClientIntakeSubmission(clientId, submissionId, {
      ...(answers !== undefined ? { answers } : {}),
      status: 'submitted',
    });
    revalidatePath(`/admin/clients/${clientId}/intake`);
    revalidatePath(`/admin/clients/${clientId}/intake/${submissionId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError ? err.message : 'Could not submit intake.',
    };
  }
}

export async function updateClientIntakeAnswersAction(
  clientId: string,
  submissionId: string,
  answers: Record<string, unknown>,
): Promise<ClientIntakeActionState> {
  try {
    await patchClientIntakeSubmission(clientId, submissionId, { answers });
    revalidatePath(`/admin/clients/${clientId}/intake`);
    revalidatePath(`/admin/clients/${clientId}/intake/${submissionId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError ? err.message : 'Could not save intake draft.',
    };
  }
}
