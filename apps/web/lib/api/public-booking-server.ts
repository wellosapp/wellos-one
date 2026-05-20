/**
 * Server-only calls to login-free public booking endpoints (no Clerk Bearer).
 * Uses API_URL (preferred) or NEXT_PUBLIC_API_URL for local dev.
 */

const API_BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

export class PublicApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Public API error ${status}`);
    this.name = 'PublicApiError';
  }
}

/** R2 §11 — booking policy on the public catalog. */
export type BookingPolicy = 'instant' | 'request_approval' | 'staff_only';

export type PublicBookingCatalogResponse = {
  tenantSlug: string;
  locations: Array<{ id: string; name: string; timezone: string }>;
  services: Array<{
    id: string;
    name: string;
    descriptionShort: string | null;
    durationMinutes: number;
    basePriceCents: number;
    bookingPolicy: BookingPolicy;
    staffIds: string[];
  }>;
  staff: Array<{ id: string; displayName: string }>;
};

export type AvailableSlotWire = { startAt: string; endAt: string };

function buildUrl(
  path: string,
  searchParams?: Record<string, string | undefined>,
): URL {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, API_BASE);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, value);
      }
    }
  }
  return url;
}

export async function fetchPublicBookingCatalog(
  tenantSlug: string,
): Promise<PublicBookingCatalogResponse> {
  const url = buildUrl('/public/booking/catalog', { tenantSlug });
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PublicApiError(res.status, body);
  }
  return body as PublicBookingCatalogResponse;
}

export async function fetchPublicAvailability(params: {
  tenantSlug: string;
  staffId: string;
  serviceId: string;
  locationId: string;
  date: string;
  tz?: string;
}): Promise<{ slots: AvailableSlotWire[] }> {
  const url = buildUrl('/public/booking/availability', {
    tenantSlug: params.tenantSlug,
    staffId: params.staffId,
    serviceId: params.serviceId,
    locationId: params.locationId,
    date: params.date,
    tz: params.tz,
  });
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PublicApiError(res.status, body);
  }
  return body as { slots: AvailableSlotWire[] };
}

export type CreatePublicAppointmentResult = {
  appointment: {
    id: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    state: string;
    staffId: string;
    serviceId: string;
    locationId: string;
  };
  /** Echoed by the API for the Confirm card copy (instant vs request_approval). */
  bookingPolicy?: BookingPolicy;
  message?: string;
};

export async function createPublicAppointmentRequest(args: {
  tenantSlug: string;
  guest: {
    firstName: string;
    lastName?: string;
    email: string;
    phone?: string;
  };
  locationId: string;
  staffId: string;
  serviceId: string;
  scheduledStartAt: string;
  notes?: string;
  idempotencyKey: string;
}): Promise<CreatePublicAppointmentResult> {
  const url = buildUrl('/public/booking/appointments');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Idempotency-Key': args.idempotencyKey,
    },
    body: JSON.stringify({
      tenantSlug: args.tenantSlug,
      guest: args.guest,
      locationId: args.locationId,
      staffId: args.staffId,
      serviceId: args.serviceId,
      scheduledStartAt: args.scheduledStartAt,
      notes: args.notes,
    }),
    cache: 'no-store',
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PublicApiError(res.status, body);
  }
  return body as CreatePublicAppointmentResult;
}
