'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  createStaffOnboardingSubmission,
  patchStaffOnboardingSubmission,
} from '@/lib/api/staff-onboarding-forms';

export type StaffFormActionState = {
  ok: boolean;
  error?: string;
};

export async function startStaffFormDraftAction(
  staffId: string,
  definitionId: string,
): Promise<StaffFormActionState> {
  if (!definitionId.trim()) {
    return { ok: false, error: 'Choose a published form.' };
  }
  try {
    await createStaffOnboardingSubmission(staffId, { definitionId });
    revalidatePath(`/admin/staff/${staffId}/forms`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError
          ? err.message
          : 'Could not start onboarding draft.',
    };
  }
}

export async function updateStaffFormAnswersAction(
  staffId: string,
  submissionId: string,
  answers: Record<string, unknown>,
): Promise<StaffFormActionState> {
  try {
    await patchStaffOnboardingSubmission(staffId, submissionId, { answers });
    revalidatePath(`/admin/staff/${staffId}/forms`);
    revalidatePath(`/admin/staff/${staffId}/forms/${submissionId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError ? err.message : 'Could not save draft.',
    };
  }
}

export async function submitStaffFormAction(
  staffId: string,
  submissionId: string,
  answers: Record<string, unknown>,
): Promise<StaffFormActionState> {
  try {
    await patchStaffOnboardingSubmission(staffId, submissionId, {
      answers,
      status: 'submitted',
    });
    revalidatePath(`/admin/staff/${staffId}/forms`);
    revalidatePath(`/admin/staff/${staffId}/forms/${submissionId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ApiError ? err.message : 'Could not submit form.',
    };
  }
}
