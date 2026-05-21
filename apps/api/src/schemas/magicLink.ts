import { z } from 'zod';

// Zod schemas for the magic-link surface (PR M2).
//
// Public manage routes accept :token as a URL param. The route layer validates
// param shape but the heavy lifting is in magicLinkService.verifyAndRefresh.

const TRIM_NONEMPTY = z.string().trim().min(1);

const ISO_DATETIME = z.string().datetime({ offset: true });

/** :token param on /public/manage/:token and its action sub-routes. */
export const ManageTokenParamsSchema = z.object({
  token: z
    .string()
    .trim()
    // Random base64url string from crypto.randomBytes(32) — ~43 chars. Allow
    // a generous range so future widening doesn't require a schema bump.
    .min(20)
    .max(128),
});
export type ManageTokenParams = z.infer<typeof ManageTokenParamsSchema>;

/** :appointmentId param on POST /admin/appointments/:appointmentId/mint-manage-link. */
export const MintManageLinkParamsSchema = z.object({
  appointmentId: TRIM_NONEMPTY,
});
export type MintManageLinkParams = z.infer<typeof MintManageLinkParamsSchema>;

/** PATCH /public/manage/:token/cancel — client-supplied cancellation reason. */
export const CancelByMagicLinkBodySchema = z
  .object({
    reason: z
      .string()
      .max(500)
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  .strict()
  // Body itself is optional; an empty object is fine.
  .default({});
export type CancelByMagicLinkBody = z.infer<typeof CancelByMagicLinkBodySchema>;

/** PATCH /public/manage/:token/reschedule — new start time only. End time
 *  is recomputed server-side from Service.durationMinutes. */
export const RescheduleByMagicLinkBodySchema = z
  .object({
    newScheduledStartAt: ISO_DATETIME,
  })
  .strict();
export type RescheduleByMagicLinkBody = z.infer<
  typeof RescheduleByMagicLinkBodySchema
>;
