import { z } from 'zod';

import { ClientIdParamsSchema } from './clientNote.js';

/** Allowed field types per Epic 5 (MVP slice).
 *
 * Kept for the staff-onboarding schema (which re-exports this enum). The
 * intake-form schema accepts a strictly broader shape produced by the
 * Forms-System builder (Forms PR 2) — see IntakeFormSchemaJsonSchema below.
 */
export const IntakeFormFieldTypeSchema = z.enum([
  'text',
  'long_text',
  'date',
  'yes_no',
  'multi_select',
  'signature',
  'file_upload',
]);

export type IntakeFormFieldType = z.infer<typeof IntakeFormFieldTypeSchema>;

// Legacy flat-array shape kept for backward-compat with rows written before
// Forms PR 2. The web builder always normalizes to the new object shape on
// load, and saves the new shape; this branch only matches definitions that
// haven't been touched since the builder shipped.
const LegacyIntakeFormSchemaArraySchema = z
  .array(
    z.object({
      key: z.string().min(1).max(64),
      type: IntakeFormFieldTypeSchema,
      label: z.string().min(1).max(500),
      required: z.boolean().optional(),
      options: z.array(z.string().min(1).max(200)).max(50).optional(),
    }),
  )
  .max(100);

// New builder shape (Forms PR 2). Sections + flat field list. Validation is
// lenient so the front-end can evolve internals (new field types, new
// validation knobs) without locking the API schema in step. The web layer
// owns the per-field rules; we just confirm the outer shape here.
const BuilderIntakeFormSchemaSchema = z.object({
  schemaVersion: z.literal(2),
  sections: z.array(z.record(z.string(), z.unknown())).max(50),
  fields: z.array(z.record(z.string(), z.unknown())).max(500),
});

export const IntakeFormSchemaJsonSchema = z.union([
  BuilderIntakeFormSchemaSchema,
  LegacyIntakeFormSchemaArraySchema,
]);

export const CreateIntakeFormDefinitionBodySchema = z.object({
  title: z.string().min(1).max(200),
  schema: IntakeFormSchemaJsonSchema,
  /** When set, creates the next draft version for this form family. */
  groupId: z.string().min(1).max(64).optional(),
});

export const UpdateIntakeFormDefinitionBodySchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    schema: IntakeFormSchemaJsonSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((b) => b.title !== undefined || b.schema !== undefined || b.isActive !== undefined, {
    message: 'At least one of title, schema, isActive is required.',
  });

export const IntakeFormDefinitionIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const CloneFromTemplateBodySchema = z.object({
  templateId: z.string().min(1),
});

export const ListIntakeFormDefinitionsQuerySchema = z.object({
  status: z.enum(['draft', 'published', 'archived']).optional(),
  groupId: z.string().optional(),
  /** When listing `published`, omit inactive definitions unless true. */
  includeInactive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
});

export const IntakeSubmissionIdParamsSchema = ClientIdParamsSchema.extend({
  submissionId: z.string().min(1),
});

export const CreateIntakeFormSubmissionBodySchema = z.object({
  definitionId: z.string().min(1),
  appointmentId: z.string().min(1).optional(),
  /** Defaults to {}. */
  answers: z.record(z.string(), z.unknown()).optional(),
});

export const PatchIntakeFormSubmissionBodySchema = z
  .object({
    answers: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(['draft', 'submitted']).optional(),
  })
  .refine((b) => b.answers !== undefined || b.status !== undefined, {
    message: 'At least one of answers, status is required.',
  });
