import Link from 'next/link';
import type { Route } from 'next';

import { LeafIcon } from '@/app/admin/_shell/icons';

// Public-facing namespace for client self-service surfaces. Sits OUTSIDE
// the (authenticated) / Clerk-protected tree on purpose — magic-link clients
// aren't signed in to Clerk in MVP. The first surface here is
// /me/permissions (PWA permission visibility for the geofence epic);
// future /me/* pages reuse this shell.
//
// Visual contract is intentionally lean — no AdminRail, no nav, no profile
// chrome. Just the Wellos lockup, a back link to /book, and the page body.

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 border-b border-surface-3 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center justify-between px-s6 md:px-s8">
          <Link
            href={'/book' as Route}
            aria-label="Wellos home"
            className="flex items-center gap-s3 text-ink no-underline focus-visible:shadow-focus focus-visible:outline-none rounded-sm"
          >
            <span
              aria-hidden
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-sage text-surface shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]"
            >
              <LeafIcon size={18} />
            </span>
            <span className="font-display text-[22px] leading-none tracking-[-0.01em]">
              Wellos
            </span>
          </Link>
          <Link
            href={'/book' as Route}
            className="t-body-sm text-ink-soft no-underline hover:text-ink focus-visible:shadow-focus focus-visible:outline-none rounded-sm px-s2 py-s1"
          >
            ← Back to booking
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[720px] px-s6 py-s8 md:px-s8">
        {children}
      </main>
    </div>
  );
}
