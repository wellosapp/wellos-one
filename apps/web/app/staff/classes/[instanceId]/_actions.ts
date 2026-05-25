'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  checkInClassBooking,
  markNoShowClassBooking,
  revertClassBookingCheckIn,
  setClassInstanceState,
  type ManualClassInstanceState,
} from '@/lib/api/class-bookings';

// Server actions for the staff /staff/classes/[instanceId] roster surface
// (Phase 4 of the Classes epic). Each call invokes the lib wrapper + revalidates
// the instance page so the next render reflects the new state.

export type ActionState = {
  ok: boolean;
  error?: string;
  /** Surfaced when the API returns a typed 409 with a `code` so the UI can
   *  branch on cause (e.g. show "Already checked in" vs a generic conflict). */
  code?: string;
};

function apiErrorToState(err: ApiError): ActionState {
  const body =
    err.body && typeof err.body === 'object'
      ? (err.body as { code?: string; message?: string })
      : null;
  if (err.status === 403) {
    return {
      ok: false,
      error: 'You do not have permission for this action.',
    };
  }
  if (err.status === 404) {
    return { ok: false, error: 'Not found.' };
  }
  return {
    ok: false,
    error: body?.message ?? err.message,
    code: body?.code,
  };
}

function instancePath(instanceId: string): string {
  return `/staff/classes/${instanceId}`;
}

export async function checkInBookingAction(
  instanceId: string,
  bookingId: string,
  late?: boolean,
): Promise<ActionState> {
  try {
    await checkInClassBooking(instanceId, bookingId, { late: late ?? false });
    revalidatePath(instancePath(instanceId));
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
}

export async function markNoShowAction(
  instanceId: string,
  bookingId: string,
): Promise<ActionState> {
  try {
    await markNoShowClassBooking(instanceId, bookingId);
    revalidatePath(instancePath(instanceId));
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
}

export async function revertCheckInAction(
  instanceId: string,
  bookingId: string,
): Promise<ActionState> {
  try {
    await revertClassBookingCheckIn(instanceId, bookingId);
    revalidatePath(instancePath(instanceId));
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
}

export async function setInstanceStateAction(
  instanceId: string,
  state: ManualClassInstanceState,
): Promise<ActionState> {
  try {
    await setClassInstanceState(instanceId, state);
    revalidatePath(instancePath(instanceId));
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) return apiErrorToState(err);
    throw err;
  }
}
