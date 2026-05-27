import { z } from 'zod';

// Zod schemas for the PR 7 public form completion endpoints. Validation is
// deliberately permissive on the `answers` shape — server-side validation
// against the form schema lives in publicFormService.submitSubmission via
// lib/formValidation. Zod just ensures the wire shape is sane (objects,
// strings, numbers) so the service can safely deref keys.

const TokenParamSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, '64-char hex token expected'),
});

export const PublicFormTokenParamsSchema = TokenParamSchema;
export type PublicFormTokenParams = z.infer<typeof PublicFormTokenParamsSchema>;

// Free-form answers map — keys are field IDs, values are any JSON.
// Server-side validation via formValidation.validateAnswers.
const AnswersSchema = z.record(z.string(), z.unknown());

export const PublicFormAutosaveBodySchema = z.object({
  answers: AnswersSchema,
});
export type PublicFormAutosaveBody = z.infer<typeof PublicFormAutosaveBodySchema>;

// Submit body. signatureData is optional at the wire level — the service
// enforces presence when the schema includes a visible signature field.
export const PublicFormSubmitBodySchema = z.object({
  answers: AnswersSchema,
  signatureData: z
    .object({
      imageBase64: z.string().min(1).max(2_000_000).optional(),
      typedSignature: z.string().min(1).max(200).optional(),
    })
    .optional()
    .nullable(),
});
export type PublicFormSubmitBody = z.infer<typeof PublicFormSubmitBodySchema>;
