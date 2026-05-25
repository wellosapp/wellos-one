// Type-safe wrappers for /admin/locations/:locationId/geofence endpoints
// (PR 6 of the Geofence Auto Check-in epic). Mirrors the Zod schemas in
// apps/api/src/schemas/locationGeofence.ts and the wire shapes returned by
// apps/api/src/services/locationGeofenceService.ts. Consumed by PR 7's
// admin geofence editor UI (Leaflet+OSM map picker). Kept in sync by hand
// at MVP — move into @wellos/shared when that package fills in.

import { apiFetch } from './client';

export interface LocationGeofence {
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

export interface UpsertLocationGeofenceBody {
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  checkInWindowBeforeMinutes: number;
  checkInWindowAfterMinutes: number;
  enabled: boolean;
}

export type GetLocationGeofenceResponse = {
  geofence: LocationGeofence | null;
};

export type UpsertLocationGeofenceResponse = {
  geofence: LocationGeofence;
  created: boolean;
};

// ---------- Wrappers ----------

export async function getLocationGeofence(
  locationId: string,
): Promise<GetLocationGeofenceResponse> {
  return apiFetch<GetLocationGeofenceResponse>(
    `/admin/locations/${locationId}/geofence`,
  );
}

export async function upsertLocationGeofence(
  locationId: string,
  body: UpsertLocationGeofenceBody,
): Promise<UpsertLocationGeofenceResponse> {
  return apiFetch<UpsertLocationGeofenceResponse>(
    `/admin/locations/${locationId}/geofence`,
    { method: 'PUT', body },
  );
}

export async function deleteLocationGeofence(locationId: string): Promise<void> {
  await apiFetch<void>(`/admin/locations/${locationId}/geofence`, {
    method: 'DELETE',
  });
}
