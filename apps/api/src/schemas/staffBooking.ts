import { z } from 'zod';

// GET /admin/staff-booking/client-context — Quick Book CRM snapshot (staff booking slice).

export const StaffBookingClientContextQuerySchema = z.object({
  // Client PK is cuid() in schema; keep permissive like other admin routes.
  clientId: z.string().min(1),
  serviceId: z.string().min(1).optional(),
  staffId: z.string().min(1).optional(),
});

export type StaffBookingClientContextQuery = z.infer<
  typeof StaffBookingClientContextQuerySchema
>;
