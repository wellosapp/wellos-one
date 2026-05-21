import { z } from 'zod';

// Zod schemas for the public slot-hold surface (R2 §9). All times on the
// wire are UTC ISO strings; the service layer parses to Date.
//
// Why public-only: holds exist to coordinate concurrent anonymous bookers.
// Staff calendar drag/quick-book happens through the authenticated admin
// appointment flow which already has DB-level exclusion via the
// `appointments_no_overlap_per_staff` constraint.

const TRIM_NONEMPTY = z.string().trim().min(1);

const ISO_DATETIME = z.string().datetime({ offset: true });

// Caps mirror existing public-surface zod usage (calendar-feed token).
const IDEMPOTENCY_KEY = z.string().trim().min(8).max(128).optional();

// Optional client-supplied browser fingerprint. Treated as untrusted text —
// never used for authorization. The availability engine uses it to hide
// the requesting client's own active holds from their own slot listing.
const FINGERPRINT = z.string().trim().min(8).max(128).optional();

export const CreateSlotHoldBodySchema = z.object({
  tenantSlug: TRIM_NONEMPTY,
  locationId: TRIM_NONEMPTY,
  serviceId: TRIM_NONEMPTY,
  staffId: TRIM_NONEMPTY,
  startsAt: ISO_DATETIME,
  idempotencyKey: IDEMPOTENCY_KEY,
  fingerprint: FINGERPRINT,
});
export type CreateSlotHoldBody = z.infer<typeof CreateSlotHoldBodySchema>;

export const SlotHoldIdParamsSchema = z.object({
  id: TRIM_NONEMPTY,
});
export type SlotHoldIdParams = z.infer<typeof SlotHoldIdParamsSchema>;
