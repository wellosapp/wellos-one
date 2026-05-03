import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

import { ApiError } from '@/lib/api/client';
import { getOnboardingStatus } from '@/lib/api/onboarding';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
            href="/admin/media"
            className="t-body-md text-ink-soft no-underline transition-colors duration-fast hover:text-ink"
          >
            Media
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
