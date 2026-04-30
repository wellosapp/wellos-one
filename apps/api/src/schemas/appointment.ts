import { z } from 'zod';

// Zod schemas for the Appointment admin CRUD surface (Epic 3 / E3-S1).
//
// Field rules per docs/09-dev-handoff.md "Epic 3" + the synthesis from the
// 4 booking spec docs:
//   - All times are UTC ISO strings on the wire; service layer parses to Date
//   - Default state on admin-create is `confirmed` (no REQUEST_APPROVAL flow yet)
//   - notes is optional free-form
//   - scheduledStartAt is required; scheduledEndAt is computed server-side from
//     Service.durationMinutes (do NOT take it from the client — too easy to drift)
//
// Length / range caps are upper bounds against abuse, not UX guidance.

const TRIM_NONEMPTY = z.string().trim().min(1);

// Appointment states the API surface accepts. Matches the Prisma enum order
// and the underlying DB enum. Service layer validates allowed transitions.
export const AppointmentStatusSchema = z.enum([
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
]);
export type AppointmentStatusInput = z.infer<typeof AppointmentStatusSchema>;

// UTC ISO datetime, second-precision or finer. Zod's `datetime()` defaults to
// requiring trailing 'Z' or offset, which is what we want.
const ISO_DATETIME = z.string().datetime({ offset: true });

// Day-only ISO date (e.g. "2026-05-12"). Used by the availability endpoint.
const ISO_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

// IANA timezone identifier (e.g. "America/New_York"). Loose validation:
// Continent/City form. Real validation happens at runtime via the Intl API
// inside availabilityService — a typo'd zone surfaces as a 400 there.
const IANA_TZ = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[A-Za-z_+\-]+\/[A-Za-z_+\-]+(?:\/[A-Za-z_+\-]+)?$/, 'Use IANA TZ like America/New_York')
  .optional();

// Cap notes at the same upper bound as Client.notes to keep UX consistent.
const NOTES = z
  .string()
  .max(4000)
  .optional()
  .or(z.literal('').transform(() => undefined));

const REASON = z
  .string()
  .max(1000)
  .optional()
  .or(z.literal('').transform(() => undefined));

export const CreateAppointmentBodySchema = z.object({
  locationId: TRIM_NONEMPTY,
  clientId: TRIM_NONEMPTY,
  staffId: TRIM_NONEMPTY,
  serviceId: TRIM_NONEMPTY,
  scheduledStartAt: ISO_DATETIME,
  // Default state on admin-created appointments is `confirmed` — see Epic 3
  // plan. Clients can override to schedule but most won't bother.
  state: AppointmentStatusSchema.optional(),
  notes: NOTES,
});
export type CreateAppointmentBody = z.infer<typeof CreateAppointmentBodySchema>;

// PATCH only allows editing the editable subset. Time triple (start/end/
// duration) and FK references are NOT editable to keep the EXCLUDE re-check
// surface small — cancel + create a new appointment if you need to change
// the time. State changes go through POST /:id/transition.
export const UpdateAppointmentBodySchema = z
  .object({
    notes: NOTES,
  })
  .strict();
export type UpdateAppointmentBody = z.infer<typeof UpdateAppointmentBodySchema>;

export const TransitionAppointmentBodySchema = z.object({
  to: AppointmentStatusSchema,
  reason: REASON,
});
export type TransitionAppointmentBody = z.infer<typeof TransitionAppointmentBodySchema>;

// Same query-bool helpers as schemas/service.ts. Local to avoid premature
// shared-helper extraction; hoist when a fourth schema needs them.
const QueryBoolFlag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true' || v === '1');

// GET /admin/appointments query params. All optional.
//   staffId / clientId — filter to one staff or one client
//   from / to          — UTC ISO range; either bound optional
//   state              — filter by exact state
//   take / skip        — offset pagination, capped to prevent abuse
//   includeDeleted     — admin-only opt-in to surface soft-deleted rows
export const ListAppointmentsQuerySchema = z.object({
  staffId: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  state: AppointmentStatusSchema.optional(),
  from: ISO_DATETIME.optional(),
  to: ISO_DATETIME.optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
  includeDeleted: QueryBoolFlag,
});
export type ListAppointmentsQuery = z.infer<typeof ListAppointmentsQuerySchema>;

export const AppointmentIdParamsSchema = z.object({
  id: z.string().min(1),
});
export type AppointmentIdParams = z.infer<typeof AppointmentIdParamsSchema>;

// GET /admin/availability query params. All required except `tz`, which
// defaults to the location's stored timezone. Specifying `tz` lets a caller
// preview availability in a different zone (rare; mostly used by tests).
export const ListAvailabilityQuerySchema = z.object({
  staffId: TRIM_NONEMPTY,
  serviceId: TRIM_NONEMPTY,
  locationId: TRIM_NONEMPTY,
  date: ISO_DATE,
  tz: IANA_TZ,
});
export type ListAvailabilityQuery = z.infer<typeof ListAvailabilityQuerySchema>;
