import { z } from 'zod';

// Zod schemas for the ClassBooking + ClassWaitlistEntry admin surface.
// Phase 3a of the Classes epic. Public /book Classes flow is Phase 3b;
// auto-promote-on-cancel is Phase 3c. Payments deferred to Epic 6.
//
// State for both rows is stored as TEXT on the table (mirrors ClassInstance);
// values are validated at the API edge. The route layer maps service-layer
// typed errors (CLASS_FULL / WAITLIST_FULL / INSTANCE_NOT_BOOKABLE /
// DUPLICATE_BOOKING) to 409 responses — see routes/admin/class-bookings.ts.

export const ClassBookingStateSchema = z.enum([
  'confirmed',
  'cancelled_by_client',
  'cancelled_by_studio',
  'no_show',
  'checked_in',
  'completed',
]);
export type ClassBookingStateInput = z.infer<typeof ClassBookingStateSchema>;

export const ClassWaitlistEntryStateSchema = z.enum([
  'waiting',
  'promoted',
  'expired',
  'cancelled',
]);
export type ClassWaitlistEntryStateInput = z.infer<
  typeof ClassWaitlistEntryStateSchema
>;

// Routes are nested under /admin/class-instances/:instanceId, so the params
// arrive together. Booking and waitlist-entry IDs use the same naming.
export const InstanceIdParamsSchema = z.object({
  instanceId: z.string().min(1),
});
export type InstanceIdParams = z.infer<typeof InstanceIdParamsSchema>;

export const InstanceBookingIdParamsSchema = z.object({
  instanceId: z.string().min(1),
  bookingId: z.string().min(1),
});
export type InstanceBookingIdParams = z.infer<
  typeof InstanceBookingIdParamsSchema
>;

export const InstanceWaitlistIdParamsSchema = z.object({
  instanceId: z.string().min(1),
  entryId: z.string().min(1),
});
export type InstanceWaitlistIdParams = z.infer<
  typeof InstanceWaitlistIdParamsSchema
>;

// Idempotency key: UUIDs are the expected shape (frontend generates via
// crypto.randomUUID()), but we accept any short-to-medium opaque string so
// integration tests and curl commands aren't forced through a UUID generator.
const IDEMPOTENCY_KEY = z
  .string()
  .uuid()
  .or(z.string().min(8).max(64));

export const CreateClassBookingBodySchema = z.object({
  clientId: z.string().min(1),
  idempotencyKey: IDEMPOTENCY_KEY,
});
export type CreateClassBookingBody = z.infer<
  typeof CreateClassBookingBodySchema
>;

// initiatedBy is admin-only ('studio') in Phase 3a. Phase 3b adds 'client'
// for the public magic-link cancel flow.
export const CancelClassBookingBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
  initiatedBy: z.enum(['studio']).default('studio'),
});
export type CancelClassBookingBody = z.infer<
  typeof CancelClassBookingBodySchema
>;

export const JoinWaitlistBodySchema = z.object({
  clientId: z.string().min(1),
});
export type JoinWaitlistBody = z.infer<typeof JoinWaitlistBodySchema>;

// Roster listing — `includeCancelled` defaults to false. Encoded as a string
// flag so it can be set from a URL search param.
export const ListRosterQuerySchema = z.object({
  includeCancelled: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});
export type ListRosterQuery = z.infer<typeof ListRosterQuerySchema>;

// Phase 4 — check-in body. `late` is a visual indicator only; no policy
// enforcement attached.
export const CheckInClassBookingBodySchema = z.object({
  late: z.boolean().optional().default(false),
});
export type CheckInClassBookingBody = z.infer<
  typeof CheckInClassBookingBodySchema
>;

// Phase 4 — admin override of a class instance's lifecycle state. `cancelled`
// is intentionally excluded — that path stays on POST .../cancel.
export const SetClassInstanceStateBodySchema = z.object({
  state: z.enum(['scheduled', 'in_progress', 'completed']),
});
export type SetClassInstanceStateBody = z.infer<
  typeof SetClassInstanceStateBodySchema
>;
