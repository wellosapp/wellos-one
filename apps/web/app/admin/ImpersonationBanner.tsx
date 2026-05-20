'use client';

import { useTransition } from 'react';
import { useClerk } from '@clerk/nextjs';

import { Button } from '@/components/ui';

import { endImpersonationAction } from './_impersonation-actions';

type Props = {
  actor: { email: string };
  subject: { email: string };
};

/**
 * Persistent banner shown on every admin page while a super-admin is
 * impersonating another user. Clicking "Exit" writes the audit-log row
 * via the server action, then signs out via Clerk to clear the actor
 * session. The super-admin can then sign back in as themselves.
 *
 * Phase 3 deliberately keeps the exit flow simple: full sign-out +
 * re-sign-in instead of multi-session swap. Clerk multi-session is
 * available but requires extra app-shell wiring we don't have today.
 */
export function ImpersonationBanner({ actor, subject }: Props) {
  const { signOut } = useClerk();
  const [pending, startTransition] = useTransition();

  function handleExit() {
    startTransition(async () => {
      await endImpersonationAction();
      // signOut clears the impersonation session cookie. Redirect to
      // /sign-in so the super-admin can re-authenticate as themselves.
      await signOut({ redirectUrl: '/sign-in' });
    });
  }

  return (
    <div
      role="alert"
      className="border-b border-amber/40 bg-amber-pale px-s8 py-s3"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-s4">
        <div className="flex flex-col">
          <span className="t-eyebrow text-amber">Impersonation active</span>
          <span className="t-body-md text-ink">
            Acting as <strong>{subject.email}</strong> &mdash; signed in as{' '}
            <strong>{actor.email}</strong>
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleExit}
          disabled={pending}
        >
          {pending ? 'Exiting…' : 'Exit impersonation'}
        </Button>
      </div>
    </div>
  );
}
