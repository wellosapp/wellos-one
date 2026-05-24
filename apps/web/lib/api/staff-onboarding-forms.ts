import { apiFetch } from './client';

// Field types are identical between client intake and staff onboarding forms.
// The renderer (components/forms/FormFieldRenderer.tsx) switches on type.
export type StaffOnboardingFormFieldType =
  | 'text'
  | 'long_text'
  | 'date'
  | 'yes_no'
  | 'multi_select'
  | 'signature'
  | 'file_upload';

export type StaffOnboardingFormFieldConfig = {
  key: string;
  type: StaffOnboardingFormFieldType;
  label: string;
  required?: boolean;
  options?: string[];
};

export type StaffOnboardingFormSchema = {
  fields: StaffOnboardingFormFieldConfig[];
};

export type StaffOnboardingFormDefinitionDto = {
  id: string;
  tenantId: string;
  groupId: string;
  title: string;
  /** Validated server-side as { fields: FieldConfig[] }. */
  schema: unknown;
  version: number;
  status: 'draft' | 'published' | 'archived';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StaffOnboardingFormSubmissionDto = {
  id: string;
  tenantId: string;
  definitionId: string;
  staffId: string;
  answers: Record<string, unknown>;
  status: 'draft' | 'submitted';
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StaffOnboardingFormSubmissionListItem =
  StaffOnboardingFormSubmissionDto & {
    definition: {
      id: string;
      title: string;
      version: number;
    };
  };

export type ListStaffOnboardingDefinitionsParams = {
  status?: 'draft' | 'published' | 'archived';
};

export async function listStaffOnboardingFormDefinitions(
  params?: ListStaffOnboardingDefinitionsParams,
) {
  return apiFetch<{ definitions: StaffOnboardingFormDefinitionDto[] }>(
    '/admin/staff-onboarding-forms',
    { searchParams: params },
  );
}

export async function getStaffOnboardingFormDefinition(id: string) {
  return apiFetch<{ definition: StaffOnboardingFormDefinitionDto }>(
    `/admin/staff-onboarding-forms/${id}`,
  );
}

export async function createStaffOnboardingFormDefinition(body: {
  title: string;
  schema: unknown;
  groupId?: string;
}) {
  return apiFetch<{ definition: StaffOnboardingFormDefinitionDto }>(
    '/admin/staff-onboarding-forms',
    { method: 'POST', body },
  );
}

export async function updateStaffOnboardingFormDefinition(
  id: string,
  body: { title?: string; schema?: unknown; isActive?: boolean },
) {
  return apiFetch<{ definition: StaffOnboardingFormDefinitionDto }>(
    `/admin/staff-onboarding-forms/${id}`,
    { method: 'PATCH', body },
  );
}

export async function versionStaffOnboardingFormDefinition(id: string) {
  return apiFetch<{ definition: StaffOnboardingFormDefinitionDto }>(
    `/admin/staff-onboarding-forms/${id}/version`,
    { method: 'POST', body: {} },
  );
}

export async function publishStaffOnboardingFormDefinition(id: string) {
  return apiFetch<{ definition: StaffOnboardingFormDefinitionDto }>(
    `/admin/staff-onboarding-forms/${id}/publish`,
    { method: 'POST', body: {} },
  );
}

export async function archiveStaffOnboardingFormDefinition(id: string) {
  return apiFetch<{ definition: StaffOnboardingFormDefinitionDto }>(
    `/admin/staff-onboarding-forms/${id}/archive`,
    { method: 'POST', body: {} },
  );
}

export async function listStaffOnboardingSubmissions(staffId: string) {
  return apiFetch<{ submissions: StaffOnboardingFormSubmissionListItem[] }>(
    `/admin/staff/${staffId}/onboarding-submissions`,
  );
}

export async function getStaffOnboardingSubmission(
  staffId: string,
  submissionId: string,
) {
  return apiFetch<{
    submission: StaffOnboardingFormSubmissionDto;
    definition: StaffOnboardingFormDefinitionDto;
  }>(`/admin/staff/${staffId}/onboarding-submissions/${submissionId}`);
}

export async function createStaffOnboardingSubmission(
  staffId: string,
  body: {
    definitionId: string;
    answers?: Record<string, unknown>;
  },
) {
  return apiFetch<{ submission: StaffOnboardingFormSubmissionDto }>(
    `/admin/staff/${staffId}/onboarding-submissions`,
    { method: 'POST', body },
  );
}

export async function patchStaffOnboardingSubmission(
  staffId: string,
  submissionId: string,
  body: {
    answers?: Record<string, unknown>;
    status?: 'submitted';
  },
) {
  return apiFetch<{ submission: StaffOnboardingFormSubmissionDto }>(
    `/admin/staff/${staffId}/onboarding-submissions/${submissionId}`,
    { method: 'PATCH', body },
  );
}
