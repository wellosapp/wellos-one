'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  cancelIntakeFormSubmission,
  createClientIntakeSubmission,
  patchClientIntakeSubmission,
  sendIntakeFormSubmission,
  type FormDeliveryChannel,
} from '@/lib/api/intake-forms';

export type ClientIntakeActionState = {
  ok: boolean;
  error?: string;
};

export type SendClientIntakeActionState =
  | { ok: true; url: string; channels: string[]; resolvedChannel: FormDeliveryChannel }
  | { ok: false; error: string };

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

export async function sendClientIntakeAction(
  clientId: string,
  submissionId: string,
  deliveryChannel?: FormDeliveryChannel,
): Promise<SendClientIntakeActionState> {
  try {
    const res = await sendIntakeFormSubmission(
      submissionId,
      deliveryChannel ? { deliveryChannel } : undefined,
    );
    revalidatePath(`/admin/clients/${clientId}/intake`);
    revalidatePath(`/admin/clients/${clientId}/intake/${submissionId}`);
    return {
      ok: true,
      url: res.url,
      channels: res.channels,
      resolvedChannel: res.resolvedChannel,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError ? err.message : 'Could not send intake form.',
    };
  }
}

export async function cancelClientIntakeAction(
  clientId: string,
  submissionId: string,
  reason?: string,
): Promise<ClientIntakeActionState> {
  try {
    await cancelIntakeFormSubmission(submissionId, reason);
    revalidatePath(`/admin/clients/${clientId}/intake`);
    revalidatePath(`/admin/clients/${clientId}/intake/${submissionId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError ? err.message : 'Could not cancel intake form.',
    };
  }
}
