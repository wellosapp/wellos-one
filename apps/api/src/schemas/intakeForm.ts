import { z } from 'zod';

import { ClientIdParamsSchema } from './clientNote.js';

/** Allowed field types per Epic 5 (MVP slice). */
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

export const IntakeFormSchemaJsonSchema = z
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
