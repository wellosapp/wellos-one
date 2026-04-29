// Clerk middleware. Default: routes are PUBLIC unless explicitly protected.
// /dashboard(.*) is gated; /, /sign-in, /sign-up stay public.
//
// /monitoring is excluded from the matcher so Sentry's tunnel route
// (next.config.mjs `tunnelRoute`) bypasses auth entirely.
//
// Sub-step 6 will extend isProtectedRoute with role-claim checks.
//
// See https://clerk.com/docs/references/nextjs/clerk-middleware

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// /admin(.*) requires a Clerk session at the edge. Role-based authorization
// (admin vs manager vs staff) is enforced by the Fastify API on every
// /admin/* request — the UI just refuses to render anonymous traffic, then
// trusts the backend's 401/403 envelope downstream.
const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/admin(.*)']);

export default clerkMiddleware(async (auth, req) => {
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
