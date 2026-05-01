import { z } from 'zod';

// Zod schemas for triage questions + answers + promote-to-note (E3-S4d).
//
// Per docs/04-booking UI UX Update/wellos-booking-ui-walkthrough-v2-notes-package
// §8.5 + master-spec §5.2 + 05-booking-enhancements.md §2.
//
// ServiceBookingQuestion is per-service triage (e.g. "Pressure preference?",
// "Any nut allergies?"). Asked at public booking time; answers ride on the
// appointment via AppointmentBookingAnswer. Staff/admin can promote any
// answer to a permanent ClientNote.

const TRIM_NONEMPTY = z.string().trim().min(1);

// Mirrors ServiceBookingQuestionType (schema.prisma:174).
export const QuestionTypeSchema = z.enum([
  'chips_single',
  'chips_multi',
  'short_text',
  'long_text',
  'slider',
  'yes_no',
  'photo_upload',
]);
export type QuestionTypeInput = z.infer<typeof QuestionTypeSchema>;

// Per-questionType options validation. Lives next to the create/update
// schemas so the route layer rejects mismatched options before the
// service layer touches them.
const ChipOptionSchema = z.object({
  value: TRIM_NONEMPTY,
  label: TRIM_NONEMPTY,
});
const ChipsOptionsSchema = z.array(ChipOptionSchema).min(2).max(20);

const SliderOptionsSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
  step: z.number().int().positive().optional(),
}).refine((v) => v.min < v.max, {
  message: 'min must be less than max',
});

const PhotoUploadOptionsSchema = z.object({
  maxCount: z.number().int().min(1).max(10),
});

// Options validator returns a normalized JSON value the service writes
// to the options column. For text/yes_no there's no options shape; we
// store an empty array to keep the column non-null-ish.
function validateOptions(
  type: QuestionTypeInput,
  options: unknown,
):
  | { ok: true; value: unknown }
  | { ok: false; field: string; message: string } {
  switch (type) {
    case 'chips_single':
    case 'chips_multi': {
      const r = ChipsOptionsSchema.safeParse(options);
      if (!r.success)
        return {
          ok: false,
          field: 'options',
          message: r.error.issues[0]?.message ?? 'Invalid chips options',
        };
      return { ok: true, value: r.data };
    }
    case 'slider': {
      const r = SliderOptionsSchema.safeParse(options);
      if (!r.success)
        return {
          ok: false,
          field: 'options',
          message: r.error.issues[0]?.message ?? 'Invalid slider options',
        };
      return { ok: true, value: r.data };
    }
    case 'photo_upload': {
      const r = PhotoUploadOptionsSchema.safeParse(options);
      if (!r.success)
        return {
          ok: false,
          field: 'options',
          message:
            r.error.issues[0]?.message ?? 'Invalid photo_upload options',
        };
      return { ok: true, value: r.data };
    }
    default:
      // short_text, long_text, yes_no — no options shape.
      return { ok: true, value: [] };
  }
}
export { validateOptions };

// gatingRule shape (when isGating=true).
//   if_value:     value to compare answer against (loose)
//   block_with:   message shown to the customer
//   block_action: 'reject_booking' | 'redirect_to_consult' (loose)
const GatingRuleSchema = z.object({
  if_value: z.unknown(),
  block_with: TRIM_NONEMPTY,
  block_action: z.enum(['reject_booking', 'redirect_to_consult']),
});

const QUESTION_LABEL = z.string().trim().min(1).max(200);
const QUESTION_KEY = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_]+$/, 'Use snake_case alphanumerics + underscore only');
const HELPER_TEXT = z
  .string()
  .max(500)
  .optional()
  .or(z.literal('').transform(() => undefined));

export const CreateBookingQuestionBodySchema = z.object({
  questionKey: QUESTION_KEY,
  questionLabel: QUESTION_LABEL,
  helperText: HELPER_TEXT,
  questionType: QuestionTypeSchema,
  options: z.unknown(), // validated post-parse via validateOptions
  isRequired: z.boolean().optional(),
  isGating: z.boolean().optional(),
  gatingRule: GatingRuleSchema.optional(),
  displayOrder: z.number().int().min(0).optional(),
});
export type CreateBookingQuestionBody = z.infer<
  typeof CreateBookingQuestionBodySchema
>;

// PATCH allows editing the safe subset. questionKey is intentionally
// immutable post-create — it's the stable join key used by snapshot
// columns on AppointmentBookingAnswer (questionKeySnapshot).
export const UpdateBookingQuestionBodySchema = z
  .object({
    questionLabel: QUESTION_LABEL.optional(),
    helperText: HELPER_TEXT,
    questionType: QuestionTypeSchema.optional(),
    options: z.unknown().optional(),
    isRequired: z.boolean().optional(),
    isGating: z.boolean().optional(),
    gatingRule: GatingRuleSchema.nullable().optional(),
    displayOrder: z.number().int().min(0).optional(),
  })
  .strict();
export type UpdateBookingQuestionBody = z.infer<
  typeof UpdateBookingQuestionBodySchema
>;

export const ServiceIdParamsSchema = z.object({
  serviceId: z.string().min(1),
});
export type ServiceIdParams = z.infer<typeof ServiceIdParamsSchema>;

export const QuestionIdParamsSchema = z.object({
  serviceId: z.string().min(1),
  questionId: z.string().min(1),
});
export type QuestionIdParams = z.infer<typeof QuestionIdParamsSchema>;

export const AppointmentIdParamsSchema = z.object({
  appointmentId: z.string().min(1),
});
export type AppointmentIdParams = z.infer<typeof AppointmentIdParamsSchema>;

export const BookingAnswerIdParamsSchema = z.object({
  appointmentId: z.string().min(1),
  answerId: z.string().min(1),
});
export type BookingAnswerIdParams = z.infer<
  typeof BookingAnswerIdParamsSchema
>;

// promote-to-note — narrowed category set per spec §8.5 (only the
// triage-relevant categories are valid here; the full ClientNote
// surface allows more).
export const PromoteAnswerCategorySchema = z.enum([
  'preference',
  'allergy',
  'medical',
  'general',
]);
export type PromoteAnswerCategoryInput = z.infer<
  typeof PromoteAnswerCategorySchema
>;

// Mirrors ClientNoteAlertTrigger from schemas/clientNote.ts. Kept local
// to avoid a cross-schema import (S4d shouldn't depend on S4a's surface).
export const PromoteAnswerAlertTriggerSchema = z.enum([
  'booking',
  'check_in',
  'checkout',
]);

export const PromoteAnswerToNoteBodySchema = z.object({
  category: PromoteAnswerCategorySchema,
  title: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  pinned: z.boolean().optional(),
  alertTriggers: z
    .array(PromoteAnswerAlertTriggerSchema)
    .max(3)
    .optional(),
  // Optional override of the note body. Default is
  // "{question.label}: {answer rendered}" computed server-side.
  body: z
    .string()
    .trim()
    .max(8000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type PromoteAnswerToNoteBody = z.infer<
  typeof PromoteAnswerToNoteBodySchema
>;
