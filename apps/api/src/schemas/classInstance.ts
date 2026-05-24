import { z } from 'zod';

// Zod schemas for the ClassInstance admin CRUD surface. Phase 2a of the
// Classes epic — manual scheduling of one-off occurrences. RecurrenceRule
// + cron land in Phase 2b; bookings + check-in are Phase 3-4.
//
// State is stored as TEXT on the row and validated at the edge here so we
// keep the enum surface in one place (mirrors the Tenant.bookingClientRecognitionMode
// pattern). Phase 2a only supports the manual `scheduled → cancelled` move;
// in_progress / completed transitions are Phase 4 cron work.

export const ClassInstanceStateSchema = z.enum([
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
]);
export type ClassInstanceStateInput = z.infer<typeof ClassInstanceStateSchema>;

export const ClassInstanceIdParamsSchema = z.object({
  id: z.string().min(1),
});
export type ClassInstanceIdParams = z.infer<typeof ClassInstanceIdParamsSchema>;

// Override caps mirror the Class template caps (max 500) to keep the upper
// bound consistent — a one-off workshop can't legitimately have a higher
// ceiling than the template would allow.
const CAPACITY_OVERRIDE = z.number().int().min(1).max(500);
const WAITLIST_OVERRIDE = z.number().int().min(0).max(500);

export const CreateClassInstanceBodySchema = z.object({
  classId: z.string().min(1),
  staffId: z.string().min(1),
  locationId: z.string().min(1),
  scheduledStartAt: z.string().datetime({ offset: true }),
  // scheduledEndAt is server-computed from class.durationMinutes + buffers
  // unless explicitly overridden. Optional in body.
  scheduledEndAt: z.string().datetime({ offset: true }).optional(),
  capacityOverride: CAPACITY_OVERRIDE.optional().nullable(),
  waitlistOverride: WAITLIST_OVERRIDE.optional().nullable(),
});
export type CreateClassInstanceBody = z.infer<typeof CreateClassInstanceBodySchema>;

export const UpdateClassInstanceBodySchema = z
  .object({
    staffId: z.string().min(1).optional(),
    locationId: z.string().min(1).optional(),
    scheduledStartAt: z.string().datetime({ offset: true }).optional(),
    scheduledEndAt: z.string().datetime({ offset: true }).optional(),
    capacityOverride: CAPACITY_OVERRIDE.optional().nullable(),
    waitlistOverride: WAITLIST_OVERRIDE.optional().nullable(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: 'At least one field required.',
  });
export type UpdateClassInstanceBody = z.infer<typeof UpdateClassInstanceBodySchema>;

export const CancelClassInstanceBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CancelClassInstanceBody = z.infer<typeof CancelClassInstanceBodySchema>;

export const ListClassInstancesQuerySchema = z.object({
  classId: z.string().min(1).optional(),
  staffId: z.string().min(1).optional(),
  locationId: z.string().min(1).optional(),
  fromDate: z.string().datetime({ offset: true }).optional(),
  toDate: z.string().datetime({ offset: true }).optional(),
  state: ClassInstanceStateSchema.optional(),
  take: z.coerce.number().int().min(1).max(500).default(100),
  skip: z.coerce.number().int().min(0).default(0),
});
export type ListClassInstancesQuery = z.infer<typeof ListClassInstancesQuerySchema>;
