import { z } from 'zod';

// Zod schemas for the RecurrenceRule admin CRUD surface. Phase 2b of the
// Classes epic — admin sets a template once ("every M/W/F at 9am") and the
// manual generate endpoint materialises ClassInstance rows from it. The
// cron that auto-runs the generator weekly is Epic 8 (BullMQ).
//
// Mirrors classInstance.ts for shape. byday is an array of RFC 5545-style
// day codes — SU, MO, TU, WE, TH, FR, SA. startTime is "HH:MM" 24-hour in
// the rule's timezone; the generator converts to UTC via date-fns-tz so
// DST flips don't shift the class's local hour. Timezone is per-rule
// (not per-tenant) so multi-location tenants can mix zones if they
// expand later.

export const RecurrenceRuleIdParamsSchema = z.object({
  id: z.string().min(1),
});
export type RecurrenceRuleIdParams = z.infer<
  typeof RecurrenceRuleIdParamsSchema
>;

export const BYDAY_VALUES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export type ByDay = (typeof BYDAY_VALUES)[number];
const ByDaySchema = z.enum(BYDAY_VALUES);

const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
const HHMM = z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM');
const IANA_TZ = z.string().min(1);

export const CreateRecurrenceRuleBodySchema = z
  .object({
    classId: z.string().min(1),
    staffId: z.string().min(1),
    locationId: z.string().min(1),
    startDate: ISO_DATE,
    endDate: ISO_DATE.optional().nullable(),
    byday: z.array(ByDaySchema).min(1).max(7),
    startTime: HHMM,
    durationMinutes: z.number().int().min(5).max(720),
    timezone: IANA_TZ,
    active: z.boolean().default(true),
  })
  .refine((b) => !b.endDate || b.endDate >= b.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });
export type CreateRecurrenceRuleBody = z.infer<
  typeof CreateRecurrenceRuleBodySchema
>;

// PATCH body — every field optional. We re-validate the date ordering when
// both bounds are present in the same payload; cross-field consistency for
// a partial update (only endDate provided, startDate from existing row) is
// done in the service layer where the existing row is available.
export const UpdateRecurrenceRuleBodySchema = z
  .object({
    staffId: z.string().min(1).optional(),
    locationId: z.string().min(1).optional(),
    startDate: ISO_DATE.optional(),
    endDate: ISO_DATE.optional().nullable(),
    byday: z.array(ByDaySchema).min(1).max(7).optional(),
    startTime: HHMM.optional(),
    durationMinutes: z.number().int().min(5).max(720).optional(),
    timezone: IANA_TZ.optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (b) =>
      !(b.startDate && b.endDate) || b.endDate >= b.startDate,
    {
      message: 'endDate must be on or after startDate',
      path: ['endDate'],
    },
  )
  .refine((b) => Object.keys(b).length > 0, {
    message: 'At least one field required.',
  });
export type UpdateRecurrenceRuleBody = z.infer<
  typeof UpdateRecurrenceRuleBodySchema
>;

export const GenerateInstancesBodySchema = z.object({
  horizonWeeks: z.number().int().min(1).max(52).default(12),
});
export type GenerateInstancesBody = z.infer<
  typeof GenerateInstancesBodySchema
>;

export const ListRecurrenceRulesQuerySchema = z.object({
  classId: z.string().optional(),
  active: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) =>
      v === 'true' ? true : v === 'false' ? false : undefined,
    ),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});
export type ListRecurrenceRulesQuery = z.infer<
  typeof ListRecurrenceRulesQuerySchema
>;
