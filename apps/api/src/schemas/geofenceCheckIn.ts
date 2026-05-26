import { z } from 'zod';

// Zod schemas for the public geofence check-in routes (PR 8b of the
// Geofence Auto Check-in epic). The PWA polls geolocation and POSTs the
// current fix to /public/class-bookings/:id/geofence-check-in; the server
// runs the 7 validations from docs/specs/geofence-check-in-epic.md.

// Body for POST /public/class-bookings/:bookingId/geofence-check-in.
//
// `accuracyMeters` accepts up to 10,000 m as a sanity cap — readings above
// 100 m are rejected by the service layer with code LOW_ACCURACY (see
// submitGeofenceCheckIn). The wider Zod cap lets us audit the inbound
// payload so we can tell "the client sent a 5km fix" apart from "the
// client sent nonsense".
//
// `timestamp` is informational only — the server uses its own clock for
// the check-in window. We accept it so the PWA can include the client's
// view of `now` for debugging time-skew issues in audit logs.
export const GeofenceCheckInBodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(10_000),
  timestamp: z.string().datetime({ offset: true }).optional(),
});
export type GeofenceCheckInBody = z.infer<typeof GeofenceCheckInBodySchema>;

export const GeofenceCheckInParamsSchema = z.object({
  bookingId: z.string().min(1),
});
export type GeofenceCheckInParams = z.infer<typeof GeofenceCheckInParamsSchema>;
