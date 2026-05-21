import { ManageApiError, fetchManageView } from './_api';
import { CancelCard } from './CancelCard';
import { RescheduleCard } from './RescheduleCard';
import { ViewCard } from './ViewCard';

type RouteParams = { token: string };
type RouteSearch = { mode?: string };

type Mode = 'view' | 'cancel' | 'reschedule';

function parseMode(raw: string | undefined): Mode {
  if (raw === 'cancel') return 'cancel';
  if (raw === 'reschedule') return 'reschedule';
  return 'view';
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="flex h-14 items-center justify-between border-b border-surface-3 bg-white px-s8">
        <span className="t-display-sm font-display font-semibold text-ink">
          Wellos
        </span>
      </header>
      <main className="mx-auto w-full max-w-[720px] px-s6 py-s8 md:px-s8">
        {children}
      </main>
    </div>
  );
}

function ErrorCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-surface-3 bg-white p-s7 shadow-sm">
      <span className="t-eyebrow text-accent">Manage your visit</span>
      <h1 className="mt-s2 t-display-md text-ink">{title}</h1>
      <p className="mt-s3 t-body-md text-ink-soft">{body}</p>
    </div>
  );
}

export default async function ManagePage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<RouteSearch>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const mode = parseMode(sp.mode);

  try {
    const view = await fetchManageView(token);
    return (
      <PageShell>
        {mode === 'cancel' ? (
          <CancelCard token={token} view={view} />
        ) : mode === 'reschedule' ? (
          <RescheduleCard token={token} view={view} />
        ) : (
          <ViewCard token={token} view={view} />
        )}
      </PageShell>
    );
  } catch (err) {
    if (err instanceof ManageApiError) {
      if (err.status === 404 || err.code === 'APPOINTMENT_NOT_FOUND') {
        return (
          <PageShell>
            <ErrorCard
              title="We couldn't find this appointment."
              body="The link may be wrong or the appointment has been removed. Check your email for the most recent confirmation."
            />
          </PageShell>
        );
      }
      if (err.status === 410) {
        return (
          <PageShell>
            <ErrorCard
              title="This link has expired."
              body="Please check your email for a fresh link or contact the business for help."
            />
          </PageShell>
        );
      }
      if (err.code === 'PURPOSE_MISMATCH') {
        return (
          <PageShell>
            <ErrorCard
              title="This link can't be used here."
              body="It was issued for a different action. Use the link from your latest email."
            />
          </PageShell>
        );
      }
    }
    // Re-throw so error.tsx catches it.
    throw err;
  }
}
