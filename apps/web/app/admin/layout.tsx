import { currentUser } from '@clerk/nextjs/server';

import { ApiError } from '@/lib/api/client';
import { getImpersonationActive } from '@/lib/api/impersonate';
import { getOnboardingStatus } from '@/lib/api/onboarding';
import { getTenantBrand, type TenantLogo } from '@/lib/api/tenant-brand';

import { ImpersonationBanner } from './ImpersonationBanner';
import { AdminShell } from './_shell/AdminShell';
import { AdminTopbar } from './_shell/AdminTopbar';

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

  // Greeting bits resolved server-side so the markup is stable on first paint.
  // currentUser() is the dashboard's pattern (apps/web/app/dashboard/page.tsx).
  let firstName: string | null = null;
  try {
    const user = await currentUser();
    firstName = user?.firstName ?? null;
  } catch {
    // Auth race in render — fall through to a generic greeting.
  }

  // Tenant logo for the admin rail's top branding spot. If the fetch fails
  // (API down, R2 unconfigured, etc.) the rail falls back to LeafIcon + "Wellos".
  let tenantLogo: TenantLogo | null = null;
  try {
    const brand = await getTenantBrand();
    tenantLogo = brand.logo;
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    // 401 / 403 / 5xx — render fallback branding, don't block the layout.
  }

  const now = new Date();
  const serverHour = now.getHours();
  // "Wednesday · May 20" — kept short to read as a calm eyebrow. The
  // visitor's browser TZ may differ from the server's; this is the
  // server-resolved date which is good enough for the eyebrow chrome
  // (the precise time-of-day clock is not surfaced here).
  const todayLabel = `${now.toLocaleDateString('en-US', { weekday: 'long' })} · ${now.toLocaleDateString(
    'en-US',
    { month: 'long', day: 'numeric' },
  )}`;

  return (
    <>
      {impersonation?.active ? (
        <ImpersonationBanner
          actor={{ email: impersonation.actor.email }}
          subject={{ email: impersonation.subject.email }}
        />
      ) : null}
      {devOnboardingHint ? (
        <div
          className="border-b border-amber/30 bg-amber-pale/80 px-s8 py-s2 t-caption text-ink-2"
          role="status"
        >
          <span className="font-semibold">Dev</span> —{' '}
          <code className="rounded-sm bg-white/60 px-s1">GET /admin/onboarding/status</code>
          : {devOnboardingHint}
        </div>
      ) : null}
      <AdminShell
        topbar={
          <AdminTopbar
            firstName={firstName}
            serverHour={serverHour}
            todayLabel={todayLabel}
          />
        }
        logo={tenantLogo}
      >
        {children}
      </AdminShell>
    </>
  );
}
