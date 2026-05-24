import type { Route } from 'next';
import { notFound } from 'next/navigation';

import { FormFillPanel } from '@/components/forms/FormFillPanel';
import { ApiError } from '@/lib/api/client';
import { getClientIntakeSubmission } from '@/lib/api/intake-forms';

import {
  submitClientIntakeAction,
  updateClientIntakeAnswersAction,
} from '../_actions';

export default async function ClientFillIntakePage({
  params,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const { id: clientId, submissionId } = await params;

  let submission: Awaited<
    ReturnType<typeof getClientIntakeSubmission>
  >['submission'];
  let definition: Awaited<
    ReturnType<typeof getClientIntakeSubmission>
  >['definition'];
  try {
    const res = await getClientIntakeSubmission(clientId, submissionId);
    submission = res.submission;
    definition = res.definition;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const closeHref = `/admin/clients/${clientId}/intake` as Route;

  async function saveDraft(answers: Record<string, unknown>) {
    'use server';
    return updateClientIntakeAnswersAction(clientId, submissionId, answers);
  }

  async function submit(answers: Record<string, unknown>) {
    'use server';
    return submitClientIntakeAction(clientId, submissionId, answers);
  }

  return (
    <FormFillPanel
      definition={{
        id: definition.id,
        title: definition.title,
        version: definition.version,
        schema: definition.schema,
      }}
      initialAnswers={submission.answers}
      initialStatus={submission.status}
      saveDraftAction={saveDraft}
      submitAction={submit}
      closeHref={closeHref}
    />
  );
}
