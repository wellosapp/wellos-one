import type { Prisma } from '@prisma/client';

import type { ExtendedPrismaClient } from '../db/client.js';
import type { ClientActivityQuery } from '../schemas/clientActivity.js';

// Per-tenant audit-log entries pertaining to one client. Cross-entity:
// direct client edits + notes + appointments + intake submissions +
// media uploads owned by the client.
//
// Strategy: single OR'd query against AuditLog filtered by entityType
// and a JSON path match on the before/after JSONB payload. Postgres JSON
// path filters work in Prisma via `path: ['clientId'], equals: <id>`.
// We OR `before` and `after` so soft-delete (after may be null) and
// regular updates (both populated) both land.
//
// Performance: no functional indices today. At MVP volumes (<1K audit
// rows per tenant) JSON-path scans are fine. Add a functional index or
// denormalize to an activity_feed table later if needed.
//
// Tenant safety: every query is filtered by `tenantId`. Critical — the
// audit_log table is global across tenants.
//
// Display-name lookup: the AuditLog row stores `actorUserId` only. We
// batch-resolve the unique set of actor IDs to `User` rows in one extra
// query so the UI can render names without N+1 fan-out.

export type ClientActivityEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  actorUserId: string | null;
  // Composed from `User.firstName` + `User.lastName`. Null when the
  // actor was a system/webhook event or the actor row was hard-deleted.
  actorDisplayName: string | null;
  actorType: string;
  createdAt: string;
};

export type ClientActivityResult = {
  items: ClientActivityEntry[];
  total: number;
};

function composeDisplayName(
  firstName: string | null,
  lastName: string | null,
): string | null {
  const trimmedFirst = firstName?.trim() ?? '';
  const trimmedLast = lastName?.trim() ?? '';
  const joined = [trimmedFirst, trimmedLast].filter((p) => p.length > 0).join(' ');
  return joined.length > 0 ? joined : null;
}

export async function getClientActivity(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    clientId: string;
    query: ClientActivityQuery;
  },
): Promise<ClientActivityResult | null> {
  const { tenantId, clientId, query } = args;

  // Confirm the client exists in this tenant before doing the OR'd
  // AuditLog scan. Returns null so the route layer can map to 404.
  // Note: soft-deleted clients are filtered out by the soft-delete
  // extension — visiting /activity for a soft-deleted client 404s,
  // which is fine since the tab isn't reachable for deleted clients.
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId },
    select: { id: true },
  });
  if (!client) return null;

  // Build the OR filter spanning entity types.
  //   - 'client' rows match on entityId directly (the client itself).
  //   - other entity types match on the clientId field inside the
  //     before/after JSONB (notes, appointments, intake submissions).
  //   - 'media_asset' rows store the owning client as `clientOwnerId`
  //     in the serialized MediaAsset model — match on that path.
  // Note: 'client_intake_submission' has no audit writer today; the
  // branch is forward-looking and matches zero rows until intake audits
  // ship. Kept here so the response shape doesn't change later.
  const where: Prisma.AuditLogWhereInput = {
    tenantId,
    OR: [
      { entityType: 'client', entityId: clientId },
      {
        entityType: 'client_note',
        OR: [
          { after: { path: ['clientId'], equals: clientId } },
          { before: { path: ['clientId'], equals: clientId } },
        ],
      },
      {
        entityType: 'appointment',
        OR: [
          { after: { path: ['clientId'], equals: clientId } },
          { before: { path: ['clientId'], equals: clientId } },
        ],
      },
      {
        entityType: 'client_intake_submission',
        OR: [
          { after: { path: ['clientId'], equals: clientId } },
          { before: { path: ['clientId'], equals: clientId } },
        ],
      },
      {
        entityType: 'media_asset',
        OR: [
          { after: { path: ['clientOwnerId'], equals: clientId } },
          { before: { path: ['clientOwnerId'], equals: clientId } },
        ],
      },
    ],
  };

  // Interactive transaction for connection stability under the Supabase
  // pooler — same reason as linkedRecordsService.getClientTimeline.
  const { rows, total } = await prisma.$transaction(async (tx) => {
    const [rowsResult, totalResult] = await Promise.all([
      tx.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          before: true,
          after: true,
          actorUserId: true,
          actorType: true,
          createdAt: true,
        },
      }),
      tx.auditLog.count({ where }),
    ]);
    return { rows: rowsResult, total: totalResult };
  });

  // Batched actor lookup. Audit rows store actorUserId, not the name —
  // resolve to User.firstName/lastName in one round trip to avoid N+1.
  const actorIds = Array.from(
    new Set(
      rows
        .map((r) => r.actorUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const actorMap = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const actors = await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const a of actors) {
      actorMap.set(a.id, composeDisplayName(a.firstName, a.lastName));
    }
  }

  const items: ClientActivityEntry[] = rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    before: r.before,
    after: r.after,
    actorUserId: r.actorUserId,
    actorDisplayName: r.actorUserId
      ? actorMap.get(r.actorUserId) ?? null
      : null,
    actorType: r.actorType,
    createdAt: r.createdAt.toISOString(),
  }));

  return { items, total };
}
