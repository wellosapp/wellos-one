import { z } from 'zod';

// Query schema for GET /admin/class-check-in-attempts. PR 10 of the
// Geofence Auto Check-in epic. Backs the admin fraud-audit list page.

// Result enum mirrors the check constraint in the
// class_check_in_attempt.result column (see PR 8b migration). Keep in
// sync with apps/api/src/services/geofenceCheckInService.ts.
export const ClassCheckInAttemptResultSchema = z.enum([
  'success',
  'out_of_range',
  'out_of_window',
  'low_accuracy',
  'suspicious_pattern',
  'rate_limited',
  'error',
]);
export type ClassCheckInAttemptResult = z.infer<
  typeof ClassCheckInAttemptResultSchema
>;

export const ListClassCheckInAttemptsQuerySchema = z.object({
  // ISO timestamps. Default to last 7 days when both omitted is the route
  // layer's job — Zod just validates the shape.
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  result: ClassCheckInAttemptResultSchema.optional(),
  classInstanceId: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  // `coerce.number` so `?take=50` (string) parses; min 1, max 200 mirrors
  // the service-layer cap.
  take: z.coerce.number().int().min(1).max(200).optional(),
});
export type ListClassCheckInAttemptsQuery = z.infer<
  typeof ListClassCheckInAttemptsQuerySchema
>;
