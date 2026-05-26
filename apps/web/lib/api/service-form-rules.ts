// Type-safe wrappers for /admin/services/:serviceId/form-rules. Mirrors the
// Zod schemas in apps/api/src/schemas/formAssignmentRule.ts. Kept in sync by
// hand at MVP — move to packages/shared when shared types fill in.

import { apiFetch } from './client';

export type RequiredLevel = 'optional' | 'soft_required' | 'hard_required';
export type Timing = 'before_booking' | 'before_appointment' | 'optional';

export interface FormAssignmentRule {
  id: string;
  serviceId: string;
  formDefinitionGroupId: string;
  formTitle: string;
  formType: string;
  requiredLevel: RequiredLevel;
  timing: Timing;
  sendAutomaticallyAfterBooking: boolean;
  requireProviderReview: boolean;
  expiresAfterDays: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertFormAssignmentRuleBody {
  formDefinitionGroupId: string;
  requiredLevel: RequiredLevel;
  timing: Timing;
  sendAutomaticallyAfterBooking: boolean;
  requireProviderReview: boolean;
  expiresAfterDays: number | null;
  active: boolean;
}

export interface UpdateFormAssignmentRuleBody {
  requiredLevel: RequiredLevel;
  timing: Timing;
  sendAutomaticallyAfterBooking: boolean;
  requireProviderReview: boolean;
  expiresAfterDays: number | null;
  active: boolean;
}

export async function listServiceFormRules(
  serviceId: string,
): Promise<{ rules: FormAssignmentRule[] }> {
  return apiFetch(`/admin/services/${serviceId}/form-rules`);
}

export async function createServiceFormRule(
  serviceId: string,
  body: UpsertFormAssignmentRuleBody,
): Promise<{ rule: FormAssignmentRule; created: true }> {
  return apiFetch(`/admin/services/${serviceId}/form-rules`, {
    method: 'POST',
    body,
  });
}

export async function updateServiceFormRule(
  serviceId: string,
  ruleId: string,
  body: UpdateFormAssignmentRuleBody,
): Promise<{ rule: FormAssignmentRule; created: false }> {
  return apiFetch(`/admin/services/${serviceId}/form-rules/${ruleId}`, {
    method: 'PATCH',
    body,
  });
}

export async function deleteServiceFormRule(
  serviceId: string,
  ruleId: string,
): Promise<void> {
  await apiFetch(`/admin/services/${serviceId}/form-rules/${ruleId}`, {
    method: 'DELETE',
  });
}
