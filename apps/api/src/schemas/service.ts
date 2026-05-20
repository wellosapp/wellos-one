import { z } from 'zod';

// Zod schemas for the Service admin CRUD surface. Mirrors the shape of
// schemas/client.ts. Per docs/09-dev-handoff.md "Epic 2":
//   - name required; description optional
//   - durationMinutes is the booking grid; basePriceCents stored in cents
//   - color is a hex string at the DB layer; UI may map to design tokens
//   - active flag controls visibility on the public booking surface
//
// Length / range caps are upper bounds to prevent abuse, not UX guidance.

const TRIM_NONEMPTY = z.string().trim().min(1);

// 6-digit hex with leading "#". Matches what the Prisma column expects per
// docs/10-design-system-buildout.md sec 2.1 token format.
const HEX_COLOR = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use 6-digit hex like #3D7A5E')
  .optional()
  .or(z.literal('').transform(() => undefined));

// Cap durations and prices at sane upper bounds. 1440 min = 24h is plenty
// for any real-world service. 10,000,000 cents = $100,000 -- well above
// the largest plausible single-service price; rejects obvious typos.
const DURATION_MINUTES = z.number().int().min(1).max(1440);
const BASE_PRICE_CENTS = z.number().int().min(0).max(10_000_000);

const BUFFER_MINUTES = z.number().int().min(0).max(1440);

/** Mirrors Prisma enum ServicePriceDisplayMode. */
export const ServicePriceDisplayModeSchema = z.enum([
  'fixed',
  'starting_at',
  'range',
  'hidden',
  'consultation',
]);
export type ServicePriceDisplayModeInput = z.infer<
  typeof ServicePriceDisplayModeSchema
>;

/** Mirrors Prisma enum BookingPolicy. See R2 §11. */
export const BookingPolicySchema = z.enum([
  'instant',
  'request_approval',
  'staff_only',
]);
export type BookingPolicyInput = z.infer<typeof BookingPolicySchema>;

const OPTIONAL_CATEGORY_ID = z
  .union([
    z.string().trim().min(1),
    z.literal('').transform(() => undefined),
  ])
  .optional();

// Staff IDs eligible to perform this service (StaffService M2M, inverse
// of Staff.serviceIds). Inline on create/update so the assignment is
// atomic with the service write. Cap matches the cap on Staff.serviceIds.
const STAFF_IDS = z.array(z.string().min(1)).max(200).optional();

export const CreateServiceBodySchema = z.object({
  name: TRIM_NONEMPTY.max(200),
  description: z.string().max(4000).optional()
    .or(z.literal('').transform(() => undefined)),
  descriptionShort: z.string().max(500).optional()
    .or(z.literal('').transform(() => undefined)),
  durationMinutes: DURATION_MINUTES,
  basePriceCents: BASE_PRICE_CENTS,
  categoryId: OPTIONAL_CATEGORY_ID,
  displayOrder: z.number().int().min(0).max(1_000_000).optional(),
  publicVisible: z.boolean().optional(),
  bufferBeforeMinutes: BUFFER_MINUTES.optional(),
  bufferAfterMinutes: BUFFER_MINUTES.optional(),
  priceDisplayMode: ServicePriceDisplayModeSchema.optional(),
  color: HEX_COLOR,
  active: z.boolean().optional(),
  bookingPolicy: BookingPolicySchema.optional(),
  staffIds: STAFF_IDS,
});
export type CreateServiceBody = z.infer<typeof CreateServiceBodySchema>;

// PATCH: every field optional. Empty body is allowed but no-ops at the
// service layer (returns the existing row unchanged).
// categoryId may be null to clear the FK (explicit disconnect).
export const UpdateServiceBodySchema = CreateServiceBodySchema.partial().extend({
  categoryId: z
    .union([
      z.string().trim().min(1),
      z.literal('').transform(() => null),
      z.null(),
    ])
    .optional(),
});
export type UpdateServiceBody = z.infer<typeof UpdateServiceBodySchema>;

// Query strings only carry strings; z.coerce.boolean() is just Boolean(v),
// which returns true for any non-empty string — including the literal
// "false". Parse explicitly so ?includeDeleted=false round-trips to false.
// (Same helper shape as schemas/client.ts; kept local to avoid premature
// abstraction. Hoist to a shared helper when a third schema needs it.)
//
// Two flavors:
//   QueryBoolFlag   — missing is FALSE (e.g. includeDeleted=false default)
//   QueryBoolFilter — missing is UNDEFINED (no filter applied)
const QueryBoolFlag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true' || v === '1');

const QueryBoolFilter = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    return v === true || v === 'true' || v === '1';
  });

// GET /admin/services query params. All optional.
//   q              — substring search on name (case-insensitive)
//   active         — filter to active or inactive only (undefined = no filter)
//   take / skip    — offset pagination; cap take so a malicious caller can't
//                    request 10k rows in one shot
//   includeDeleted — admin-only opt-in to surface soft-deleted services
export const ListServicesQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  active: QueryBoolFilter,
  publicVisible: QueryBoolFilter,
  categoryId: z.string().min(1).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
  includeDeleted: QueryBoolFlag,
  /** When set, return only services this staff member may perform (StaffService M2M). Services with no assignments remain eligible for anyone. */
  staffId: z.string().min(1).optional(),
});
export type ListServicesQuery = z.infer<typeof ListServicesQuerySchema>;

export const ServiceIdParamsSchema = z.object({
  id: z.string().min(1),
});
export type ServiceIdParams = z.infer<typeof ServiceIdParamsSchema>;
