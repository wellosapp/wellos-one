import { z } from 'zod';

// Zod schemas for /admin/services/:serviceId/form-rules. Mirrors the CHECK
// constraints in forms_system_phase_1_schema migration.

export const RequiredLevelSchema = z.enum([
  'optional',
  'soft_required',
  'hard_required',
]);

export const TimingSchema = z.enum([
  'before_booking',
  'before_appointment',
  'optional',
]);

export const UpsertFormAssignmentRuleBodySchema = z.object({
  formDefinitionGroupId: z.string().min(1).max(128),
  requiredLevel: RequiredLevelSchema,
  timing: TimingSchema,
  sendAutomaticallyAfterBooking: z.boolean(),
  requireProviderReview: z.boolean(),
  expiresAfterDays: z.number().int().min(1).max(365).nullable(),
  active: z.boolean(),
});

export const UpdateFormAssignmentRuleBodySchema = z.object({
  requiredLevel: RequiredLevelSchema,
  timing: TimingSchema,
  sendAutomaticallyAfterBooking: z.boolean(),
  requireProviderReview: z.boolean(),
  expiresAfterDays: z.number().int().min(1).max(365).nullable(),
  active: z.boolean(),
});

export const ServiceFormRuleParamsSchema = z.object({
  serviceId: z.string().min(1),
});

export const ServiceFormRuleIdParamsSchema = z.object({
  serviceId: z.string().min(1),
  ruleId: z.string().min(1),
});

export type UpsertFormAssignmentRuleBody = z.infer<
  typeof UpsertFormAssignmentRuleBodySchema
>;
export type UpdateFormAssignmentRuleBody = z.infer<
  typeof UpdateFormAssignmentRuleBodySchema
>;
