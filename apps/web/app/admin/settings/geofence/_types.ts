// Shared types + constants for the geofence editor server actions and
// client body. Lives outside _actions.ts because Next.js's 'use server'
// guard rejects any non-async export (types pass at compile time but break
// the page-data collection phase of `next build`).

export interface UpdateGeofenceState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  /** Field-level errors keyed by Zod path (e.g. `radiusMeters`). */
  fieldErrors?: Record<string, string>;
}

export const INITIAL_GEOFENCE_STATE: UpdateGeofenceState = { status: 'idle' };
