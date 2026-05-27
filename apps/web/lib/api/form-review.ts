// Forms System PR 9 — admin provider review queue API wrappers.
//
// Backs /admin/forms/review-queue + /admin/forms/review-queue/[id].

import { apiFetch } from './client';

export type ReviewStatusFilter =
  | 'unreviewed'
  | 'reviewed'
  | 'requires_follow_up'
  | 'approved'
  | 'denied'
  | 'all';

export type ReviewDecision =
  | 'reviewed'
  | 'requires_follow_up'
  | 'approved'
  | 'denied';

export interface ReviewQueueRow {
  id: string;
  definitionId: string;
  definitionTitle: string;
  definitionFormType: string | null;
  clientId: string | null;
  clientName: string | null;
  appointmentId: string | null;
  appointmentScheduledStartAt: string | null;
  appointmentServiceId: string | null;
  appointmentServiceName: string | null;
  submittedAt: string | null;
  reviewStatus: string;
  reviewedAt: string | null;
  reviewedByStaffName: string | null;
  hasSignature: boolean;
}

export interface ListReviewQueueResult {
  submissions: ReviewQueueRow[];
  cursor: string | null;
}

export interface ReviewSubmissionDetail {
  submission: {
    id: string;
    tenantId: string;
    definitionId: string;
    clientId: string | null;
    appointmentId: string | null;
    answers: Record<string, unknown>;
    status: string;
    submittedAt: string | null;
    openedAt: string | null;
    startedAt: string | null;
    expiresAt: string | null;
    deliveryChannel: string | null;
    signatureData: unknown;
    reviewStatus: string | null;
    reviewedAt: string | null;
    reviewedByStaffId: string | null;
    reviewedByStaffName: string | null;
    reviewNotes: string | null;
    createdAt: string;
    updatedAt: string;
  };
  definition: {
    id: string;
    title: string;
    description: string | null;
    formType: string | null;
    schema: unknown;
    version: number;
    status: string;
  };
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  appointment: {
    id: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    state: string;
    staffId: string;
  } | null;
  service: {
    id: string;
    name: string;
  } | null;
  fileUploads: Array<{
    id: string;
    fieldKey: string;
    mediaAssetId: string;
    mediaAssetUrl: string | null;
  }>;
  audits: Array<{
    id: string;
    action: string;
    createdAt: string;
    ip: string | null;
    userAgent: string | null;
  }>;
}

export interface ListReviewQueueParams {
  reviewStatus?: ReviewStatusFilter;
  formType?: string;
  cursor?: string;
  take?: number;
}

export async function listReviewQueue(
  params: ListReviewQueueParams = {},
): Promise<ListReviewQueueResult> {
  return apiFetch<ListReviewQueueResult>('/admin/form-review/queue', {
    searchParams: {
      reviewStatus: params.reviewStatus,
      formType: params.formType,
      cursor: params.cursor,
      take: params.take,
    },
  });
}

export async function getReviewSubmission(
  submissionId: string,
): Promise<ReviewSubmissionDetail> {
  return apiFetch<ReviewSubmissionDetail>(
    `/admin/form-review/submissions/${submissionId}`,
  );
}

export async function submitReview(
  submissionId: string,
  body: { decision: ReviewDecision; notes?: string },
): Promise<{
  submission: {
    id: string;
    reviewStatus: string | null;
    reviewedAt: string | null;
    reviewedByStaffId: string | null;
    reviewNotes: string | null;
  };
}> {
  return apiFetch(`/admin/form-review/submissions/${submissionId}`, {
    method: 'POST',
    body,
  });
}
