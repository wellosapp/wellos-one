'use client';

// Root-level provider for the geofence auto check-in flow (PR 9 of the
// Geofence Auto Check-in epic). Reads stashed bearer tokens from
// localStorage (written by BookClassModal on a successful class booking),
// hits the public eligibility endpoint, requests location permission, and
// polls geolocation every 30 seconds while the document is foregrounded.
// On a successful submit, removes the token and surfaces a "checked in"
// state for the banner.
//
// Gates (cheapest-first; provider noops if any fail):
//   1. `NEXT_PUBLIC_PWA_ENABLED === 'true'`
//   2. Pathname is a client-facing surface (/book, /me, /manage — explicit
//      allowlist matches the spec's surface scope; admin/staff never load).
//
// The provider itself renders only `children` — the banner + permission
// modal are separate components that subscribe via `useGeofenceCheckIn()`.
//
// Polling lifecycle:
//   - On mount: clearExpiredTokens → eligibility check → permission gate
//   - 30s setInterval while polling AND document.visibilityState === 'visible'
//   - getCurrentPosition (enableHighAccuracy: true, timeout: 10s, maxAge: 30s)
//   - submitGeofenceCheckIn with a fresh crypto.randomUUID per attempt
//   - Server-side errors map to specific state transitions
//
// MVP picks the soonest-starting eligible booking when multiple tokens are
// stashed. Multi-booking UX is post-MVP.

import { usePathname } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  GeofenceApiError,
  getUpcomingGeofenceEligible,
  submitGeofenceCheckIn,
  type EligibleBooking,
} from '@/lib/api/geofence-check-in';

import {
  clearExpiredTokens,
  readGeofenceTokens,
  removeGeofenceToken,
  type StoredGeofenceToken,
} from './geofenceTokenStore';

const PWA_ENABLED = process.env.NEXT_PUBLIC_PWA_ENABLED === 'true';

// Pathname allowlist for the banner + provider work. Mirrors the spec:
// client-facing surfaces only; admin/staff never see geofence UX. Public
// landing routes (e.g. `/`) intentionally excluded — the banner only kicks
// in when the user is on a route where a check-in CTA makes sense.
const ALLOWED_PATH_PREFIXES = ['/book', '/me', '/manage'];

function isAllowedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return ALLOWED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// 30s polling cadence per spec.
const POLL_INTERVAL_MS = 30_000;
// 60s pause after a 429 from the server-side rate limiter (3 per 10 min, so
// a 60s wait is comfortably under the window).
const RATE_LIMIT_PAUSE_MS = 60_000;
const GEOLOCATION_TIMEOUT_MS = 10_000;
const GEOLOCATION_MAX_AGE_MS = 30_000;

export type CheckInState =
  | { kind: 'idle' }
  | { kind: 'no-eligible-bookings' }
  | { kind: 'permission-needed'; booking: EligibleBooking }
  | { kind: 'permission-denied'; booking: EligibleBooking }
  | { kind: 'polling'; booking: EligibleBooking; lastError: string | null }
  | { kind: 'checking-in'; booking: EligibleBooking }
  | {
      kind: 'checked-in';
      booking: EligibleBooking;
      checkedInAt: string;
    }
  | {
      kind: 'error';
      booking: EligibleBooking;
      code: string;
      message: string;
      /** Retry is allowed for transient errors only. */
      retryable: boolean;
    };

interface GeofenceCheckInContextValue {
  state: CheckInState;
  /** Trigger getCurrentPosition to open the OS permission prompt + start polling. */
  requestPermissionAndStart: () => void;
  /** Manual "I'm here" fallback — fires an immediate submit. */
  submitManualCheckIn: () => Promise<void>;
  /** Hide the "checked in" success banner. */
  dismissChecked: () => void;
}

// Sentinel default — consumers outside the provider get `null` and the
// hook throws a clear error instead of silently noop-ing.
const GeofenceCheckInContext =
  createContext<GeofenceCheckInContextValue | null>(null);

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers — still good enough to dedupe accidental
  // double-fires within the same session.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function pickSoonestBooking(
  bookings: EligibleBooking[],
): EligibleBooking | null {
  if (bookings.length === 0) return null;
  // Sort by start time ascending; pick the head.
  const sorted = [...bookings].sort(
    (a, b) =>
      Date.parse(a.scheduledStartAt) - Date.parse(b.scheduledStartAt),
  );
  return sorted[0] ?? null;
}

function getCurrentPositionAsync(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation API unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: GEOLOCATION_TIMEOUT_MS,
      maximumAge: GEOLOCATION_MAX_AGE_MS,
    });
  });
}

interface ProviderProps {
  children: ReactNode;
}

export function GeofenceCheckInProvider({ children }: ProviderProps) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<CheckInState>({ kind: 'idle' });

  // The token corresponding to the booking we're actively polling for.
  // Always operates on the soonest booking; cached here so polling ticks
  // don't have to re-read localStorage.
  const activeTokenRef = useRef<StoredGeofenceToken | null>(null);
  // Active booking ref so polling ticks read consistent state without
  // forming a closure over the rendered `state`.
  const activeBookingRef = useRef<EligibleBooking | null>(null);

  // Polling interval handle. Cleared on success / fatal error / unmount.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // setTimeout handle for the rate-limit pause.
  const rateLimitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // runPollingTick is defined below as a useCallback but referenced from
  // handleSubmitError (which sets up the rate-limit resume timer). Storing
  // the latest reference in a ref breaks the would-be cycle.
  const runPollingTickRef = useRef<() => Promise<void>>(async () => undefined);

  // Detect SSR / first paint — every browser-only read fires after this.
  useEffect(() => {
    setMounted(true);
  }, []);

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (rateLimitTimeoutRef.current !== null) {
      clearTimeout(rateLimitTimeoutRef.current);
      rateLimitTimeoutRef.current = null;
    }
  }, []);

  // Centralised handler for submitGeofenceCheckIn rejection bodies. Maps
  // server error codes to state transitions per the spec.
  const handleSubmitError = useCallback(
    (booking: EligibleBooking, err: unknown): void => {
      // Network / non-API errors → silent retry, continue polling.
      if (!(err instanceof GeofenceApiError)) {
        setState((prev) =>
          prev.kind === 'checking-in'
            ? { kind: 'polling', booking, lastError: 'NETWORK' }
            : prev,
        );
        return;
      }

      const body = err.body as { code?: string; message?: string } | null;
      const code =
        typeof body?.code === 'string'
          ? body.code
          : err.status === 429
            ? 'RATE_LIMITED'
            : 'ERROR';
      const message =
        typeof body?.message === 'string'
          ? body.message
          : `Server returned ${err.status}`;

      switch (code) {
        case 'OUT_OF_RANGE':
        case 'LOW_ACCURACY':
        case 'GEOFENCE_NOT_CONFIGURED':
        case 'GEOFENCE_DISABLED':
          // Silent retry — surface as `lastError` for debug visibility.
          setState({ kind: 'polling', booking, lastError: code });
          return;
        case 'OUT_OF_WINDOW':
          // Window has closed — no point continuing. Drop the token.
          stopPolling();
          removeGeofenceToken(booking.bookingId);
          activeTokenRef.current = null;
          activeBookingRef.current = null;
          setState({
            kind: 'error',
            booking,
            code,
            message,
            retryable: false,
          });
          return;
        case 'RATE_LIMITED': {
          // Pause for 60s, then resume polling. We re-install the interval
          // via the ref so we don't form a useCallback cycle.
          stopPolling();
          setState({ kind: 'polling', booking, lastError: code });
          rateLimitTimeoutRef.current = setTimeout(() => {
            rateLimitTimeoutRef.current = null;
            if (intervalRef.current === null) {
              intervalRef.current = setInterval(() => {
                void runPollingTickRef.current();
              }, POLL_INTERVAL_MS);
            }
          }, RATE_LIMIT_PAUSE_MS);
          return;
        }
        case 'TOKEN_EXPIRED':
        case 'TOKEN_REVOKED':
        case 'INVALID_TOKEN':
          stopPolling();
          removeGeofenceToken(booking.bookingId);
          activeTokenRef.current = null;
          activeBookingRef.current = null;
          setState({
            kind: 'error',
            booking,
            code,
            message,
            retryable: false,
          });
          return;
        default:
          // Unknown — surface as a retryable error so the user can tap
          // "I'm here" manually.
          setState({
            kind: 'error',
            booking,
            code,
            message,
            retryable: true,
          });
          return;
      }
    },
    [stopPolling],
  );

  // One polling iteration. Reads activeBookingRef + activeTokenRef so it's
  // stable across setInterval ticks regardless of React state changes.
  const runPollingTick = useCallback(async (): Promise<void> => {
    if (typeof document !== 'undefined' && document.hidden) {
      // Skip ticks while the tab is backgrounded. The visibilitychange
      // listener (below) ensures we resume promptly when foregrounded.
      return;
    }
    const stored = activeTokenRef.current;
    const booking = activeBookingRef.current;
    if (!stored || !booking) return;

    let position: GeolocationPosition;
    try {
      position = await getCurrentPositionAsync();
    } catch {
      // Timeout / permission-blocked / unavailable — silent retry. Surface
      // lastError for debug only.
      setState((prev) =>
        prev.kind === 'polling'
          ? { ...prev, lastError: 'GEOLOCATION' }
          : prev,
      );
      return;
    }

    setState({ kind: 'checking-in', booking });

    try {
      const res = await submitGeofenceCheckIn(
        booking.bookingId,
        stored.token,
        {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: Math.round(position.coords.accuracy ?? 0),
          timestamp: new Date(position.timestamp).toISOString(),
        },
        generateIdempotencyKey(),
      );
      stopPolling();
      removeGeofenceToken(booking.bookingId);
      activeTokenRef.current = null;
      activeBookingRef.current = null;
      setState({
        kind: 'checked-in',
        booking,
        checkedInAt: res.booking.checkedInAt,
      });
    } catch (err) {
      handleSubmitError(booking, err);
    }
  }, [handleSubmitError, stopPolling]);

  // Keep the ref in sync so handleSubmitError's rate-limit-resume timer
  // can fire the current tick implementation.
  useEffect(() => {
    runPollingTickRef.current = runPollingTick;
  }, [runPollingTick]);

  const startPolling = useCallback(
    (booking: EligibleBooking): void => {
      // Clear any existing interval first — defensive in case startPolling
      // gets called twice (e.g. permission re-prompt).
      stopPolling();
      activeBookingRef.current = booking;
      setState({ kind: 'polling', booking, lastError: null });
      // Fire one immediate tick so the user doesn't wait 30s for the first
      // attempt after granting permission.
      void runPollingTick();
      intervalRef.current = setInterval(() => {
        void runPollingTick();
      }, POLL_INTERVAL_MS);
    },
    [runPollingTick, stopPolling],
  );

  // Eligibility check on mount. Runs once per pathname change inside an
  // allowed surface. The provider lives at the root, so a route change
  // does NOT remount us — we re-run this effect to handle the user
  // navigating from /book → /me etc.
  useEffect(() => {
    if (!mounted) return;
    if (!PWA_ENABLED) return;
    if (!isAllowedPath(pathname)) {
      // Outside the client-facing surface — go idle and stop any in-flight
      // polling. The provider effectively noops here.
      stopPolling();
      activeTokenRef.current = null;
      activeBookingRef.current = null;
      setState({ kind: 'idle' });
      return;
    }

    let cancelled = false;

    (async () => {
      clearExpiredTokens();
      const tokens = readGeofenceTokens();
      const tokenEntries = Object.entries(tokens);
      if (tokenEntries.length === 0) {
        if (!cancelled) setState({ kind: 'no-eligible-bookings' });
        return;
      }

      // Hit the eligibility endpoint with the first token. The server-side
      // route returns ALL eligible bookings authenticated by this token;
      // we don't fan-out across every stored token. A typical PWA client
      // only stashes tokens for one tenant.
      const firstEntry = tokenEntries[0];
      if (!firstEntry) {
        if (!cancelled) setState({ kind: 'no-eligible-bookings' });
        return;
      }
      const firstToken = firstEntry[1].token;

      let response;
      try {
        response = await getUpcomingGeofenceEligible(firstToken);
      } catch {
        // Auth failure / network / etc — treat as not eligible for now.
        // The spec calls for the banner to be silent until there's a real
        // check-in opportunity.
        if (!cancelled) setState({ kind: 'no-eligible-bookings' });
        return;
      }
      if (cancelled) return;

      const soonest = pickSoonestBooking(response.eligible);
      if (!soonest) {
        setState({ kind: 'no-eligible-bookings' });
        return;
      }

      // Find the stored token that matches this booking. If we don't have
      // one — odd state, possibly a stale eligible response — bail.
      const matching = tokens[soonest.bookingId];
      if (!matching) {
        setState({ kind: 'no-eligible-bookings' });
        return;
      }
      activeTokenRef.current = matching;
      activeBookingRef.current = soonest;
      setState({ kind: 'permission-needed', booking: soonest });
    })();

    return () => {
      cancelled = true;
    };
  }, [mounted, pathname, stopPolling]);

  // Visibility change — resume polling when the document becomes visible
  // again. (The tick itself bails on document.hidden so background tabs
  // don't fire GPS reads.)
  useEffect(() => {
    if (!mounted) return;
    if (!PWA_ENABLED) return;
    if (typeof document === 'undefined') return;

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      // If we have an active polling cycle, fire one tick immediately so
      // the user doesn't wait up to 30s to be picked up after foregrounding.
      if (intervalRef.current !== null) {
        void runPollingTickRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [mounted]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const requestPermissionAndStart = useCallback(() => {
    const booking = activeBookingRef.current;
    if (!booking) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ kind: 'permission-denied', booking });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        startPolling(booking);
      },
      () => {
        setState({ kind: 'permission-denied', booking });
      },
      {
        enableHighAccuracy: true,
        timeout: GEOLOCATION_TIMEOUT_MS,
        maximumAge: 0,
      },
    );
  }, [startPolling]);

  const submitManualCheckIn = useCallback(async (): Promise<void> => {
    const stored = activeTokenRef.current;
    const booking = activeBookingRef.current;
    if (!stored || !booking) return;

    let position: GeolocationPosition;
    try {
      position = await getCurrentPositionAsync();
    } catch {
      setState((prev) =>
        prev.kind === 'polling'
          ? { ...prev, lastError: 'GEOLOCATION' }
          : prev,
      );
      return;
    }

    setState({ kind: 'checking-in', booking });

    try {
      const res = await submitGeofenceCheckIn(
        booking.bookingId,
        stored.token,
        {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: Math.round(position.coords.accuracy ?? 0),
          timestamp: new Date(position.timestamp).toISOString(),
        },
        generateIdempotencyKey(),
      );
      stopPolling();
      removeGeofenceToken(booking.bookingId);
      activeTokenRef.current = null;
      activeBookingRef.current = null;
      setState({
        kind: 'checked-in',
        booking,
        checkedInAt: res.booking.checkedInAt,
      });
    } catch (err) {
      handleSubmitError(booking, err);
    }
  }, [handleSubmitError, stopPolling]);

  const dismissChecked = useCallback(() => {
    setState((prev) =>
      prev.kind === 'checked-in' ? { kind: 'no-eligible-bookings' } : prev,
    );
  }, []);

  const value = useMemo<GeofenceCheckInContextValue>(
    () => ({
      state,
      requestPermissionAndStart,
      submitManualCheckIn,
      dismissChecked,
    }),
    [state, requestPermissionAndStart, submitManualCheckIn, dismissChecked],
  );

  return (
    <GeofenceCheckInContext.Provider value={value}>
      {children}
    </GeofenceCheckInContext.Provider>
  );
}

export function useGeofenceCheckIn(): GeofenceCheckInContextValue {
  const ctx = useContext(GeofenceCheckInContext);
  if (!ctx) {
    throw new Error(
      'useGeofenceCheckIn must be used inside a <GeofenceCheckInProvider>',
    );
  }
  return ctx;
}
