import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

import { ApiError } from '@/lib/api/client';
import { getImpersonationActive } from '@/lib/api/impersonate';
import { getOnboardingStatus } from '@/lib/api/onboarding';

import { ImpersonationBanner } from './ImpersonationBanner';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side fetch of impersonation state so the banner renders on the
  // first paint, not after a client-side flash. If the API call fails
  // (e.g. local dev with API down), swallow and hide the banner — no UI
  // breakage for a missing observability surface.
  let impersonation: Awaited<ReturnType<typeof getImpersonationActive>> | null =
    null;
  try {
    impersonation = await getImpersonationActive();
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    // 401 here just means the layout was rendered server-side without a
    // session (e.g. middleware redirect race). Hide the banner gracefully.
  }

  let devOnboardingHint: string | null = null;
  if (process.env.NODE_ENV === 'development') {
    try {
      const s = await getOnboardingStatus();
      if (s.status === 'not_configured') {
        devOnboardingHint = s.message;
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `API ${err.status}: ${err.message}`
          : 'Could not reach onboarding status.';
      devOnboardingHint = msg;
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {impersonation?.active && (
        <ImpersonationBanner
          actor={{ email: impersonation.actor.email }}
          subject={{ email: impersonation.subject.email }}
        />
      )}
      {devOnboardingHint ? (
        <div
          className="border-b border-amber/30 bg-amber-pale/80 px-s8 py-s2 t-caption text-amber-950"
          role="status"
        >
          <span className="font-semibold">Dev</span> —{' '}
          <code className="rounded bg-white/60 px-s1">GET /admin/onboarding/status</code>
          : {devOnboardingHint}
        </div>
      ) : null}
      <header className="flex items-center justify-between border-b border-surface-3 bg-white/70 px-s8 py-s4 backdrop-blur">
        <nav className="flex items-center gap-s8">
          <Link
            href="/admin"
            className="t-display-sm font-display text-ink no-underline"
          >
            Wellos Admin
          </Link>
          <Link
            href="/admin/calendar"
            className="t-body-md text-ink-soft no-underline transition-colors duration-fast hover:text-ink"
          >
            Calendar
          </Link>
          <Link
            href="/admin/clients"
            className="t-body-md text-ink-soft no-underline transition-colors duration-fast hover:text-ink"
          >
            Clients
          </Link>
          <Link
            href="/admin/client-tags"
            className="t-body-md text-ink-soft no-underline transition-colors duration-fast hover:text-ink"
          >
            Tags
          </Link>
          <Link
            href="/admin/services"
            className="t-body-md text-ink-soft no-underline transition-colors duration-fast hover:text-ink"
          >
            Services
          </Link>
          <Link
            href="/admin/service-categories"
            className="t-body-md text-ink-soft no-underline transition-colors duration-fast hover:text-ink"
          >
            Categories
          </Link>
          <Link
            href="/admin/staff"
            className="t-body-md text-ink-soft no-underline transition-colors duration-fast hover:text-ink"
          >
            Staff
          </Link>
          <Link
            href="/admin/intake-forms"
            className="t-body-md text-ink-soft no-underline transition-colors duration-fast hover:text-ink"
          >
            Intake forms
          </Link>
          <Link
            href="/admin/waitlist"
            className="t-body-md text-ink-soft no-underline transition-colors duration-fast hover:text-ink"
          >
            Waitlist
          </Link>
          <Link
            href="/admin/media"
            className="t-body-md text-ink-soft no-underline transition-colors duration-fast hover:text-ink"
          >
            Media
          </Link>
          <Link
            href="/admin/settings"
            className="t-body-md text-ink-soft no-underline transition-colors duration-fast hover:text-ink"
          >
            Settings
          </Link>
        </nav>
        <UserButton afterSignOutUrl="/" />
      </header>
      <main className="mx-auto w-full max-w-[1320px] flex-1 px-s8 py-s8">
        {children}
      </main>
    </div>
  );
}
