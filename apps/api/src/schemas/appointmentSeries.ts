import { z } from 'zod';

// Zod schemas for the AppointmentSeries admin CRUD surface (PR S2 — Tier B).
//
// The series describes a recurring template (client + staff + service +
// location + cadence + timeOfDay + duration). Each occurrence is a real
// Appointment row with `seriesId` set.
//
// Wire conventions:
//   - anchorDate / endsOn are YYYY-MM-DD strings interpreted in the
//     Location's timezone. The service layer combines them with timeOfDay
//     and the Location.timezone to produce UTC instants for each occurrence.
//   - timeOfDay is a 24h "HH:MM" local string.
//   - daysOfWeek uses ISO weekday numbers (1=Mon ... 7=Sun).
//   - End condition: exactly one of occurrenceCount OR endsOn is set.
//     Enforced application-side at create.

const TRIM_NONEMPTY = z.string().trim().min(1);

const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const YYYYMMDD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const CreateSeriesBodySchema = z
  .object({
    locationId: TRIM_NONEMPTY,
    clientId: TRIM_NONEMPTY,
    staffId: TRIM_NONEMPTY,
    serviceId: TRIM_NONEMPTY,
    cadence: z.enum(['weekly', 'biweekly', 'monthly']),
    daysOfWeek: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7),
    timeOfDay: z.string().regex(HHMM_REGEX, 'Use HH:MM (24h)'),
    // YYYY-MM-DD in the location timezone.
    anchorDate: z.string().regex(YYYYMMDD_REGEX, 'Use YYYY-MM-DD'),
    endCondition: z.union([
      z
        .object({
          occurrenceCount: z.number().int().min(1).max(365),
        })
        .strict(),
      z
        .object({
          endsOn: z.string().regex(YYYYMMDD_REGEX, 'Use YYYY-MM-DD'),
        })
        .strict(),
    ]),
  })
  .strict();
export type CreateSeriesBody = z.infer<typeof CreateSeriesBodySchema>;

export const ListSeriesQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    clientId: z.string().optional(),
    staffId: z.string().optional(),
    status: z.enum(['active', 'cancelled', 'completed']).optional(),
  })
  .strict();
export type ListSeriesQuery = z.infer<typeof ListSeriesQuerySchema>;

export const CancelSeriesBodySchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .strict();
export type CancelSeriesBody = z.infer<typeof CancelSeriesBodySchema>;

export const SeriesIdParamsSchema = z.object({
  id: z.string().min(1),
});
export type SeriesIdParams = z.infer<typeof SeriesIdParamsSchema>;
