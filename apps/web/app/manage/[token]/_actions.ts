'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import {
  ManageApiError,
  cancelByMagicLink,
  rescheduleByMagicLink,
  type CancelManageResult,
  type ManageApiErrorCode,
  type RescheduleManageResult,
} from './_api';

export type ActionFailure = {
  ok: false;
  code: ManageApiErrorCode;
  message: string;
};

export type CancelActionResult =
  | { ok: true; result: CancelManageResult }
  | ActionFailure;

export type RescheduleActionResult =
  | { ok: true; result: RescheduleManageResult }
  | ActionFailure;

function toFailure(err: unknown): ActionFailure {
  if (err instanceof ManageApiError) {
    return { ok: false, code: err.code, message: err.message };
  }
  return {
    ok: false,
    code: 'UNKNOWN',
    message: 'Something went wrong. Try again.',
  };
}

export async function cancelManageAction(args: {
  token: string;
  reason?: string;
}): Promise<CancelActionResult> {
  try {
    const result = await cancelByMagicLink({
      token: args.token,
      reason: args.reason?.trim() || undefined,
      idempotencyKey: randomUUID(),
    });
    // Refresh the server-rendered view so the post-action page reflects the
    // new state if the user navigates back without a hard reload.
    revalidatePath(`/manage/${args.token}`);
    return { ok: true, result };
  } catch (err) {
    return toFailure(err);
  }
}

export async function rescheduleManageAction(args: {
  token: string;
  newScheduledStartAt: string;
}): Promise<RescheduleActionResult> {
  try {
    const result = await rescheduleByMagicLink({
      token: args.token,
      newScheduledStartAt: args.newScheduledStartAt,
      idempotencyKey: randomUUID(),
    });
    revalidatePath(`/manage/${args.token}`);
    return { ok: true, result };
  } catch (err) {
    return toFailure(err);
  }
}
