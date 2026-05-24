import { z } from 'zod';

import { IntakeFormFieldTypeSchema } from './intakeForm.js';

// Re-export to keep field types in lockstep across staff & client surfaces.
export { IntakeFormFieldTypeSchema };

// Field templates: identical shape to intake forms. The renderer on the web
// side switches on `type`. Keep limits in sync with intakeForm.ts.
export const StaffOnboardingFormSchemaJsonSchema = z
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

export const StaffOnboardingFormDefinitionIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const CreateStaffOnboardingFormDefinitionBodySchema = z.object({
  title: z.string().min(1).max(200),
  schema: StaffOnboardingFormSchemaJsonSchema,
  /** When set, creates the next draft version for this form family. */
  groupId: z.string().min(1).max(64).optional(),
});

export const UpdateStaffOnboardingFormDefinitionBodySchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    schema: StaffOnboardingFormSchemaJsonSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (b) => b.title !== undefined || b.schema !== undefined || b.isActive !== undefined,
    {
      message: 'At least one of title, schema, isActive is required.',
    },
  );

export const StaffIdParamsSchema = z.object({
  staffId: z.string().min(1),
});

export const StaffOnboardingSubmissionIdParamsSchema = StaffIdParamsSchema.extend({
  id: z.string().min(1),
});

export const ListStaffOnboardingFormDefinitionsQuerySchema = z.object({
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

export const CreateStaffOnboardingSubmissionBodySchema = z.object({
  definitionId: z.string().min(1),
  /** Defaults to {}. */
  answers: z.record(z.string(), z.unknown()).optional(),
});

// Answers and status are mutually exclusive in the same body — either edit a
// draft (answers) OR flip status to submitted (which freezes the current
// answers). Submitting with new answers also works: when both are present we
// persist answers and snapshot them into the audit row.
export const PatchStaffOnboardingSubmissionBodySchema = z
  .object({
    answers: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(['submitted']).optional(),
  })
  .refine((b) => b.answers !== undefined || b.status !== undefined, {
    message: 'At least one of answers, status is required.',
  });
