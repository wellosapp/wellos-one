'use client';

// Registers /sw.js on mount when the PWA feature flag is on and the user
// isn't on an admin route. Mounted from the root layout (app/layout.tsx)
// so it runs once per session regardless of which route loads first.
//
// Two layers of defense against admin getting the SW:
//   1. This hook short-circuits when pathname starts with /admin.
//   2. /apps/web/public/sw.js itself early-returns from `fetch` for
//      /admin paths — so even if a different surface registered the SW
//      and the user then navigates to /admin, the SW won't intercept.
//
// Phase 1 only logs success/failure to console. PR 4 may wire a PostHog
// event once we plumb that.

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const PWA_ENABLED = process.env.NEXT_PUBLIC_PWA_ENABLED === 'true';

export function RegisterServiceWorker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!PWA_ENABLED) return;
    if (pathname?.startsWith('/admin')) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Intentional console — no telemetry plumbing yet. PR 4 can
        // replace with a PostHog event once that surface is wired.
        // eslint-disable-next-line no-console
        console.info('[PWA] Service worker registered', reg.scope);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[PWA] Service worker registration failed', err);
      });
  }, [pathname]);

  return null;
}
