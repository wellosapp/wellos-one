import { Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import {
  listClientIntakeSubmissions,
  listIntakeFormDefinitions,
} from '@/lib/api/intake-forms';

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
    <div className="space-y-s4">
      <Card
        padding="lg"
        className="rounded-2xl border border-surface-3 bg-white shadow-sm"
      >
        <span className="t-eyebrow text-accent">Intake</span>
        <h2 className="mt-s2 font-display t-display-sm text-ink">
          Forms & submissions
        </h2>
        <p className="mt-s3 max-w-2xl t-body-md leading-relaxed text-ink-soft">
          First-party intake definitions (Epic 5 MVP). Staff can start a
          draft against a published form and submit it to record an immutable
          audit snapshot.
        </p>
      </Card>

      {loadError ? (
        <Card
          padding="md"
          className="border border-amber/30 bg-amber-pale/60 t-body-sm text-amber-950"
        >
          {loadError}
        </Card>
      ) : (
        <ClientIntakePanel
          clientId={clientId}
          publishedForms={publishedForms}
          submissions={submissions}
        />
      )}
    </div>
  );
}
