import { redirect } from 'next/navigation';

import { Card } from '@/components/ui';
import { getWhoami } from '@/lib/api/whoami';

import { ImpersonateForm } from './ImpersonateForm';

export const dynamic = 'force-dynamic';

/**
 * Super-admin-only page. Hands a user email to /admin/impersonate/start
 * which mints a Clerk actor token and redirects to Clerk's hosted
 * sign-in URL. Phase 3 of the impersonation feature.
 *
 * Non-super-admins get a 404-style redirect to /admin so the page
 * doesn't reveal that this surface exists.
 */
export default async function ImpersonatePage() {
  const whoami = await getWhoami();
  if (!whoami.roles.includes('super_admin')) {
    redirect('/admin');
  }

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex flex-col gap-s1">
        <span className="t-eyebrow text-accent">Super-admin tools</span>
        <h1 className="t-display-lg">Sign in as another user</h1>
        <p className="t-body-md text-ink-soft">
          Mint a one-time Clerk actor token and swap into the target&rsquo;s
          session. Used for support and account recovery. Every action under
          impersonation is logged to <code>audit_log</code> with both your id
          (actor) and the target&rsquo;s id (subject).
        </p>
      </header>

      <Card padding="lg">
        <ImpersonateForm />
      </Card>

      <Card padding="md" className="border border-amber/40 bg-amber-pale/30">
        <div className="flex flex-col gap-s2">
          <h2 className="t-display-sm">Hard rules</h2>
          <ul className="list-disc pl-s5 t-body-sm text-ink-soft">
            <li>You cannot impersonate another super-admin.</li>
            <li>
              You cannot impersonate yourself (the API rejects this).
            </li>
            <li>
              Client (customer) impersonation is not available yet &mdash; magic-link
              client targets ship in a later phase once Epic 4 lands.
            </li>
            <li>
              Exit via the persistent banner at the top of the admin shell.
              Exiting signs you out; sign back in as yourself to resume.
            </li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
