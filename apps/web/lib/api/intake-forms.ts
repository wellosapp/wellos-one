import { apiFetch } from './client';

export type IntakeFormDefinitionDto = {
  id: string;
  tenantId: string;
  groupId: string;
  title: string;
  /** Form taxonomy (Forms System PR 1). Nullable for legacy rows. */
  formType?: string | null;
  description?: string | null;
  schema: unknown;
  version: number;
  status: 'draft' | 'published' | 'archived';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Full submission lifecycle per Forms System PR 6.
 *  draft → assigned → sent → opened → in_progress → submitted
 *     └→ cancelled                        └→ expired
 */
export type IntakeFormSubmissionStatus =
  | 'draft'
  | 'assigned'
  | 'sent'
  | 'opened'
  | 'in_progress'
  | 'submitted'
  | 'expired'
  | 'cancelled';

/** Delivery channel choices the admin Send/Resend dialog can request. */
export type FormDeliveryChannel =
  | 'email'
  | 'sms'
  | 'both'
  | 'kiosk'
  | 'admin_only';

export type IntakeFormSubmissionDto = {
  id: string;
  tenantId: string;
  definitionId: string;
  clientId: string | null;
  appointmentId: string | null;
  answers: Record<string, unknown>;
  status: IntakeFormSubmissionStatus;
  deliveryChannel?: FormDeliveryChannel | null;
  expiresAt?: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  definition: {
    id: string;
    title: string;
    version: number;
  };
};

export type ListIntakeDefinitionsParams = {
  status?: 'draft' | 'published' | 'archived';
  groupId?: string;
  includeInactive?: boolean;
};

export async function listIntakeFormDefinitions(params?: ListIntakeDefinitionsParams) {
  return apiFetch<{ definitions: IntakeFormDefinitionDto[] }>(
    '/admin/intake-forms/definitions',
    { searchParams: params },
  );
}

export async function createIntakeFormDefinition(body: {
  title: string;
  schema: unknown;
  groupId?: string;
}) {
  return apiFetch<{ definition: IntakeFormDefinitionDto }>(
    '/admin/intake-forms/definitions',
    { method: 'POST', body },
  );
}

export async function updateIntakeFormDefinition(
  id: string,
  body: { title?: string; schema?: unknown; isActive?: boolean },
) {
  return apiFetch<{ definition: IntakeFormDefinitionDto }>(
    `/admin/intake-forms/definitions/${id}`,
    { method: 'PATCH', body },
  );
}

export async function getIntakeFormDefinition(id: string) {
  return apiFetch<{ definition: IntakeFormDefinitionDto }>(
    `/admin/intake-forms/definitions/${id}`,
  );
}

export async function publishIntakeFormDefinition(id: string) {
  return apiFetch<{ definition: IntakeFormDefinitionDto }>(
    `/admin/intake-forms/definitions/${id}/publish`,
    { method: 'POST', body: {} },
  );
}

export async function listClientIntakeSubmissions(clientId: string) {
  return apiFetch<{ submissions: IntakeFormSubmissionDto[] }>(
    `/admin/clients/${clientId}/intake-submissions`,
  );
}

export async function getClientIntakeSubmission(
  clientId: string,
  submissionId: string,
) {
  return apiFetch<{
    submission: IntakeFormSubmissionDto;
    definition: IntakeFormDefinitionDto;
  }>(`/admin/clients/${clientId}/intake-submissions/${submissionId}`);
}

export async function createClientIntakeSubmission(
  clientId: string,
  body: {
    definitionId: string;
    appointmentId?: string;
    answers?: Record<string, unknown>;
  },
) {
  return apiFetch<{ submission: IntakeFormSubmissionDto }>(
    `/admin/clients/${clientId}/intake-submissions`,
    { method: 'POST', body },
  );
}

export async function patchClientIntakeSubmission(
  clientId: string,
  submissionId: string,
  body: {
    answers?: Record<string, unknown>;
    status?: 'draft' | 'submitted';
  },
) {
  return apiFetch<{ submission: IntakeFormSubmissionDto }>(
    `/admin/clients/${clientId}/intake-submissions/${submissionId}`,
    { method: 'PATCH', body },
  );
}

// Forms System PR 6 — admin send + cancel actions.

export async function sendIntakeFormSubmission(
  submissionId: string,
  body?: { deliveryChannel?: FormDeliveryChannel },
) {
  return apiFetch<{
    submission: IntakeFormSubmissionDto;
    url: string;
    channels: string[];
    resolvedChannel: FormDeliveryChannel;
  }>(`/admin/intake-form-submissions/${submissionId}/send`, {
    method: 'POST',
    body: body ?? {},
  });
}

export async function cancelIntakeFormSubmission(
  submissionId: string,
  reason?: string,
) {
  return apiFetch<{ submission: IntakeFormSubmissionDto }>(
    `/admin/intake-form-submissions/${submissionId}/cancel`,
    {
      method: 'POST',
      body: reason ? { reason } : {},
    },
  );
}
