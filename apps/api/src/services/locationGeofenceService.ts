import { Prisma } from '@prisma/client';
import type { LocationGeofence } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  LocationGeofenceDto,
  UpsertLocationGeofenceBody,
} from '../schemas/locationGeofence.js';

// Domain layer for LocationGeofence admin CRUD (PR 6 of the Geofence Auto
// Check-in epic). Three operations: get, upsert, delete. One geofence per
// location (unique constraint on locationId).
//
// Tenant scoping: every operation first verifies the Location exists AND
// belongs to the caller's tenantId. Even though LocationGeofence.locationId
// is unique globally, a Location may belong to a different tenant — the
// pre-check is the cross-tenant gate. We also pass tenantId in every
// LocationGeofence WHERE for defense in depth.
//
// Audit log: upsert + delete write inside the same $transaction. Action
// names: location_geofence.created / .updated / .deleted (mirrors the
// entity.action convention used by classInstanceService + others).
//
// Decimal → number: Prisma returns Decimal objects for center_lat / center_lng
// (db.Decimal(11, 8)). We convert at the service boundary via toString() ->
// Number() so the wire shape is consistent number lat/lng. Direct Number(d)
// works too but string round-trip keeps precision predictable.

// Thrown when the requested Location does not exist or belongs to a
// different tenant. Route layer maps to 404 LOCATION_NOT_FOUND.
export class LocationNotFoundError extends Error {
  code = 'LOCATION_NOT_FOUND' as const;
  constructor(public locationId: string) {
    super(`Location ${locationId} not found in this tenant`);
    this.name = 'LocationNotFoundError';
  }
}

// Thrown by deleteLocationGeofence when no geofence exists for the
// location. GET deliberately returns null (not an error) — the editor UI
// distinguishes "no config" from "deleted by another admin"; only DELETE
// surfaces the absent row as 404.
export class LocationGeofenceNotFoundError extends Error {
  code = 'LOCATION_GEOFENCE_NOT_FOUND' as const;
  constructor(public locationId: string) {
    super(`No geofence configured for location ${locationId}`);
    this.name = 'LocationGeofenceNotFoundError';
  }
}

function decimalToNumber(d: Prisma.Decimal | number): number {
  // Prisma.Decimal has .toString(); plain numbers fall through unchanged.
  return typeof d === 'number' ? d : Number(d.toString());
}

function toDto(row: LocationGeofence): LocationGeofenceDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    locationId: row.locationId,
    centerLat: decimalToNumber(row.centerLat),
    centerLng: decimalToNumber(row.centerLng),
    radiusMeters: row.radiusMeters,
    checkInWindowBeforeMinutes: row.checkInWindowBeforeMinutes,
    checkInWindowAfterMinutes: row.checkInWindowAfterMinutes,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Verifies the Location row exists in the caller's tenant. Throws
// LocationNotFoundError when absent or cross-tenant. Used by all three
// public operations.
async function assertLocationInTenant(
  client: ExtendedPrismaClient | ExtendedTransactionClient,
  args: { tenantId: string; locationId: string },
): Promise<void> {
  const loc = await client.location.findFirst({
    where: { id: args.locationId, tenantId: args.tenantId },
    select: { id: true },
  });
  if (!loc) {
    throw new LocationNotFoundError(args.locationId);
  }
}

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action:
      | 'location_geofence.created'
      | 'location_geofence.updated'
      | 'location_geofence.deleted';
    entityId: string;
    before: LocationGeofence | null;
    after: LocationGeofence | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: 'location_geofence',
      entityId: args.entityId,
      before: args.before
        ? (args.before as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      after: args.after
        ? (args.after as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

export async function getLocationGeofence(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; locationId: string },
): Promise<{ geofence: LocationGeofenceDto | null }> {
  await assertLocationInTenant(prisma, args);

  // tenantId on the WHERE is defense-in-depth even though locationId is
  // unique — a mismatched row simply won't be returned.
  const row = await prisma.locationGeofence.findFirst({
    where: { tenantId: args.tenantId, locationId: args.locationId },
  });

  return { geofence: row ? toDto(row) : null };
}

export async function upsertLocationGeofence(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    locationId: string;
    body: UpsertLocationGeofenceBody;
  },
): Promise<{ geofence: LocationGeofenceDto; created: boolean }> {
  const { tenantId, actorUserId, locationId, body } = args;

  return prisma.$transaction(async (tx) => {
    await assertLocationInTenant(tx, { tenantId, locationId });

    // Pre-fetch existing row to compute `created` + audit before/after.
    const before = await tx.locationGeofence.findFirst({
      where: { tenantId, locationId },
    });

    const after = await tx.locationGeofence.upsert({
      where: { locationId },
      create: {
        tenantId,
        locationId,
        centerLat: new Prisma.Decimal(body.centerLat),
        centerLng: new Prisma.Decimal(body.centerLng),
        radiusMeters: body.radiusMeters,
        checkInWindowBeforeMinutes: body.checkInWindowBeforeMinutes,
        checkInWindowAfterMinutes: body.checkInWindowAfterMinutes,
        enabled: body.enabled,
      },
      update: {
        centerLat: new Prisma.Decimal(body.centerLat),
        centerLng: new Prisma.Decimal(body.centerLng),
        radiusMeters: body.radiusMeters,
        checkInWindowBeforeMinutes: body.checkInWindowBeforeMinutes,
        checkInWindowAfterMinutes: body.checkInWindowAfterMinutes,
        enabled: body.enabled,
      },
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: before
        ? 'location_geofence.updated'
        : 'location_geofence.created',
      entityId: after.id,
      before,
      after,
    });

    return { geofence: toDto(after), created: before === null };
  });
}

export async function deleteLocationGeofence(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; actorUserId: string; locationId: string },
): Promise<void> {
  const { tenantId, actorUserId, locationId } = args;

  await prisma.$transaction(async (tx) => {
    await assertLocationInTenant(tx, { tenantId, locationId });

    const before = await tx.locationGeofence.findFirst({
      where: { tenantId, locationId },
    });
    if (!before) {
      throw new LocationGeofenceNotFoundError(locationId);
    }

    await tx.locationGeofence.delete({
      where: { id: before.id },
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'location_geofence.deleted',
      entityId: before.id,
      before,
      after: null,
    });
  });
}
