// /no-access — terminal route for orphan Clerk users.
//
// Reached from /dashboard's role router when getWhoami() returns 401/403
// (Clerk user has no DB record, no role assignment in any tenant, or the
// API can't resolve a session-scoped user). This is a deliberate
// destination — not a stub — so the page is polished and matches the
// admin shell visual language without showing any admin chrome.
//
// Loop prevention
// - Page is a server component with an unauthenticated guard at the top:
//   if currentUser() is null, redirect to /sign-in. This means a
//   signed-out user hitting the URL directly (bookmark, old link) gets
//   bounced to sign-in instead of seeing the no-access UI.
// - The Sign Out action uses Clerk's <SignOutButton> with redirectUrl
//   '/sign-in', so the session clears BEFORE navigation. The orphan user
//   does NOT loop back here on the next page load until they re-sign-in.
// - No auto-redirect from this page. The user decides when to act.

import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { NoAccessActions } from './NoAccessActions';

// Auth-dependent — must not prerender. The page renders different copy
// depending on whether a Clerk session exists (and exits early to /sign-in
// when there is none), so static rendering would be wrong.
export const dynamic = 'force-dynamic';

export default async function NoAccessPage() {
  // Server-side guard: an unauthenticated visitor has nothing to do on
  // this page. Bounce to sign-in.
  const user = await currentUser();
  if (!user) {
    redirect('/sign-in');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-s5 py-s8">
      <section className="w-full max-w-[520px] rounded-lg border border-line bg-surface px-s6 py-s8 shadow-sm sm:px-s8">
        <p className="t-eyebrow text-sage-deep">Workspace access</p>

        <h1 className="mt-s2 font-display text-[32px] leading-tight tracking-[-0.01em] text-ink">
          You don&rsquo;t have access to a Wellos workspace yet.
        </h1>

        <div className="mt-s5 flex flex-col gap-s3 t-body-md text-ink-3">
          <p>
            If you&rsquo;re new here, your admin probably hasn&rsquo;t added
            you to the workspace yet. They&rsquo;ll need to invite you or
            assign a role before you can sign in.
          </p>
          <p>
            If you used to have access, an admin may have revoked your role
            assignment.
          </p>
          <p>
            If this is the wrong account, sign out and try the email you use
            for work.
          </p>
        </div>

        <div className="mt-s6 border-t border-line pt-s5">
          <NoAccessActions />
        </div>
      </section>
    </main>
  );
}
