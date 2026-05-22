import { ApiError } from '@/lib/api/client';
import {
  listClientIntakeSubmissions,
  listIntakeFormDefinitions,
} from '@/lib/api/intake-forms';
import { cn } from '@/lib/cn';

import { ClientIntakePanel } from './ClientIntakePanel';

export default async function ClientIntakeTabPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clientId } = await params;

  let loadError: string | null = null;
  let publishedForms: Awaited<
    ReturnType<typeof listIntakeFormDefinitions>
  >['definitions'] = [];
  let submissions: Awaited<
    ReturnType<typeof listClientIntakeSubmissions>
  >['submissions'] = [];

  try {
    const [defsRes, subRes] = await Promise.all([
      listIntakeFormDefinitions({ status: 'published' }),
      listClientIntakeSubmissions(clientId),
    ]);
    publishedForms = defsRes.definitions;
    submissions = subRes.submissions;
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? err.message
        : 'Could not load intake data. Is the API running?';
  }

  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
      )}
    >
      <header className="border-b border-line bg-surface-sunk/40 px-s6 py-s5 lg:px-s8 lg:py-s6">
        <div className="t-eyebrow text-sage">Intake</div>
        <h2 className="mt-s2 font-display text-[26px] text-ink">
          Forms & submissions.
        </h2>
        <p className="mt-s2 max-w-2xl t-body-md leading-relaxed text-ink-3">
          First-party intake definitions (Epic 5 MVP). Staff can start a
          draft against a published form and submit it to record an
          immutable audit snapshot.
        </p>
      </header>

      <div className="p-s6 lg:p-s8">
        {loadError ? (
          <div
            className={cn(
              'rounded-md border border-amber/30 bg-amber-pale/60 p-s4',
              't-body-sm text-amber',
            )}
          >
            {loadError}
          </div>
        ) : (
          <ClientIntakePanel
            clientId={clientId}
            publishedForms={publishedForms}
            submissions={submissions}
          />
        )}
      </div>
    </section>
  );
}
