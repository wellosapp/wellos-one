import type { Prisma } from '@prisma/client';

import type { ExtendedPrismaClient } from '../db/client.js';

// Read-only service for the admin fraud-audit log at
// /admin/class-check-in-attempts. PR 10 of the Geofence Auto Check-in epic.
//
// Backed by the class_check_in_attempt table (PR 8b's audit writer). Every
// geofence + manual check-in attempt — success or failure — writes a row;
// this surface lets admins browse them by result/instance/date.
//
// Pagination: cursor-based on createdAt + id so the list is stable while
// new rows arrive. Default take=50, capped at 200.

// ---------- Public DTOs ----------

export type ClassCheckInAttemptDto = {
  id: string;
  classBookingId: string;
  clientId: string;
  attemptedAt: string;
  method: string;
  result: string;
  submittedLat: number | null;
  submittedLng: number | null;
  submittedAccuracyMeters: number | null;
  distanceFromGeofenceMeters: number | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
  };
  classInstance: {
    id: string;
    scheduledStartAt: string;
    className: string;
  };
};

export type ListClassCheckInAttemptsResult = {
  attempts: ClassCheckInAttemptDto[];
  /** Opaque cursor for the next page; null when no further rows. */
  nextCursor: string | null;
};

// ---------- Internals ----------

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

// Cursor encodes (createdAt, id) so the listing is stable under concurrent
// writes. We keep it opaque (base64 JSON) so callers don't try to compose
// their own.
function encodeCursor(row: { id: string; createdAt: Date }): string {
  const payload = { id: row.id, createdAt: row.createdAt.toISOString() };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { id: string; createdAt: Date } | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as { id?: unknown; createdAt?: unknown };
    if (typeof parsed.id !== 'string' || typeof parsed.createdAt !== 'string') {
      return null;
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { id: parsed.id, createdAt };
  } catch {
    return null;
  }
}

function toNumberOrNull(d: Prisma.Decimal | null): number | null {
  if (d === null) return null;
  return Number(d.toString());
}

// ---------- listClassCheckInAttempts ----------

export async function listClassCheckInAttempts(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    from?: Date;
    to?: Date;
    /** Optional result filter — any value from the result enum. */
    result?: string;
    classInstanceId?: string;
    cursor?: string;
    take?: number;
  },
): Promise<ListClassCheckInAttemptsResult> {
  const take = Math.min(MAX_TAKE, Math.max(1, args.take ?? DEFAULT_TAKE));

  const where: Prisma.ClassCheckInAttemptWhereInput = {
    tenantId: args.tenantId,
  };
  if (args.from || args.to) {
    where.attemptedAt = {};
    if (args.from) where.attemptedAt.gte = args.from;
    if (args.to) where.attemptedAt.lte = args.to;
  }
  if (args.result) {
    where.result = args.result;
  }
  if (args.classInstanceId) {
    // No direct FK on ClassCheckInAttempt → ClassInstance; we go through
    // ClassBooking. Sub-filter is a single nested query in Postgres so the
    // planner inlines it.
    where.classBooking = { classInstanceId: args.classInstanceId };
  }

  // Cursor: when present, fetch rows strictly before (createdAt, id) using a
  // tuple comparison. orderBy mirrors the same tuple so the cursor stays
  // consistent.
  if (args.cursor) {
    const decoded = decodeCursor(args.cursor);
    if (decoded) {
      where.OR = [
        { createdAt: { lt: decoded.createdAt } },
        {
          createdAt: decoded.createdAt,
          id: { lt: decoded.id },
        },
      ];
    }
  }

  const rows = await prisma.classCheckInAttempt.findMany({
    where,
    take: take + 1, // +1 to peek for next-cursor
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      classBookingId: true,
      clientId: true,
      attemptedAt: true,
      method: true,
      result: true,
      submittedLat: true,
      submittedLng: true,
      submittedAccuracyMeters: true,
      distanceFromGeofenceMeters: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      client: {
        select: { id: true, firstName: true, lastName: true },
      },
      classBooking: {
        select: {
          classInstance: {
            select: {
              id: true,
              scheduledStartAt: true,
              class: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  let nextCursor: string | null = null;
  let pageRows = rows;
  if (rows.length > take) {
    pageRows = rows.slice(0, take);
    const last = pageRows[pageRows.length - 1]!;
    nextCursor = encodeCursor({ id: last.id, createdAt: last.createdAt });
  }

  const attempts: ClassCheckInAttemptDto[] = pageRows.map((r) => ({
    id: r.id,
    classBookingId: r.classBookingId,
    clientId: r.clientId,
    attemptedAt: r.attemptedAt.toISOString(),
    method: r.method,
    result: r.result,
    submittedLat: toNumberOrNull(r.submittedLat),
    submittedLng: toNumberOrNull(r.submittedLng),
    submittedAccuracyMeters: r.submittedAccuracyMeters,
    distanceFromGeofenceMeters: toNumberOrNull(r.distanceFromGeofenceMeters),
    userAgent: r.userAgent,
    ipAddress: r.ipAddress,
    createdAt: r.createdAt.toISOString(),
    client: {
      id: r.client.id,
      firstName: r.client.firstName,
      lastName: r.client.lastName,
    },
    classInstance: {
      id: r.classBooking.classInstance.id,
      scheduledStartAt:
        r.classBooking.classInstance.scheduledStartAt.toISOString(),
      className: r.classBooking.classInstance.class.name,
    },
  }));

  return { attempts, nextCursor };
}
