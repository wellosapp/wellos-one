import { z } from 'zod';

// Zod schemas for the waitlist surface (R2 §10). Mirrors the WaitlistEntry
// Prisma model. Wire format: dates as ISO 8601 strings; the service layer
// parses to Date.
//
// At least one of contactEmail / contactPhone must be present — the matching
// engine + Epic 8 notification dispatch both need a way to reach the client.
// The cross-field check lives at the bottom of each create schema via
// `.superRefine` so error messages attach to the right field path.

const TRIM_NONEMPTY = z.string().trim().min(1);

const ISO_DATETIME = z.string().datetime({ offset: true });

// Trim-then-optional helper: empty strings become undefined so the service
// layer can branch on "absent" cleanly.
const OPTIONAL_TRIMMED = z
  .string()
  .trim()
  .optional()
  .or(z.literal('').transform(() => undefined));

const OPTIONAL_EMAIL = z
  .string()
  .trim()
  .email('Use a valid email address')
  .optional()
  .or(z.literal('').transform(() => undefined));

const TIME_OF_DAY = z.enum(['morning', 'afternoon', 'evening', 'any']);

const WAITLIST_STATUS = z.enum([
  'active',
  'offered',
  'claimed',
  'expired',
  'cancelled',
]);

/** Shared body fields used by both public POST and admin (future) write paths. */
const WaitlistEntryWriteBase = z.object({
  locationId: TRIM_NONEMPTY,
  serviceId: TRIM_NONEMPTY,
  staffId: OPTIONAL_TRIMMED,
  contactName: TRIM_NONEMPTY.max(120),
  contactEmail: OPTIONAL_EMAIL,
  contactPhone: OPTIONAL_TRIMMED,
  preferredStart: ISO_DATETIME.optional(),
  preferredEnd: ISO_DATETIME.optional(),
  preferredTimeOfDay: TIME_OF_DAY.optional(),
  smsOptIn: z.boolean(),
  notes: OPTIONAL_TRIMMED,
});

/** POST /public/booking/waitlist body. */
export const CreatePublicWaitlistBodySchema = WaitlistEntryWriteBase.extend({
  tenantSlug: TRIM_NONEMPTY,
}).superRefine((val, ctx) => {
  if (!val.contactEmail && !val.contactPhone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['contactEmail'],
      message: 'Provide an email or phone so we can reach you about an opening.',
    });
  }
  if (
    val.preferredStart &&
    val.preferredEnd &&
    new Date(val.preferredEnd) <= new Date(val.preferredStart)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['preferredEnd'],
      message: 'Preferred end must be after preferred start.',
    });
  }
});
export type CreatePublicWaitlistBody = z.infer<
  typeof CreatePublicWaitlistBodySchema
>;

// Same shape as schemas/service.ts / clientTag.ts — query bool that handles
// both real booleans and `?flag=true` strings.
const QueryBoolFlag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true' || v === '1');

/** GET /admin/waitlist query params. */
export const ListWaitlistQuerySchema = z.object({
  status: WAITLIST_STATUS.optional(),
  serviceId: TRIM_NONEMPTY.optional(),
  staffId: TRIM_NONEMPTY.optional(),
  q: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  includeExpired: QueryBoolFlag,
});
export type ListWaitlistQuery = z.infer<typeof ListWaitlistQuerySchema>;

export const WaitlistIdParamsSchema = z.object({
  id: TRIM_NONEMPTY,
});
export type WaitlistIdParams = z.infer<typeof WaitlistIdParamsSchema>;

/** POST /admin/waitlist/:id/offer body — optional appointment id pointer. */
export const OfferWaitlistBodySchema = z
  .object({
    appointmentId: OPTIONAL_TRIMMED,
  })
  .optional();
export type OfferWaitlistBody = z.infer<typeof OfferWaitlistBodySchema>;
