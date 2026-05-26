'use client';

// /me/permissions — PWA permission visibility surface.
//
// PUBLIC route (no Clerk gate). Permissions live in the browser, not in the
// DB; this page is a thin layer over navigator.permissions.query + a one-
// shot getCurrentPosition trigger for location.
//
// Three rows: notifications, location, camera. Status is read on mount and
// updated live via PermissionStatus.onchange + a visibilitychange listener
// (handles the user bouncing into OS settings and back).
//
// Notification + camera triggers are intentionally inert per spec:
//   - Notifications: deferred until Epic 8 (Web Push). Status shown, button
//     disabled.
//   - Camera: future enhancement (QR-code fallback check-in). "Coming soon"
//     disabled state.
//
// "Reset install prompts" at the bottom clears the per-surface
// wellos.pwa.banner-dismissed.* localStorage keys so users who dismissed
// the install banner can re-summon it. Spec calls this out as a recovery
// hatch — the banner is otherwise permanently dismissed.

import { useCallback, useEffect, useState } from 'react';

import { PermissionRow, type PermissionStatus } from './PermissionRow';

const PWA_ENABLED = process.env.NEXT_PUBLIC_PWA_ENABLED === 'true';

// localStorage keys cleared by "Reset install prompts". Mirrors DISMISS_KEY
// in _pwa/InstallPromptBanner.tsx — kept duplicated rather than imported to
// avoid pulling the whole banner module into this page bundle.
const DISMISS_KEYS = [
  'wellos.pwa.banner-dismissed.booking-confirmation',
  'wellos.pwa.banner-dismissed.returning-client',
];

// Local map of the three permission types we surface — named distinctly
// from the global PermissionState from lib.dom (which is the literal union
// 'granted' | 'denied' | 'prompt').
interface PermissionStateMap {
  notifications: PermissionStatus;
  location: PermissionStatus;
  camera: PermissionStatus;
}

const INITIAL_STATE: PermissionStateMap = {
  notifications: 'unknown',
  location: 'unknown',
  camera: 'unknown',
};

export default function PermissionsPage() {
  const [mounted, setMounted] = useState(false);
  const [statuses, setStatuses] = useState<PermissionStateMap>(INITIAL_STATE);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const refreshAll = useCallback(async () => {
    const [notifications, location, camera] = await Promise.all([
      queryNotifications(),
      queryLocation(),
      queryCamera(),
    ]);
    setStatuses({ notifications, location, camera });
  }, []);

  // Initial read + subscribe to live changes. We attach onchange to each
  // PermissionStatus where the browser supports it; for browsers that
  // don't (older Safari), the visibilitychange listener catches the case
  // where the user bounces into OS settings and returns.
  useEffect(() => {
    if (!mounted) return;
    let cleanups: Array<() => void> = [];
    let cancelled = false;

    (async () => {
      await refreshAll();
      if (cancelled) return;

      cleanups = await subscribeToChanges(refreshAll);
    })();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshAll();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [mounted, refreshAll]);

  const triggerLocation = useCallback(() => {
    // Spec: fire getCurrentPosition just to surface the OS prompt. We
    // intentionally discard the coordinates — Phase 2 of the geofence
    // epic owns actually using location data. The point right now is the
    // permission grant.
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      () => {
        // Permission granted — re-query so the badge updates immediately
        // for browsers that don't fire onchange synchronously.
        void refreshAll();
      },
      () => {
        // Permission denied OR position unavailable. Either way refresh
        // the status so the row reflects reality.
        void refreshAll();
      },
      // Don't ask for high accuracy — we don't need an actual fix, just
      // the prompt to fire. Keep timeout short.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 0 },
    );
  }, [refreshAll]);

  const triggerNotifications = useCallback(() => {
    // Disabled per spec — Epic 8 owns Web Push. No-op.
  }, []);

  const triggerCamera = useCallback(() => {
    // Disabled per spec — future enhancement. No-op.
  }, []);

  const handleResetPrompts = useCallback(() => {
    let removed = 0;
    try {
      for (const key of DISMISS_KEYS) {
        if (window.localStorage.getItem(key) !== null) {
          window.localStorage.removeItem(key);
          removed += 1;
        }
      }
      setResetMessage(
        removed > 0
          ? 'Install prompts reset. They will reappear next time you visit booking.'
          : 'No install prompts were dismissed.',
      );
    } catch {
      setResetMessage(
        'Could not reset install prompts — your browser may have storage disabled.',
      );
    }
  }, []);

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex flex-col gap-s2">
        <span className="t-eyebrow text-accent">Settings</span>
        <h1 className="t-display-xl text-ink">App permissions</h1>
        <p className="t-body-md text-ink-soft">
          Manage what Wellos can do on your device.
        </p>
      </header>

      <ul className="flex flex-col gap-s4">
        <PermissionRow
          type="notifications"
          status={statuses.notifications}
          onTrigger={triggerNotifications}
        />
        <PermissionRow
          type="location"
          status={statuses.location}
          onTrigger={triggerLocation}
        />
        <PermissionRow
          type="camera"
          status={statuses.camera}
          onTrigger={triggerCamera}
        />
      </ul>

      {PWA_ENABLED ? (
        <section className="rounded-2xl border border-surface-3 bg-white p-s5 shadow-sm">
          <div className="flex flex-col gap-s3 sm:flex-row sm:items-center sm:justify-between sm:gap-s4">
            <div className="flex flex-col gap-s1">
              <strong className="t-body-lg font-semibold text-ink">
                Install prompts
              </strong>
              <p className="t-body-sm text-ink-soft">
                Show the &ldquo;Install Wellos&rdquo; banner again next time you
                visit booking.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetPrompts}
              className="self-start rounded-md border border-surface-3 bg-white px-s4 py-s2 t-body-sm font-medium text-ink shadow-sm transition-colors hover:bg-surface-2 focus-visible:shadow-focus focus-visible:outline-none"
            >
              Reset install prompts
            </button>
          </div>
          {resetMessage ? (
            <p
              className="mt-s3 t-body-sm text-ink-soft"
              role="status"
              aria-live="polite"
            >
              {resetMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      <p className="t-body-sm text-ink-soft">
        These permissions live in your browser, not in your Wellos account.
      </p>
    </div>
  );
}

// --- navigator.permissions wrappers ---------------------------------------
//
// navigator.permissions.query is the modern path — supported in Chrome,
// Firefox, Edge, and Safari 16+. For older Safari we fall back to:
//   - Notification.permission (always present in browsers that have
//     Notification API)
//   - 'prompt' for geolocation (no readable status until first trigger)
//   - 'unsupported' for camera (no reliable pre-query path without actually
//     calling getUserMedia, which we don't want to do on page load)

async function queryNotifications(): Promise<PermissionStatus> {
  if (typeof window === 'undefined') return 'unknown';
  if (typeof Notification === 'undefined') return 'unsupported';

  // Try the Permissions API first.
  if (navigator.permissions?.query) {
    try {
      const res = await navigator.permissions.query({ name: 'notifications' });
      return mapPermissionState(res.state);
    } catch {
      // Fall through to the Notification.permission read.
    }
  }

  // Safari fallback.
  switch (Notification.permission) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'default':
      return 'prompt';
    default:
      return 'unknown';
  }
}

async function queryLocation(): Promise<PermissionStatus> {
  if (typeof navigator === 'undefined') return 'unknown';
  if (!navigator.geolocation) return 'unsupported';

  if (navigator.permissions?.query) {
    try {
      const res = await navigator.permissions.query({ name: 'geolocation' });
      return mapPermissionState(res.state);
    } catch {
      // Older Safari throws for 'geolocation' — fall through.
    }
  }

  // No way to read geolocation status before first call on older Safari.
  // Treat as 'prompt' so the row offers the Enable button.
  return 'prompt';
}

async function queryCamera(): Promise<PermissionStatus> {
  if (typeof navigator === 'undefined') return 'unknown';
  // No mediaDevices = no camera API path at all on this browser.
  if (!navigator.mediaDevices) return 'unsupported';

  if (navigator.permissions?.query) {
    try {
      // 'camera' is supported in Chromium but absent from TS lib.dom's
      // PermissionName union — cast through unknown. Firefox + Safari
      // throw on this query; we catch and fall through.
      const res = await navigator.permissions.query({
        name: 'camera' as unknown as PermissionName,
      });
      return mapPermissionState(res.state);
    } catch {
      // Firefox / Safari path. We don't actually start the camera just to
      // read the status — surfacing as 'prompt' would mislead the user into
      // thinking the disabled "Coming soon" button is theirs to enable.
      // 'unknown' renders a neutral "Checking…" badge which is honest.
      return 'unknown';
    }
  }

  return 'unsupported';
}

function mapPermissionState(state: string): PermissionStatus {
  switch (state) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    case 'prompt':
      return 'prompt';
    default:
      return 'unknown';
  }
}

// Subscribe to PermissionStatus.onchange for each queryable permission so
// the page updates live when the user grants/denies via the OS prompt.
// Returns an array of cleanup functions to call on unmount.
async function subscribeToChanges(
  onChange: () => void,
): Promise<Array<() => void>> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return [];
  }

  const cleanups: Array<() => void> = [];

  // 'camera' is Chromium-only and absent from the TS PermissionName union —
  // cast through unknown. Browsers without camera-permission support throw
  // inside the try/catch below.
  const names: PermissionName[] = [
    'notifications',
    'geolocation',
    'camera' as unknown as PermissionName,
  ];

  for (const name of names) {
    try {
      const status = await navigator.permissions.query({ name });
      const handler = () => onChange();
      // PermissionStatus is an EventTarget — addEventListener is the
      // spec-correct path. Older Chrome also exposes onchange = ...;
      // addEventListener works in both.
      status.addEventListener('change', handler);
      cleanups.push(() => status.removeEventListener('change', handler));
    } catch {
      // Permission not supported on this browser — skip.
    }
  }

  return cleanups;
}
