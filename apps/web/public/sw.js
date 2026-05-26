// Wellos PWA service worker — PR 4: caching strategy + offline fallback.
//
// Scope: "/" (registered from app/_pwa/PwaInstallProvider.tsx).
//
// Strategies, by request:
//   - /admin/*                   bypass SW entirely (defense in depth alongside
//                                the pathname guard in the registration hook).
//   - /api/*                     network-only, never cached.
//   - /_next/static/*, /icons/*,
//     /manifest.json             cache-first with stale-while-revalidate.
//   - navigations (HTML)         network-first, fall back to /offline.html.
//   - everything else            pass through to the network (no respondWith).
//
// Cache versioning: bump CACHE_NAME on every shape change. The activate
// handler purges any cache that doesn't match the current name, so a single
// SW update cleans out stale shells.
//
// We never cache /sw.js itself — if we did, we couldn't update the SW.

const CACHE_NAME = 'wellos-shell-v2';

const PRECACHE_URLS = [
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.png',
];

self.addEventListener('install', (event) => {
  // skipWaiting so a refresh after a SW update activates the new worker
  // immediately rather than waiting for every tab to close.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Purge any cache from a prior CACHE_NAME version.
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      ),
      // claim() so the new SW controls already-open clients on activation.
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Same-origin only — never intercept cross-origin requests (CDNs, analytics,
  // Clerk, Supabase, etc.).
  if (url.origin !== self.location.origin) return;

  // Admin surfaces never go through the SW (defense in depth alongside the
  // skip in PwaInstallProvider).
  if (url.pathname.startsWith('/admin')) return;

  // API calls: always fresh, never cached. If it fails, let the caller deal.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Static assets: cache-first with background refresh.
  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json';

  if (isStatic) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation requests (HTML page loads): network-first with offline fallback.
  const acceptsHtml = request.headers.get('accept')?.includes('text/html');
  const isNavigation =
    request.mode === 'navigate' || (request.method === 'GET' && acceptsHtml);

  if (isNavigation) {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // Everything else: don't call respondWith — let the browser handle it
  // normally. The SW is invisible for these requests.
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    // Background refresh — fire and forget so the next visit gets the latest.
    fetch(request)
      .then((resp) => {
        if (resp && resp.ok) cache.put(request, resp.clone());
      })
      .catch(() => {
        // Network failure is fine — the cached copy already served the user.
      });
    return cached;
  }

  // Not cached yet — fetch, cache on success, return.
  const resp = await fetch(request);
  if (resp && resp.ok) {
    cache.put(request, resp.clone());
  }
  return resp;
}

async function networkFirstWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch (_err) {
    const cache = await caches.open(CACHE_NAME);
    const offline = await cache.match('/offline.html');
    if (offline) return offline;
    // Last resort if even /offline.html isn't cached: a hardcoded HTML
    // response so the browser never shows its raw "offline" chrome.
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title><h1>You’re offline</h1>',
      {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    );
  }
}

// --- Web Push (Epic 8 stubs) ---------------------------------------------
//
// Registered now so the SW exposes the right event listeners when Epic 8
// wires the backend. Both handlers are intentionally empty until then.

self.addEventListener('push', (_event) => {
  // TODO(epic-8): parse _event.data?.json() and call
  // self.registration.showNotification(title, options).
});

self.addEventListener('notificationclick', (event) => {
  // TODO(epic-8): focusing an existing client or opening one to the
  // notification's URL. For now just close so the OS clears the notification.
  event.notification.close();
});
