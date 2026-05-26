// Geospatial helpers for the Geofence Auto Check-in epic. PR 8b uses
// haversineDistanceMeters to (a) reject GPS submissions outside the
// configured geofence radius and (b) detect impossible client movement
// across recent check-in attempts.
//
// We use the standard haversine formula with Earth radius 6,371,000 m
// (mean radius). Accuracy is sub-meter for the short distances we care
// about (tens to hundreds of meters around a studio); approximation error
// vs. WGS-84 ellipsoid is < 0.5% across most of the populated world.

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/lng points in meters.
 *
 * Sanity check: (0, 0) → (0, 1) should be ~111,195 m (one degree of
 * longitude at the equator).
 */
export function haversineDistanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_METERS * c;
}
