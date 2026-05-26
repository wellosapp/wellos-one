// Read-only service for the global FormTemplate library (Forms System PR 4).
// Templates are system-owned (no tenantId) and shared across every tenant —
// the catalog is identical for everyone. The only writer is the prisma seed
// (prisma/seeds/form-templates.ts).
//
// Cloning a template into a tenant lives in intakeFormService.cloneFromTemplate,
// not here — that path needs IntakeFormDefinition writes + audit log entry
// alongside the FormTemplate read.

import type { FormTemplate } from '@prisma/client';

import type { ExtendedPrismaClient } from '../db/client.js';

type ListFormTemplatesArgs = {
  formType?: string;
  category?: string;
  /** Include inactive (soft-hidden) templates. Defaults to false. */
  includeInactive?: boolean;
};

export async function listFormTemplates(
  prisma: ExtendedPrismaClient,
  args: ListFormTemplatesArgs = {},
): Promise<{ templates: FormTemplate[] }> {
  const where: {
    formType?: string;
    category?: string;
    isActive?: boolean;
  } = {};
  if (args.formType) where.formType = args.formType;
  if (args.category) where.category = args.category;
  if (!args.includeInactive) where.isActive = true;

  const templates = await prisma.formTemplate.findMany({
    where,
    orderBy: [{ formType: 'asc' }, { title: 'asc' }],
  });
  return { templates };
}

export async function getFormTemplate(
  prisma: ExtendedPrismaClient,
  args: { id: string },
): Promise<{ template: FormTemplate | null }> {
  const template = await prisma.formTemplate.findUnique({
    where: { id: args.id },
  });
  return { template };
}
