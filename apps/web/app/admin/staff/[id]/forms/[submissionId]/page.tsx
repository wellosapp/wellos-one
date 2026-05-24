import type { Route } from 'next';
import { notFound } from 'next/navigation';

import { FormFillPanel } from '@/components/forms/FormFillPanel';
import { ApiError } from '@/lib/api/client';
import { getStaffOnboardingSubmission } from '@/lib/api/staff-onboarding-forms';

import {
  submitStaffFormAction,
  updateStaffFormAnswersAction,
} from '../_actions';

export default async function StaffFillFormPage({
  params,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const { id: staffId, submissionId } = await params;

  let submission: Awaited<
    ReturnType<typeof getStaffOnboardingSubmission>
  >['submission'];
  let definition: Awaited<
    ReturnType<typeof getStaffOnboardingSubmission>
  >['definition'];
  try {
    const res = await getStaffOnboardingSubmission(staffId, submissionId);
    submission = res.submission;
    definition = res.definition;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const closeHref = `/admin/staff/${staffId}/forms` as Route;

  async function saveDraft(answers: Record<string, unknown>) {
    'use server';
    return updateStaffFormAnswersAction(staffId, submissionId, answers);
  }

  async function submit(answers: Record<string, unknown>) {
    'use server';
    return submitStaffFormAction(staffId, submissionId, answers);
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
