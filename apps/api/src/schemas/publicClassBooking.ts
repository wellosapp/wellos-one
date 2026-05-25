import { z } from 'zod';

// Public /book?type=classes — Zod schemas. Mirrors apps/api/src/schemas/
// publicBooking.ts for the appointment-side equivalents (Phase 3b of the
// Classes epic). Idempotency keys accept UUIDs OR short opaque strings so
// curl + integration tests can drive the endpoint without a UUID generator.

const TENANT_SLUG = z.string().trim().min(1).max(120);

const IDEMPOTENCY_KEY = z
  .string()
  .uuid()
  .or(z.string().min(8).max(64));

export const PublicClassCatalogQuerySchema = z.object({
  tenantSlug: TENANT_SLUG,
});
export type PublicClassCatalogQuery = z.infer<
  typeof PublicClassCatalogQuerySchema
>;

export const PublicClassInstancesQuerySchema = z.object({
  tenantSlug: TENANT_SLUG,
  fromDate: z.string().datetime({ offset: true }).optional(),
  toDate: z.string().datetime({ offset: true }).optional(),
  classId: z.string().trim().min(1).optional(),
  categoryId: z.string().trim().min(1).optional(),
  staffId: z.string().trim().min(1).optional(),
  locationId: z.string().trim().min(1).optional(),
});
export type PublicClassInstancesQuery = z.infer<
  typeof PublicClassInstancesQuerySchema
>;

const ClassGuestSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z
    .string()
    .trim()
    .max(80)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  email: z.string().trim().email(),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export const PublicCreateClassBookingBodySchema = z.object({
  tenantSlug: TENANT_SLUG,
  classInstanceId: z.string().trim().min(1),
  idempotencyKey: IDEMPOTENCY_KEY,
  guest: ClassGuestSchema,
});
export type PublicCreateClassBookingBody = z.infer<
  typeof PublicCreateClassBookingBodySchema
>;
