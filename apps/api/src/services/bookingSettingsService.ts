import { Prisma } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  UpdateTenantBookingSettingsBody,
  UpdateStaffBookingPreferencesBody,
} from '../schemas/bookingSettings.js';

// Domain layer for tenant-wide booking settings + per-staff booking
// overrides (R2 §12). Tenant scoping at every query; audit log on writes.
//
// Two-tier resolution at the bottom of this file — see resolveBookingSetting.

// ---------- Field projections ----------
//
// Keep these in sync with prisma/schema.prisma Tenant + Staff booking
// columns. The route layer relies on this exact shape; do not leak other
// columns through these helpers.

const TENANT_BOOKING_FIELDS = {
  bookingDepositsEnabled: true,
  bookingDepositAmountCents: true,
  bookingCancellationWindowHours: true,
  bookingCancellationFeeCents: true,
  bookingNoShowFeeCents: true,
  bookingMinNoticeHours: true,
  bookingMaxWindowDays: true,
  bookingDefaultBufferMinutes: true,
  bookingWalkInsAllowed: true,
  bookingTipsEnabled: true,
  bookingClientRecognitionMode: true,
  bookingOverrideRoles: true,
} satisfies Prisma.TenantSelect;

const STAFF_BOOKING_PREF_FIELDS = {
  id: true,
  tenantId: true,
  bookingBufferMinutesOverride: true,
  bookingMinNoticeHoursOverride: true,
  bookingCalendarSyncOptedIn: true,
} satisfies Prisma.StaffSelect;

// Shape exposed to API consumers. Pulling from Prisma's row type directly
// would leak unrelated tenant columns — explicit type is safer.
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
  bookingClientRecognitionMode: string;
  bookingOverrideRoles: string;
};

export type StaffBookingPreferences = {
  staffId: string;
  bookingBufferMinutesOverride: number | null;
  bookingMinNoticeHoursOverride: number | null;
  bookingCalendarSyncOptedIn: boolean;
};

// ---------- Audit helper ----------

type TenantAuditAction =
  | 'tenant.booking_settings.updated';

type StaffAuditAction =
  | 'staff.booking_preferences.updated';

async function writeTenantAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action: TenantAuditAction;
    before: TenantBookingSettings;
    after: TenantBookingSettings;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: 'tenant',
      entityId: args.tenantId,
      before: args.before as unknown as Prisma.InputJsonValue,
      after: args.after as unknown as Prisma.InputJsonValue,
    },
  });
}

async function writeStaffAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action: StaffAuditAction;
    staffId: string;
    before: StaffBookingPreferences;
    after: StaffBookingPreferences;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: 'staff',
      entityId: args.staffId,
      before: args.before as unknown as Prisma.InputJsonValue,
      after: args.after as unknown as Prisma.InputJsonValue,
    },
  });
}

// ---------- Tenant settings ----------

export async function getTenantBookingSettings(
  prisma: ExtendedPrismaClient,
  tenantId: string,
): Promise<TenantBookingSettings | null> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: TENANT_BOOKING_FIELDS,
  });
  return row;
}

export async function updateTenantBookingSettings(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    body: UpdateTenantBookingSettingsBody;
  },
): Promise<TenantBookingSettings | null> {
  const { tenantId, actorUserId, body } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: TENANT_BOOKING_FIELDS,
    });
    if (!before) return null;

    // Empty PATCH → no-op (still return current settings). Match Staff pattern.
    if (Object.keys(body).length === 0) {
      return before;
    }

    const after = await tx.tenant.update({
      where: { id: tenantId },
      data: body,
      select: TENANT_BOOKING_FIELDS,
    });

    await writeTenantAudit(tx, {
      tenantId,
      actorUserId,
      action: 'tenant.booking_settings.updated',
      before,
      after,
    });

    return after;
  });
}

// ---------- Staff preferences ----------

export async function getStaffBookingPreferences(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; staffId: string },
): Promise<StaffBookingPreferences | null> {
  const row = await prisma.staff.findFirst({
    where: { id: args.staffId, tenantId: args.tenantId },
    select: STAFF_BOOKING_PREF_FIELDS,
  });
  if (!row) return null;
  return {
    staffId: row.id,
    bookingBufferMinutesOverride: row.bookingBufferMinutesOverride,
    bookingMinNoticeHoursOverride: row.bookingMinNoticeHoursOverride,
    bookingCalendarSyncOptedIn: row.bookingCalendarSyncOptedIn,
  };
}

export async function updateStaffBookingPreferences(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    staffId: string;
    body: UpdateStaffBookingPreferencesBody;
  },
): Promise<StaffBookingPreferences | null> {
  const { tenantId, actorUserId, staffId, body } = args;

  return prisma.$transaction(async (tx) => {
    const beforeRow = await tx.staff.findFirst({
      where: { id: staffId, tenantId },
      select: STAFF_BOOKING_PREF_FIELDS,
    });
    if (!beforeRow) return null;
    const before: StaffBookingPreferences = {
      staffId: beforeRow.id,
      bookingBufferMinutesOverride: beforeRow.bookingBufferMinutesOverride,
      bookingMinNoticeHoursOverride: beforeRow.bookingMinNoticeHoursOverride,
      bookingCalendarSyncOptedIn: beforeRow.bookingCalendarSyncOptedIn,
    };

    if (Object.keys(body).length === 0) {
      return before;
    }

    // Translate the validated body into a Prisma update. Null on the override
    // fields means "clear" (fall through to tenant default); undefined means
    // "leave as-is".
    const data: Prisma.StaffUpdateInput = {};
    if ('bookingBufferMinutesOverride' in body) {
      data.bookingBufferMinutesOverride = body.bookingBufferMinutesOverride;
    }
    if ('bookingMinNoticeHoursOverride' in body) {
      data.bookingMinNoticeHoursOverride = body.bookingMinNoticeHoursOverride;
    }
    if (body.bookingCalendarSyncOptedIn !== undefined) {
      data.bookingCalendarSyncOptedIn = body.bookingCalendarSyncOptedIn;
    }

    const afterRow = await tx.staff.update({
      where: { id: staffId },
      data,
      select: STAFF_BOOKING_PREF_FIELDS,
    });
    const after: StaffBookingPreferences = {
      staffId: afterRow.id,
      bookingBufferMinutesOverride: afterRow.bookingBufferMinutesOverride,
      bookingMinNoticeHoursOverride: afterRow.bookingMinNoticeHoursOverride,
      bookingCalendarSyncOptedIn: afterRow.bookingCalendarSyncOptedIn,
    };

    await writeStaffAudit(tx, {
      tenantId,
      actorUserId,
      action: 'staff.booking_preferences.updated',
      staffId,
      before,
      after,
    });

    return after;
  });
}

// ---------- Two-tier resolution (R2 §12) ----------
//
// Order: appointment override -> staff field if non-null -> tenant field
// -> hardcoded default. Used by booking flow when computing per-appointment
// buffers, min-notice, etc.
//
// Hardcoded defaults match the tenant column defaults so a missing tenant
// row still returns sensible values (e.g. internal jobs that haven't loaded
// a tenant yet).

const SYSTEM_DEFAULTS = {
  bookingDepositsEnabled: false,
  bookingDepositAmountCents: 5000,
  bookingCancellationWindowHours: 24,
  bookingCancellationFeeCents: 0,
  bookingNoShowFeeCents: 0,
  bookingMinNoticeHours: 2,
  bookingMaxWindowDays: 90,
  bookingDefaultBufferMinutes: 0,
  bookingWalkInsAllowed: true,
  bookingTipsEnabled: true,
  bookingClientRecognitionMode: 'email_phone',
  bookingOverrideRoles: 'admin,manager',
} as const satisfies TenantBookingSettings;

// Map of resolvable keys → the tenant field they live on. Adding a new
// resolvable key means extending this map. The value union is the type of
// each setting, so consumers get a precise return type via the generic K.
const TENANT_KEY_OF: {
  [K in keyof TenantBookingSettings]: K;
} = {
  bookingDepositsEnabled: 'bookingDepositsEnabled',
  bookingDepositAmountCents: 'bookingDepositAmountCents',
  bookingCancellationWindowHours: 'bookingCancellationWindowHours',
  bookingCancellationFeeCents: 'bookingCancellationFeeCents',
  bookingNoShowFeeCents: 'bookingNoShowFeeCents',
  bookingMinNoticeHours: 'bookingMinNoticeHours',
  bookingMaxWindowDays: 'bookingMaxWindowDays',
  bookingDefaultBufferMinutes: 'bookingDefaultBufferMinutes',
  bookingWalkInsAllowed: 'bookingWalkInsAllowed',
  bookingTipsEnabled: 'bookingTipsEnabled',
  bookingClientRecognitionMode: 'bookingClientRecognitionMode',
  bookingOverrideRoles: 'bookingOverrideRoles',
};

// Per-staff override fields (R2 §12) and which tenant key they shadow.
// Only includes keys that have a real per-staff column. Adding a new
// per-staff override is two edits: the schema column + this map.
const STAFF_OVERRIDE_KEY_OF: Partial<{
  [K in keyof TenantBookingSettings]: keyof Pick<
    StaffBookingPreferences,
    'bookingBufferMinutesOverride' | 'bookingMinNoticeHoursOverride'
  >;
}> = {
  bookingDefaultBufferMinutes: 'bookingBufferMinutesOverride',
  bookingMinNoticeHours: 'bookingMinNoticeHoursOverride',
};

export interface ResolveBookingSettingArgs<
  K extends keyof TenantBookingSettings,
> {
  tenantId: string;
  key: K;
  staffId?: string;
  /**
   * Per-appointment override value. If provided (non-undefined) it wins
   * regardless of the tenant/staff state. Use this for one-off exceptions
   * an admin types into the booking drawer.
   */
  appointmentOverride?: TenantBookingSettings[K];
}

/**
 * Two-tier resolver per R2 §12.
 *
 *   appointment override
 *     → staff field if non-null
 *     → tenant field
 *     → hardcoded default
 *
 * Generic over the setting key K so callers get a precise return type
 * (e.g. `boolean` for `bookingTipsEnabled`, `number` for buffer minutes).
 */
export async function resolveBookingSetting<
  K extends keyof TenantBookingSettings,
>(
  prisma: ExtendedPrismaClient,
  args: ResolveBookingSettingArgs<K>,
): Promise<TenantBookingSettings[K]> {
  // 1. Appointment override (if explicitly provided)
  if (args.appointmentOverride !== undefined) {
    return args.appointmentOverride;
  }

  // 2. Staff override (only for keys that have one)
  const staffField = STAFF_OVERRIDE_KEY_OF[args.key];
  if (args.staffId && staffField) {
    // Type-erase through `any` for this call. The soft-delete extension
    // + N back-relations on Staff (forms reviewer, magic-link tokens,
    // etc.) push the inferred StaffSelect<...> return type past TS's
    // recursion depth limit, even with intermediate `unknown` casts.
    // Runtime select is safe because staffField is restricted to the
    // keys of STAFF_OVERRIDE_KEY_OF (numeric per-staff override columns).
    // any-cast is justified per CLAUDE.md hard rule #5 — see comment.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staff = (await (prisma.staff as any).findFirst({
      where: { id: args.staffId, tenantId: args.tenantId },
      select: { [staffField]: true },
    })) as Record<string, number | null> | null;
    if (staff) {
      // Dynamic select can't narrow the Prisma return type, so we cast
      // through `unknown` to a record lookup. The map STAFF_OVERRIDE_KEY_OF
      // restricts staffField to the numeric per-staff override columns
      // (number | null), which is why the value cast is safe.
      const value = (staff as unknown as Record<string, number | null>)[staffField];
      if (value !== null && value !== undefined) {
        return value as TenantBookingSettings[K];
      }
    }
  }

  // 3. Tenant default
  // Type-erase through `any` for this call. The N back-relations on
  // Tenant (forms, classes, magic-link tokens, etc.) push the inferred
  // TenantSelect<...> return type past TS's recursion depth limit, same
  // class of issue as the Staff cast above on line ~363. Runtime select
  // is safe because the key comes from TENANT_KEY_OF[args.key].
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = (await (prisma.tenant as any).findUnique({
    where: { id: args.tenantId },
    select: { [TENANT_KEY_OF[args.key]]: true },
  })) as Record<string, unknown> | null;
  if (tenant) {
    const value = tenant[TENANT_KEY_OF[args.key]];
    if (value !== undefined && value !== null) {
      return value as TenantBookingSettings[K];
    }
  }

  // 4. Hardcoded system default
  return SYSTEM_DEFAULTS[args.key];
}
