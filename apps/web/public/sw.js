// Wellos PWA service worker — Phase 1 foundation.
//
// Scope: "/" (registered from app/_pwa/PwaInstallProvider.tsx).
// Strategy: network-first for everything in Phase 1 — no caching yet.
// Admin: hard-skipped via the early-return in `fetch` so admin requests
// never go through SW interception even if /admin somehow ends up under
// scope (defense in depth alongside the pathname guard in the registration
// hook).
//
// PR 4 will fill in cache-first for static assets + an offline fallback
// page. The CACHE_NAME constant and commented branch below are stubs for
// that work.

const CACHE_NAME = 'wellos-shell-v1';

self.addEventListener('install', (event) => {
  // skipWaiting so a refresh after a SW update activates the new worker
  // immediately rather than waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // claim() so the new SW controls already-open clients on activation.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Phase 1: SW is registered with scope "/" but admin surfaces must
  // never go through SW interception. Bypass entirely so admin traffic
  // hits the network and any future caching changes can't accidentally
  // break the admin UI.
  if (url.pathname.startsWith('/admin')) {
    return;
  }

  // Phase 1 = network-first, no caching. PR 4 fills in cache-first for
  // static assets + an offline fallback page using CACHE_NAME.
  event.respondWith(fetch(event.request));

  // Future (PR 4) — cache-first for static assets:
  // if (url.pathname.startsWith('/_next/static/')) {
  //   event.respondWith(
  //     caches.open(CACHE_NAME).then((cache) =>
  //       cache.match(event.request).then((hit) =>
  //         hit ?? fetch(event.request).then((res) => {
  //           cache.put(event.request, res.clone());
  //           return res;
  //         }),
  //       ),
  //     ),
  //   );
  //   return;
  // }
});
