'use client';

// Browser-only localStorage helpers for stashing geofence check-in tokens
// minted by the public class booking flow (PR 8b). PR 9's
// GeofenceCheckInProvider reads from / writes to this store.
//
// Shape — `wellos.geofence-tokens` is a JSON object keyed by class-booking
// id so a single client can have multiple upcoming bookings stashed without
// clobbering each other:
//
//   {
//     "<bookingId>": {
//       "token": "<raw bearer token>",
//       "expiresAt": "<ISO>",
//       "classInstanceId": "<uuid>",
//       "className": "Vinyasa Flow"   // optional, for banner copy
//     },
//     ...
//   }
//
// Browser-only. Every function early-returns when `window` is undefined so
// SSR / RSC boundaries don't blow up. localStorage failures (private mode,
// quota, disabled storage) are swallowed — geofence check-in is a best-
// effort convenience layer, not load-bearing.

const STORAGE_KEY = 'wellos.geofence-tokens';

export interface StoredGeofenceToken {
  token: string;
  /** ISO timestamp. Past values are pruned by clearExpiredTokens(). */
  expiresAt: string;
  classInstanceId: string;
  /** Optional display name for banner copy when off the /book page. */
  className?: string;
}

type TokenMap = Record<string, StoredGeofenceToken>;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function safeParse(raw: string | null): TokenMap {
  if (raw === null) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') return {};
    // Filter to entries that look right — defensive against an older shape.
    const out: TokenMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        v !== null &&
        typeof v === 'object' &&
        'token' in v &&
        'expiresAt' in v &&
        'classInstanceId' in v
      ) {
        const candidate = v as Record<string, unknown>;
        if (
          typeof candidate.token === 'string' &&
          typeof candidate.expiresAt === 'string' &&
          typeof candidate.classInstanceId === 'string'
        ) {
          out[k] = {
            token: candidate.token,
            expiresAt: candidate.expiresAt,
            classInstanceId: candidate.classInstanceId,
            className:
              typeof candidate.className === 'string'
                ? candidate.className
                : undefined,
          };
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

function safeWrite(map: TokenMap): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // private mode, quota, disabled storage — silently no-op.
  }
}

export function readGeofenceTokens(): TokenMap {
  if (!isBrowser()) return {};
  try {
    return safeParse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

export function writeGeofenceToken(
  bookingId: string,
  value: StoredGeofenceToken,
): void {
  if (!isBrowser()) return;
  const next = readGeofenceTokens();
  next[bookingId] = value;
  safeWrite(next);
}

export function removeGeofenceToken(bookingId: string): void {
  if (!isBrowser()) return;
  const next = readGeofenceTokens();
  if (!(bookingId in next)) return;
  delete next[bookingId];
  safeWrite(next);
}

export function clearExpiredTokens(): void {
  if (!isBrowser()) return;
  const current = readGeofenceTokens();
  const now = Date.now();
  let dirty = false;
  for (const [bookingId, entry] of Object.entries(current)) {
    const expiry = Date.parse(entry.expiresAt);
    if (Number.isFinite(expiry) && expiry < now) {
      delete current[bookingId];
      dirty = true;
    }
  }
  if (dirty) safeWrite(current);
}
