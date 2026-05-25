// Type-safe wrappers for /admin/class-instances/:instanceId/* endpoints
// (Classes Phase 3a — bookings + waitlist). Mirrors the Zod schemas in
// apps/api/src/schemas/classBooking.ts and the wire shapes returned by
// apps/api/src/services/classBookingService.ts. Kept in sync by hand at
// MVP — move into @wellos/shared when that package fills in.

import { apiFetch } from './client';

export type ClassBookingState =
  | 'confirmed'
  | 'cancelled_by_client'
  | 'cancelled_by_studio'
  | 'no_show'
  | 'checked_in'
  | 'completed';

export type ClassWaitlistEntryState =
  | 'waiting'
  | 'promoted'
  | 'expired'
  | 'cancelled';

export type ClassBooking = {
  id: string;
  tenantId: string;
  classInstanceId: string;
  clientId: string;
  bookedAt: string;
  paymentId: string | null;
  state: ClassBookingState;
  checkInMethod: string | null;
  checkedInAt: string | null;
  checkedInByStaffId: string | null;
  cancellationReason: string | null;
  cancellationInitiatedBy: string | null;
  cancelledAt: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export type ClassWaitlistEntry = {
  id: string;
  tenantId: string;
  classInstanceId: string;
  clientId: string;
  position: number;
  joinedAt: string;
  promotedAt: string | null;
  expiresAt: string | null;
  state: ClassWaitlistEntryState;
  createdAt: string;
  updatedAt: string;
};

// Inlined client summary on roster rows so the drawer can render names
// without a follow-up lookup per booking.
export type ClassBookingClientSummary = {
  id: string;
  firstName: string;
  lastName: string | null;
};

export type RosterBooking = ClassBooking & {
  client: ClassBookingClientSummary;
};

export type RosterWaitlistEntry = ClassWaitlistEntry & {
  client: ClassBookingClientSummary;
};

export type ListRosterResponse = {
  bookings: RosterBooking[];
  waitlist: RosterWaitlistEntry[];
};

// Tagged-union result from createBookingOrWaitlist. The route returns either
// arm depending on whether the seat was available.
export type CreateBookingOrWaitlistResponse =
  | { kind: 'booking'; booking: ClassBooking }
  | { kind: 'waitlist'; entry: ClassWaitlistEntry };

// Phase 3c — cancel response widened to carry auto-promote info + late-cancel
// flag. Existing callers reading `cancelled` keep working. `promotedBooking`
// / `promotedFromEntry` / `promotedClient` are set together when an entry was
// auto-promoted into the freed seat; otherwise all three are undefined.
export type CancelClassBookingResponse = {
  cancelled: ClassBooking;
  promotedBooking?: ClassBooking;
  promotedFromEntry?: ClassWaitlistEntry;
  promotedClient?: ClassBookingClientSummary;
  lateCancel: boolean;
};

export type PromoteWaitlistResponse = {
  booking: ClassBooking;
  entry: ClassWaitlistEntry;
};

export type JoinWaitlistResponse = { entry: ClassWaitlistEntry };

// ---------- Wrappers ----------

export async function getClassInstanceRoster(
  instanceId: string,
  options: { includeCancelled?: boolean } = {},
): Promise<ListRosterResponse> {
  return apiFetch<ListRosterResponse>(
    `/admin/class-instances/${instanceId}/roster`,
    {
      searchParams: {
        includeCancelled: options.includeCancelled ? 'true' : undefined,
      },
    },
  );
}

export type CreateClassBookingBody = {
  clientId: string;
  idempotencyKey: string;
};

export async function createClassBooking(
  instanceId: string,
  body: CreateClassBookingBody,
): Promise<CreateBookingOrWaitlistResponse> {
  return apiFetch<CreateBookingOrWaitlistResponse>(
    `/admin/class-instances/${instanceId}/bookings`,
    { method: 'POST', body },
  );
}

export type CancelClassBookingBody = {
  reason?: string;
  // Phase 3a admin-only — public client cancel flow is Phase 3b.
  initiatedBy?: 'studio';
};

export async function cancelClassBooking(
  instanceId: string,
  bookingId: string,
  body: CancelClassBookingBody = {},
): Promise<CancelClassBookingResponse> {
  return apiFetch<CancelClassBookingResponse>(
    `/admin/class-instances/${instanceId}/bookings/${bookingId}/cancel`,
    { method: 'POST', body },
  );
}

export type JoinWaitlistBody = { clientId: string };

export async function joinClassWaitlist(
  instanceId: string,
  body: JoinWaitlistBody,
): Promise<JoinWaitlistResponse> {
  return apiFetch<JoinWaitlistResponse>(
    `/admin/class-instances/${instanceId}/waitlist`,
    { method: 'POST', body },
  );
}

export async function promoteClassWaitlistEntry(
  instanceId: string,
  entryId: string,
): Promise<PromoteWaitlistResponse> {
  return apiFetch<PromoteWaitlistResponse>(
    `/admin/class-instances/${instanceId}/waitlist/${entryId}/promote`,
    { method: 'POST', body: {} },
  );
}
