// Type-safe wrappers for /admin/booking-settings + per-staff booking
// preferences. Mirrors the Zod schemas in
// apps/api/src/schemas/bookingSettings.ts. Kept in sync by hand at MVP.

import { apiFetch } from './client';

// Mirrors TenantBookingSettings in apps/api/src/services/bookingSettingsService.ts.
export type TenantBookingSettings = {
  bookingDepositsEnabled: boolean;
  bookingDepositAmountCents: number;
  bookingCancellationWindowHours: number;
  bookingCancellationFeeCents: number;
  bookingNoShowFeeCents: number;
  bookingMinNoticeHours: number;
  bookingMaxWindowDays: number;
  bookingDefaultBufferMinutes: number;
  bookingWalkInsAllowed: boolean;
  bookingTipsEnabled: boolean;
  bookingClientRecognitionMode: 'email_only' | 'email_phone' | 'email_name';
  bookingOverrideRoles: string;
};

export type UpdateTenantBookingSettingsBody = Partial<TenantBookingSettings>;

export type StaffBookingPreferences = {
  staffId: string;
  bookingBufferMinutesOverride: number | null;
  bookingMinNoticeHoursOverride: number | null;
  bookingCalendarSyncOptedIn: boolean;
};

// Null means "clear the override and fall through to tenant default".
// Omit a key to leave it unchanged.
export type UpdateStaffBookingPreferencesBody = {
  bookingBufferMinutesOverride?: number | null;
  bookingMinNoticeHoursOverride?: number | null;
  bookingCalendarSyncOptedIn?: boolean;
};

export async function getTenantBookingSettings(): Promise<{
  settings: TenantBookingSettings;
}> {
  return apiFetch<{ settings: TenantBookingSettings }>('/admin/booking-settings');
}

export async function updateTenantBookingSettings(
  body: UpdateTenantBookingSettingsBody,
): Promise<{ settings: TenantBookingSettings }> {
  return apiFetch('/admin/booking-settings', { method: 'PATCH', body });
}

export async function getStaffBookingPreferences(
  staffId: string,
): Promise<{ preferences: StaffBookingPreferences }> {
  return apiFetch<{ preferences: StaffBookingPreferences }>(
    `/admin/staff/${staffId}/booking-preferences`,
  );
}

export async function updateStaffBookingPreferences(
  staffId: string,
  body: UpdateStaffBookingPreferencesBody,
): Promise<{ preferences: StaffBookingPreferences }> {
  return apiFetch(`/admin/staff/${staffId}/booking-preferences`, {
    method: 'PATCH',
    body,
  });
}

export async function getMyBookingPreferences(): Promise<{
  preferences: StaffBookingPreferences;
}> {
  return apiFetch<{ preferences: StaffBookingPreferences }>(
    '/staff/my-booking-preferences',
  );
}

export async function updateMyBookingPreferences(
  body: UpdateStaffBookingPreferencesBody,
): Promise<{ preferences: StaffBookingPreferences }> {
  return apiFetch('/staff/my-booking-preferences', { method: 'PATCH', body });
}
