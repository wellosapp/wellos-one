import { z } from 'zod';

import type { ListAvailabilityQuery } from './appointment.js';
import { CreateAppointmentBodySchema } from './appointment.js';
const TRIM_NONEMPTY = z.string().trim().min(1);

/** Single tenant handle for public routes (URL subdomain mapping is Phase 2). */
export const TenantSlugQuerySchema = z.object({
  tenantSlug: TRIM_NONEMPTY,
});

export type TenantSlugQuery = z.infer<typeof TenantSlugQuerySchema>;

// Re-use availability query shape plus tenant slug for resolution.
export const PublicListAvailabilityQuerySchema = TenantSlugQuerySchema.extend({
  staffId: TRIM_NONEMPTY,
  serviceId: TRIM_NONEMPTY,
  locationId: TRIM_NONEMPTY,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  tz: z
    .string()
    .min(3)
    .max(80)
    .regex(
      /^[A-Za-z_+\-]+\/[A-Za-z_+\-]+(?:\/[A-Za-z_+\-]+)?$/,
      'Use IANA TZ like America/New_York',
    )
    .optional(),
});

export type PublicListAvailabilityQuery = z.infer<
  typeof PublicListAvailabilityQuerySchema
>;

/** Strip tenantSlug before calling listAvailableSlots (tenant-scoped separately). */
export function toListAvailabilityQuery(
  q: PublicListAvailabilityQuery,
): ListAvailabilityQuery {
  return {
    staffId: q.staffId,
    serviceId: q.serviceId,
    locationId: q.locationId,
    date: q.date,
    tz: q.tz,
  };
}

const ClientGuestSchema = z.object({
  firstName: TRIM_NONEMPTY,
  lastName: z
    .string()
    .trim()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  email: z.string().trim().email(),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

// Appointment subset for public create — reuse scheduling FK validation via CreateAppointmentBodySchema.pick
const SchedulingPick = CreateAppointmentBodySchema.pick({
  locationId: true,
  staffId: true,
  serviceId: true,
  scheduledStartAt: true,
  notes: true,
});

export const PublicCreateAppointmentBodySchema = z
  .object({
    tenantSlug: TRIM_NONEMPTY,
    guest: ClientGuestSchema,
  })
  .merge(SchedulingPick)
  .strict();

export type PublicCreateAppointmentBody = z.infer<
  typeof PublicCreateAppointmentBodySchema
>;
