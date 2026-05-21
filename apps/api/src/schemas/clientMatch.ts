import { z } from 'zod';

// Zod request/response shapes for the dispute + admin-queue surface that
// backs "Returning-client recognition" (docs/04-booking-flow.md §B + the
// "Not You?" escape hatch). PR 2 of 3 — the public POST is hit from the
// booking confirmation card; the admin GET/POST drives the disputed
// matches queue under /admin/clients (or wherever the staff UI puts it).
//
// Auth gating for the public route is intentionally NOT a signed token —
// MVP design choice. We gate on (a) appointment existence within the
// tenant, (b) clientMatchDisputed === false, (c) a 30-min dispute window
// from createdAt. The route layer enforces those; this file only validates
// the request shapes.

const TRIM_NONEMPTY = z.string().trim().min(1);

const OPTIONAL_TRIM_NONEMPTY = z
  .string()
  .trim()
  .min(1)
  .optional()
  .or(z.literal('').transform(() => undefined));

const EMAIL = z.string().trim().email().max(254);

const PHONE = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .optional()
  .or(z.literal('').transform(() => undefined));

// "i_am_new"     — escape hatch: detach the appointment from the matched
//                   Client and create a fresh one belonging to the same
//                   email submitted at booking time.
// "wrong_person" — flag for staff review without detaching. The "I'm
//                   Sarah, use that account → magic link" branch in the
//                   spec is deferred to the magic-link epic; until then
//                   wrong_person just adds the appointment to the staff
//                   queue.
const DisputeBranchSchema = z.enum(['i_am_new', 'wrong_person']);

const NewClientPayloadSchema = z.object({
  firstName: TRIM_NONEMPTY.max(80),
  lastName: z.string().trim().max(80).optional()
    .or(z.literal('').transform(() => undefined)),
  // Must match the booking's submitted email — checked at the service
  // layer (we don't have the booking email here). Format-validated only.
  email: EMAIL,
  phone: PHONE,
});

export const DisputeMatchBodySchema = z
  .object({
    branch: DisputeBranchSchema,
    newClient: NewClientPayloadSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.branch === 'i_am_new' && !val.newClient) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newClient'],
        message: 'newClient is required when branch is "i_am_new".',
      });
    }
  });
export type DisputeMatchBody = z.infer<typeof DisputeMatchBodySchema>;

export const DisputeMatchParamsSchema = z.object({
  appointmentId: TRIM_NONEMPTY,
});
export type DisputeMatchParams = z.infer<typeof DisputeMatchParamsSchema>;

// Query strings always arrive as strings; parse explicitly so
// ?includeResolved=false round-trips to false.
const QueryBool = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true' || v === '1');

export const ListDisputedMatchesQuerySchema = z.object({
  // Opaque cursor — we use the appointment id (cuid). Pagination is
  // ordered by createdAt DESC then id DESC so cuid alone is enough to
  // disambiguate ties.
  cursor: OPTIONAL_TRIM_NONEMPTY,
  limit: z.coerce.number().int().min(1).max(100).default(25),
  // When false (default), rows with clientMatchDisputed === false AND a
  // prior staff-review audit row are filtered out (already resolved /
  // already dismissed). When true, every disputed-or-ambiguous row in the
  // tenant is returned regardless of staffReviewedAt.
  includeResolved: QueryBool,
});
export type ListDisputedMatchesQuery = z.infer<
  typeof ListDisputedMatchesQuerySchema
>;

export const ResolveDisputedMatchParamsSchema = DisputeMatchParamsSchema;
export type ResolveDisputedMatchParams = z.infer<
  typeof ResolveDisputedMatchParamsSchema
>;

export const ResolveDisputedMatchBodySchema = z
  .object({
    action: z.enum(['dismiss', 'reassign_to_client']),
    targetClientId: TRIM_NONEMPTY.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.action === 'reassign_to_client' && !val.targetClientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetClientId'],
        message: 'targetClientId is required when action is "reassign_to_client".',
      });
    }
  });
export type ResolveDisputedMatchBody = z.infer<
  typeof ResolveDisputedMatchBodySchema
>;
