// Client island for the /no-access page's actions. Clerk's <SignOutButton>
// is a client component — wrap it here so the parent page can stay a server
// component for its auth guard + static content.

'use client';

import { SignOutButton } from '@clerk/nextjs';

export function NoAccessActions() {
  return (
    <div className="flex flex-col gap-s3 sm:flex-row sm:items-center sm:justify-between">
      {/* Primary: Sign out + return to /sign-in. Clerk's signOut() clears
          the session client-side first, THEN navigates — so the now-unauthed
          user lands at sign-in and does NOT bounce back here. */}
      <SignOutButton
        signOutOptions={{ redirectUrl: '/sign-in' }}
      >
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md bg-sage-deep px-s5 py-s3 t-body-md font-semibold text-ink-inv shadow-sm transition-colors duration-fast hover:bg-ink focus-visible:shadow-focus focus-visible:outline-none"
        >
          Sign out
        </button>
      </SignOutButton>

      {/* Secondary: Coming-soon — no admin-contact mechanism on main yet
          (workspace admin email field or in-product messaging both still
          to be built). Listed in the PR body as a follow-up item. */}
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Coming soon — admin messaging not wired yet"
        className="inline-flex cursor-not-allowed items-center justify-center rounded-md border border-line bg-surface px-s5 py-s3 t-body-md font-medium text-ink-3 opacity-60"
      >
        Contact your admin
      </button>
    </div>
  );
}
