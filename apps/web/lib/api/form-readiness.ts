import { apiFetch } from './client';

// Forms System PR 8 — form-readiness wire shape.
//
// Returned by:
//   GET /admin/services/:serviceId/form-readiness?clientId=...   (admin/staff)
//
// Used by Quick Book + admin client-book to surface a status chip BEFORE
// the booking is created. Public booking does NOT call this directly — the
// /public/booking/appointments endpoint itself returns 422 + code='FORMS_REQUIRED'
// when hard_required forms are unsatisfied.

export type FormReadinessRequiredLevel =
  | 'optional'
  | 'soft_required'
  | 'hard_required';

export type FormReadinessUnsatisfiedReason =
  | 'never_submitted'
  | 'expired_per_rule';

export interface FormReadinessRule {
  ruleId: string;
  formDefinitionGroupId: string;
  formTitle: string;
  formType: string;
  requiredLevel: FormReadinessRequiredLevel;
  /** Whether the client has a satisfying submission today. */
  satisfied: boolean;
  /** If unsatisfied: why. Null when satisfied. */
  unsatisfiedReason: FormReadinessUnsatisfiedReason | null;
  /** Most recent submission's status (any status), for display. */
  latestSubmissionStatus: string | null;
  latestSubmissionId: string | null;
  latestSubmittedAt: string | null;
}

export interface FormReadinessResult {
  rules: FormReadinessRule[];
  hardRequiredUnsatisfied: FormReadinessRule[];
  softRequiredUnsatisfied: FormReadinessRule[];
  /** True iff at least one hard_required rule is unsatisfied. */
  blocksBooking: boolean;
}

export async function getServiceFormReadiness(
  serviceId: string,
  clientId: string,
): Promise<FormReadinessResult> {
  return apiFetch<FormReadinessResult>(
    `/admin/services/${serviceId}/form-readiness`,
    { searchParams: { clientId } },
  );
}
