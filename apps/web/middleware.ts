// Clerk middleware with host-based routing.
//
// `wellos.one` (apex) serves the marketing site. `app.wellos.one` serves the
// app (admin/staff/dashboard). Both are deployed from the same Vercel project
// (`wellos-web`), so the host header is the only signal that distinguishes
// them at the edge.
//
// Apex host → rewrite `/`, `/features`, `/pricing`, etc. to `/marketing/<path>`
// so the same Next.js project serves both surfaces. The user-visible URL stays
// at the apex; Clerk is NOT invoked for marketing routes.
//
// App host → existing behavior — Clerk auth on `/dashboard(.*)` and
// `/admin(.*)`, marketing routes return 404 (they are apex-only).
//
// /monitoring is excluded from the matcher so Sentry's tunnel route
// (next.config.mjs `tunnelRoute`) bypasses auth entirely.
//
// See https://clerk.com/docs/references/nextjs/clerk-middleware

import { NextResponse, type NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// /admin(.*) requires a Clerk session at the edge. Role-based authorization
// (admin vs manager vs staff) is enforced by the Fastify API on every
// /admin/* request — the UI just refuses to render anonymous traffic, then
// trusts the backend's 401/403 envelope downstream.
const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/admin(.*)']);

// Marketing routes are apex-only. Block access on the app host so the
// internal rewrite target isn't crawlable / discoverable on app.wellos.one.
const isMarketingRoute = createRouteMatcher(['/marketing/(.*)']);

// Public-facing marketing slugs at the apex. Each is rewritten to
// /marketing/<slug> while preserving the user-visible URL.
//
// Only routes that have a corresponding page under /marketing/ are listed
// here. The home page (`/`) uses on-page anchors (#features, #how, #pricing)
// so we don't need separate /features or /pricing pages yet.
const APEX_ROUTES = new Set([
  '/',
  '/about',
  '/privacy',
  '/terms',
]);

const APEX_HOSTS = new Set([
  'wellos.one',
  'www.wellos.one',
]);

function isApexRequest(req: NextRequest): boolean {
  // Local opt-in for testing the marketing surface without DNS / host header
  // shenanigans. Set NEXT_PUBLIC_FORCE_MARKETING=1 in apps/web/.env.local to
  // make any local visit behave like an apex visit.
  if (process.env.NEXT_PUBLIC_FORCE_MARKETING === '1') {
    return true;
  }

  // host header is `host:port` — strip the port for matching. Next provides
  // the parsed hostname on req.nextUrl, which is what we want.
  const host = req.headers.get('host')?.split(':')[0]?.toLowerCase() ?? '';
  return APEX_HOSTS.has(host);
}

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  // Apex host → rewrite to the internal /marketing/* tree. Do this BEFORE any
  // auth check; marketing pages don't need Clerk.
  if (isApexRequest(req)) {
    // Block the internal /marketing/* prefix from being addressable directly
    // on the apex — only the friendly slugs are valid public URLs.
    if (pathname.startsWith('/marketing/')) {
      return NextResponse.rewrite(new URL('/__not_found', req.url));
    }

    if (APEX_ROUTES.has(pathname)) {
      const target = pathname === '/' ? '/marketing/home' : `/marketing${pathname}`;
      return NextResponse.rewrite(new URL(target, req.url));
    }

    // Anything else on the apex (e.g. /dashboard, /admin, /sign-in) — let it
    // fall through. In practice DNS will point only wellos.one and
    // www.wellos.one at this project, so users land here via marketing CTAs
    // that link off to app.wellos.one; if they craft a /dashboard URL on the
    // apex we render the app shell, which is fine (Clerk will redirect them
    // to sign-in like normal).
    return NextResponse.next();
  }

  // App host — marketing routes are NOT accessible in production
  // (app.wellos.one shouldn't expose the internal rewrite target). Local dev
  // is allowed to hit /marketing/* directly so designers can preview without
  // an /etc/hosts entry.
  const host = req.headers.get('host')?.split(':')[0]?.toLowerCase() ?? '';
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  if (isMarketingRoute(req) && !isLocalhost) {
    return NextResponse.rewrite(new URL('/__not_found', req.url));
  }

  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|monitoring|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
