import { apiFetch } from './client';
import type { IntakeFormDefinitionDto } from './intake-forms';

export type FormTemplateDto = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  formType: string;
  category: string | null;
  // FormBuilderSchema JSON — kept loose at the wire boundary; consumers
  // narrow via _schema-utils normalizeSchema before reading fields/sections.
  schema: unknown;
  iconName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ListFormTemplatesParams = {
  formType?: string;
  category?: string;
};

export async function listFormTemplates(params?: ListFormTemplatesParams) {
  return apiFetch<{ templates: FormTemplateDto[] }>('/admin/form-templates', {
    searchParams: params,
  });
}

export async function getFormTemplate(id: string) {
  return apiFetch<{ template: FormTemplateDto | null }>(
    `/admin/form-templates/${id}`,
  );
}

export async function cloneFormTemplate(templateId: string) {
  return apiFetch<{ definition: IntakeFormDefinitionDto }>(
    '/admin/intake-forms/clone-from-template',
    { method: 'POST', body: { templateId } },
  );
}
