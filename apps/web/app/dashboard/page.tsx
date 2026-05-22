// /dashboard — server-side role router.
//
// Clerk's NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL points here, so
// every signed-in user lands at /dashboard after authentication. This page
// reads the user's roles via getWhoami() and redirects to the role-specific
// home. Per CLAUDE.md hard rule #16, every signed-in user goes to their
// role's home (admin → /admin, staff → /staff → /staff/schedule,
// orphan → /no-access).
//
// Redirect priority (first match wins):
//   1. super_admin OR admin OR manager   →   /admin
//   2. staff                              →   /staff (which redirects to /staff/schedule)
//   3. no recognized role                 →   /no-access
//   4. getWhoami() 401/403 (orphan Clerk  →   /no-access
//      user, revoked role, brand-new
//      sign-up before tenant onboarding)
//
// Signed-out users never reach this page — middleware (apps/web/middleware.ts)
// protects /dashboard(.*) and bounces them to /sign-in first.

import { redirect } from 'next/navigation';

import { ApiError } from '@/lib/api/client';
import { getWhoami } from '@/lib/api/whoami';

// Auth-dependent — must not prerender. The redirect target depends on the
// per-request session.
export const dynamic = 'force-dynamic';

export default async function DashboardRouterPage() {
  let whoami: Awaited<ReturnType<typeof getWhoami>>;

  try {
    whoami = await getWhoami();
  } catch (err) {
    // Orphan Clerk user (signed in but no DB record), revoked role
    // assignment, or brand-new sign-up before tenant onboarding — the
    // API responds 401 (no session-resolved user) or 403 (user exists
    // but has no role in any tenant). Either case is a "no workspace
    // access" scenario; surface the polished /no-access page.
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      redirect('/no-access');
    }
    // Anything else is a genuine error worth bubbling — let Next.js
    // surface it via the nearest error boundary.
    throw err;
  }

  const roles = whoami.user?.roles ?? [];

  // Admin-tier roles share /admin. Capability differences (revenue
  // visibility, impersonate access, etc.) are handled inside /admin
  // surfaces, not at the routing layer.
  if (
    roles.includes('super_admin') ||
    roles.includes('admin') ||
    roles.includes('manager')
  ) {
    redirect('/admin');
  }

  if (roles.includes('staff')) {
    redirect('/staff');
  }

  // Defensive: signed in via Clerk + whoami returned successfully + user
  // has no recognized role. Shouldn't happen given the API enforces
  // requireRole.staff on /admin/whoami, but if backend gating ever loosens
  // we don't want a silent fall-through.
  redirect('/no-access');
}
