'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import { submitReview, type ReviewDecision } from '@/lib/api/form-review';

export type ReviewActionState = {
  ok: boolean;
  error?: string;
};

const VALID_DECISIONS: ReadonlyArray<ReviewDecision> = [
  'reviewed',
  'requires_follow_up',
  'approved',
  'denied',
];

function isReviewDecision(v: unknown): v is ReviewDecision {
  return typeof v === 'string' && (VALID_DECISIONS as readonly string[]).includes(v);
}

export async function submitReviewAction(
  submissionId: string,
  _prev: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const decisionRaw = formData.get('decision');
  const notesRaw = formData.get('notes');

  if (!isReviewDecision(decisionRaw)) {
    return { ok: false, error: 'Select a review decision before submitting.' };
  }

  const notes =
    typeof notesRaw === 'string' && notesRaw.trim().length > 0
      ? notesRaw.trim()
      : undefined;

  try {
    await submitReview(submissionId, { decision: decisionRaw, notes });
    revalidatePath('/admin/forms/review-queue');
    revalidatePath(`/admin/forms/review-queue/${submissionId}`);
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof ApiError ? err.message : 'Could not save review.';
    return { ok: false, error: message };
  }
}
