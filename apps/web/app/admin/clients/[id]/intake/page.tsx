import { ClipboardIcon } from '@/app/admin/_shell/icons';
import { ApiError } from '@/lib/api/client';
import {
  listClientIntakeSubmissions,
  listIntakeFormDefinitions,
} from '@/lib/api/intake-forms';
import { cn } from '@/lib/cn';

import { SectionHeader } from '../_components/SectionHeader';
import { loadClientDetail } from '../_data';

import { ClientIntakePanel } from './ClientIntakePanel';

export default async function ClientIntakeTabPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clientId } = await params;

  const client = await loadClientDetail(clientId);

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
    <div className="flex flex-col gap-s6">
      <SectionHeader
        icon={ClipboardIcon}
        eyebrow="INTAKE"
        headline={`Forms & submissions for ${client.firstName}.`}
        subtitle="First-party intake definitions. Staff can start a draft against a published form and submit it to record an immutable audit snapshot."
      />

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
  );
}
