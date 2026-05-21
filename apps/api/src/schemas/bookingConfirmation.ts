import { z } from 'zod';

// Zod request shape + response type for the public booking confirmation
// endpoint (GET /public/booking/:appointmentId/confirmation). PR 3 of 3
// for "Returning-client recognition" (docs/04-booking-flow.md §B + the
// "Not You?" escape hatch).
//
// Auth gating is intentionally NOT a signed token — MVP design choice.
// We gate on (a) appointment existence (404), and (b) a 30-min window
// from createdAt (410). After the window the client must check email.
//
// The payload is deliberately redacted: only what an unauthenticated
// browser tab on the confirmation URL should see. No tenantId, no
// matchStrength internals (only the boolean disputed flag), no last
// names beyond the client's own first name.

const TRIM_NONEMPTY = z.string().trim().min(1);

export const BookingConfirmationParamsSchema = z.object({
  appointmentId: TRIM_NONEMPTY,
});
export type BookingConfirmationParams = z.infer<
  typeof BookingConfirmationParamsSchema
>;

export type BookingConfirmationResponse = {
  appointmentId: string;
  state: 'confirmed' | 'requested' | string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  service: { name: string };
  staff: { firstName: string };
  client: { firstName: string };
  /** True once the client has tapped "This isn't me". */
  clientMatchDisputed: boolean;
  /**
   * 'strong' → "Welcome back, X." headline copy.
   * Anything else (or null) → "You're all set, X." copy.
   */
  matchStrength: 'strong' | 'weak' | 'name_only' | 'ambiguous' | null;
  tenant: { name: string; timezone: string };
  /** ISO timestamp; cancellation deadline derived from booking settings. */
  cancellationDeadline: string;
  /** Cents. 0 means no fee — caller renders "Free to cancel". */
  cancellationFeeCents: number;
};
