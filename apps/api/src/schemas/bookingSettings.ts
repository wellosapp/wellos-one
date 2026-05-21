import { z } from 'zod';

// Zod schemas for tenant-level booking settings + per-staff booking
// preference overrides. R2 §12.1 — see prisma/schema.prisma Tenant /
// Staff for the column-level shape and defaults.
//
// Money fields are cents on the wire (matches existing patterns — see
// Service.basePriceCents, Staff.hourlyRateCents). The web layer converts
// dollars ↔ cents on submit/load.

// "email_only" | "email_phone" | "email_name" per R2 §12.1.
export const ClientRecognitionMode = z.enum([
  'email_only',
  'email_phone',
  'email_name',
]);
export type ClientRecognitionMode = z.infer<typeof ClientRecognitionMode>;

// Comma-separated role names allowed to override double-book. Validate the
// shape at the edge so we don't have to re-parse it everywhere downstream.
const ROLE_NAME = z.enum(['super_admin', 'admin', 'manager', 'staff']);
const OverrideRoleList = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
  .pipe(z.array(ROLE_NAME).min(1).max(4))
  .transform((arr) => Array.from(new Set(arr)).join(','));

// Reasonable upper bounds so a typo doesn't silently store $1B.
// Cents fields cap at $10,000 in cents (1_000_000) — generous for fees.
const CENTS = z.number().int().min(0).max(1_000_000);
const HOURS = z.number().int().min(0).max(24 * 365); // up to one year
const DAYS = z.number().int().min(0).max(365 * 2);
const MINUTES_NONNEG = z.number().int().min(0).max(24 * 60);

// Tenant booking settings PATCH body. Every field optional — service layer
// applies only what's present. Empty body returns the current settings.
export const UpdateTenantBookingSettingsBodySchema = z
  .object({
    bookingDepositsEnabled: z.boolean().optional(),
    bookingDepositAmountCents: CENTS.optional(),
    bookingCancellationWindowHours: HOURS.optional(),
    bookingCancellationFeeCents: CENTS.optional(),
    bookingNoShowFeeCents: CENTS.optional(),
    bookingMinNoticeHours: HOURS.optional(),
    bookingMaxWindowDays: DAYS.optional(),
    bookingDefaultBufferMinutes: MINUTES_NONNEG.optional(),
    bookingWalkInsAllowed: z.boolean().optional(),
    bookingTipsEnabled: z.boolean().optional(),
    bookingClientRecognitionMode: ClientRecognitionMode.optional(),
    bookingOverrideRoles: OverrideRoleList.optional(),
  })
  .strict();
export type UpdateTenantBookingSettingsBody = z.infer<
  typeof UpdateTenantBookingSettingsBodySchema
>;

// Per-staff booking preferences PATCH body. Override fields accept null to
// clear (fall back to tenant default); calendar opt-in is a non-nullable
// boolean (no fallthrough semantic).
//
// Zod note: z.union([number, null]) lets the client send either a number,
// null, or omit the field entirely. Omitted = leave as-is. Null = clear.
const NULLABLE_BUFFER = z
  .union([z.number().int().min(0).max(24 * 60), z.null()])
  .optional();
const NULLABLE_HOURS = z
  .union([z.number().int().min(0).max(24 * 365), z.null()])
  .optional();

export const UpdateStaffBookingPreferencesBodySchema = z
  .object({
    bookingBufferMinutesOverride: NULLABLE_BUFFER,
    bookingMinNoticeHoursOverride: NULLABLE_HOURS,
    bookingCalendarSyncOptedIn: z.boolean().optional(),
  })
  .strict();
export type UpdateStaffBookingPreferencesBody = z.infer<
  typeof UpdateStaffBookingPreferencesBodySchema
>;

export const StaffIdParamsSchema = z.object({
  id: z.string().min(1),
});
export type StaffIdParams = z.infer<typeof StaffIdParamsSchema>;
