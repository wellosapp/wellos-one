// Web client lib for the public geofence check-in routes (PR 8b of the
// Geofence Auto Check-in epic). Consumed by the PWA polling layer landing
// in PR 9.
//
// Unlike apiFetch (lib/api/client.ts) these routes are AUTHENTICATED VIA
// the magic-link bearer token, not Clerk. The caller passes the raw token
// — we attach it as `Authorization: Bearer <token>`. Do NOT use apiFetch
// here; it would inject the Clerk session token (a no-op for the public
// surface) AND require `auth()` from a server context, which this client
// surface won't have.

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.API_URL ??
  'http://localhost:3001';

export class GeofenceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'GeofenceApiError';
  }
}

export interface EligibleBooking {
  bookingId: string;
  classInstanceId: string;
  className: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  locationId: string;
  locationName: string;
  geofence: {
    centerLat: number;
    centerLng: number;
    radiusMeters: number;
    checkInWindowBeforeMinutes: number;
    checkInWindowAfterMinutes: number;
  };
}

export interface UpcomingGeofenceEligibleResponse {
  eligible: EligibleBooking[];
}

export interface GeofenceCheckInResponse {
  booking: {
    id: string;
    state: string;
    checkedInAt: string;
  };
  alreadyCheckedIn: boolean;
}

async function parseResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function bearerHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function getUpcomingGeofenceEligible(
  token: string,
): Promise<UpcomingGeofenceEligibleResponse> {
  const url = new URL('/public/me/upcoming-geofence-eligible', API_BASE);
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...bearerHeader(token),
    },
    cache: 'no-store',
  });
  const body = await parseResponse(res);
  if (!res.ok) {
    throw new GeofenceApiError(
      res.status,
      body,
      `GET upcoming-geofence-eligible failed: ${res.status}`,
    );
  }
  return body as UpcomingGeofenceEligibleResponse;
}

export async function submitGeofenceCheckIn(
  bookingId: string,
  token: string,
  body: { lat: number; lng: number; accuracyMeters: number; timestamp: string },
  idempotencyKey: string,
): Promise<GeofenceCheckInResponse> {
  const url = new URL(
    `/public/class-bookings/${encodeURIComponent(bookingId)}/geofence-check-in`,
    API_BASE,
  );
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      ...bearerHeader(token),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const responseBody = await parseResponse(res);
  if (!res.ok) {
    throw new GeofenceApiError(
      res.status,
      responseBody,
      `POST geofence-check-in failed: ${res.status}`,
    );
  }
  return responseBody as GeofenceCheckInResponse;
}
