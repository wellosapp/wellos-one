import { z } from 'zod';

// Zod schemas + DTO for the LocationGeofence admin surface. PR 6 of the
// Geofence Auto Check-in epic. One geofence per location (unique on
// locationId in the schema); upsert + delete are admin-only, GET is staff.
//
// Lat/lng arrive as numbers from the editor UI (Leaflet+OSM map picker in
// PR 7) but we coerce to support clients that round-trip the values through
// strings (e.g. URL-decoded paste). Bounds match the LocationGeofence model:
//   center_lat                  decimal(11, 8)  — clamped to [-90,  90]
//   center_lng                  decimal(11, 8)  — clamped to [-180, 180]
//   radius_meters               int             — [25, 200]
//   check_in_window_before_min  int             — [0, 60]
//   check_in_window_after_min   int             — [0, 30]
//
// Service layer converts Decimal → number before returning so the wire
// always uses number for lat/lng (Prisma's Decimal serializes to string
// otherwise, which would force FE to coerce).

export const LocationIdParamsSchema = z.object({
  locationId: z.string().min(1),
});
export type LocationIdParams = z.infer<typeof LocationIdParamsSchema>;

export const UpsertLocationGeofenceBodySchema = z.object({
  centerLat: z.coerce.number().min(-90).max(90),
  centerLng: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(25).max(200),
  checkInWindowBeforeMinutes: z.coerce.number().int().min(0).max(60),
  checkInWindowAfterMinutes: z.coerce.number().int().min(0).max(30),
  enabled: z.boolean(),
});
export type UpsertLocationGeofenceBody = z.infer<
  typeof UpsertLocationGeofenceBodySchema
>;

// Response shape — Decimal columns converted to number at the service
// boundary so frontends don't have to deal with string lat/lng.
export interface LocationGeofenceDto {
  id: string;
  tenantId: string;
  locationId: string;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  checkInWindowBeforeMinutes: number;
  checkInWindowAfterMinutes: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
