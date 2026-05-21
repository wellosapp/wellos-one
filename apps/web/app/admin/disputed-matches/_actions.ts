'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import { listClients, type Client } from '@/lib/api/clients';

import { resolveDisputedMatch } from './_api';

// Server actions for the disputed-matches admin queue.
//
// dismiss + reassign both POST to /admin/disputed-matches/:id/resolve.
// 404s are treated as soft success (row already resolved by another tab).

export type ResolveActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function dismissDisputedMatchAction(
  appointmentId: string,
): Promise<ResolveActionResult> {
  try {
    await resolveDisputedMatch(appointmentId, { action: 'dismiss' });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Already resolved — treat as success.
    } else if (err instanceof ApiError) {
      return { ok: false, error: err.message };
    } else {
      throw err;
    }
  }
  revalidatePath('/admin/disputed-matches');
  return { ok: true };
}

export async function reassignDisputedMatchAction(
  appointmentId: string,
  targetClientId: string,
): Promise<ResolveActionResult> {
  try {
    await resolveDisputedMatch(appointmentId, {
      action: 'reassign_to_client',
      targetClientId,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Already resolved — treat as success.
    } else if (err instanceof ApiError) {
      return { ok: false, error: err.message };
    } else {
      throw err;
    }
  }
  revalidatePath('/admin/disputed-matches');
  return { ok: true };
}

export type ClientSearchResult = {
  clients: Client[];
  error?: string;
};

export async function searchClientsForReassignAction(
  q: string,
): Promise<ClientSearchResult> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return { clients: [] };
  try {
    const result = await listClients({ q: trimmed, take: 12 });
    return { clients: result.clients };
  } catch (err) {
    if (err instanceof ApiError) {
      return { clients: [], error: err.message };
    }
    throw err;
  }
}
