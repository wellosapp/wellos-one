// /staff — thin server-side router.
//
// Future staff-facing surfaces (clients, messages, settings, etc.) will live
// under /staff/*. Today, the only staff surface is /staff/schedule. Rather
// than hardcode that URL in /dashboard's role router, /dashboard sends
// staff to /staff and this page resolves the canonical landing.
//
// When more staff sub-routes ship and "what should staff see first?" becomes
// a real question, the logic lands here (e.g., default to /staff/schedule
// during work hours, /staff/clients otherwise).

import { redirect } from 'next/navigation';

// Auth-dependent route resolution lands here eventually, so disable static
// rendering preemptively.
export const dynamic = 'force-dynamic';

export default function StaffRouterPage() {
  redirect('/staff/schedule');
}
