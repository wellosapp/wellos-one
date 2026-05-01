import { z } from 'zod';

// Zod schemas for the Tier-A aggregator endpoints (E3-S4b).
//
// Two read-only views:
//   GET /admin/appointments/:id/linked-records
//   GET /admin/clients/:clientId/timeline
//
// Both pull together rows from multiple tables (ClientNote, SoapNote,
// AppointmentBookingAnswer, MediaAsset). Tables that don't have data
// pipelines yet (S4c media, S4d triage, S4f SOAP) return empty arrays —
// the aggregator is wired so adding rows in those follow-up PRs lights
// up the UI without re-shaping the response.

export const AppointmentIdParamsSchema = z.object({
  id: z.string().min(1),
});
export type AppointmentIdParams = z.infer<typeof AppointmentIdParamsSchema>;

export const ClientIdParamsSchema = z.object({
  clientId: z.string().min(1),
});
export type ClientIdParams = z.infer<typeof ClientIdParamsSchema>;

// Query params for the client timeline. Pagination is by visit (one
// completed/scheduled appointment = one timeline item).
export const ClientTimelineQuerySchema = z.object({
  // Hard cap to prevent abuse; default tuned for the visit-timeline UI's
  // initial render. Frontend can paginate older visits if needed.
  take: z.coerce.number().int().min(1).max(100).default(20),
  skip: z.coerce.number().int().min(0).default(0),
  // Optional service filter — "show me only haircut visits" view.
  serviceId: z.string().min(1).optional(),
  // Optional staff filter — "show me only visits with Sara".
  staffId: z.string().min(1).optional(),
});
export type ClientTimelineQuery = z.infer<typeof ClientTimelineQuerySchema>;
