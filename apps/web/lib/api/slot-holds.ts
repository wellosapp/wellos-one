// Public slot-hold wrapper (R2 §9). Used from the booking flow client.
// No Clerk session — these endpoints are anonymous. Runs in the browser.
//
// Mirrors apps/api/src/schemas/slotHold.ts and routes/public/slot-holds.ts.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'https://api.wellos.one';

export type AcquireSlotHoldArgs = {
  tenantSlug: string;
  locationId: string;
  serviceId: string;
  staffId: string;
  /** UTC ISO string with offset, e.g. "2026-05-21T15:00:00.000Z". */
  startsAt: string;
  idempotencyKey?: string;
  fingerprint?: string;
};

export type SlotHoldResponse = {
  holdId: string;
  /** UTC ISO. */
  expiresAt: string;
  startsAt: string;
  endsAt: string;
};

export type SlotHoldErrorBody =
  | {
      error: 'Conflict';
      code: 'SLOT_CONFLICT';
      reason: 'appointment' | 'hold';
      message: string;
    }
  | {
      error: 'Bad Request';
      message: string;
      field?: 'tenantSlug' | 'locationId' | 'serviceId' | 'staffId';
    }
  | {
      error: 'Not Found';
      message: string;
    };

export class SlotHoldApiError extends Error {
  status: number;
  body: SlotHoldErrorBody | null;
  constructor(status: number, body: SlotHoldErrorBody | null, message: string) {
    super(message);
    this.name = 'SlotHoldApiError';
    this.status = status;
    this.body = body;
  }
  isConflict(): boolean {
    return this.status === 409;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    const message =
      parsed && typeof parsed === 'object' && 'message' in parsed
        ? String((parsed as { message: unknown }).message)
        : `Slot hold request failed with status ${res.status}`;
    throw new SlotHoldApiError(res.status, parsed as SlotHoldErrorBody | null, message);
  }
  return parsed as T;
}

export async function acquireSlotHold(
  args: AcquireSlotHoldArgs,
): Promise<SlotHoldResponse> {
  return postJson<SlotHoldResponse>('/public/booking/slot-holds', args);
}

/**
 * Release a hold. Always resolves — the API returns 204 even for unknown ids
 * so the client tear-down path doesn't need to branch on errors.
 */
export async function releaseSlotHold(holdId: string): Promise<void> {
  await fetch(
    `${API_BASE_URL}/public/booking/slot-holds/${encodeURIComponent(holdId)}`,
    { method: 'DELETE' },
  ).catch(() => {
    // Best-effort. Network failures during tear-down don't matter — the
    // server will expire the hold via TTL.
  });
}

/**
 * Stable per-browser fingerprint stored in localStorage. Not a security
 * primitive — just a tiebreaker so the availability engine can hide THIS
 * browser's own active holds from its own slot picker (R2 §9).
 */
const FINGERPRINT_KEY = 'wellos.book.fp';
export function getOrCreateBookingFingerprint(): string {
  if (typeof window === 'undefined') return '';
  const existing = window.localStorage.getItem(FINGERPRINT_KEY);
  if (existing && existing.length >= 8) return existing;
  // crypto.randomUUID is available everywhere we ship (modern Chromium/
  // Firefox/Safari). Strip dashes to stay under the 128 char cap.
  const next = window.crypto.randomUUID().replace(/-/g, '');
  window.localStorage.setItem(FINGERPRINT_KEY, next);
  return next;
}
