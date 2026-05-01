import { createHash } from 'node:crypto';

import { Prisma } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ExtendedPrismaClient } from '../db/client.js';

// Idempotency-Key handling for mutating admin endpoints (CLAUDE.md hard rule
// #8). Storage uses the existing `idempotency_keys` table (schema.prisma:368).
//
// Contract — caller receives Idempotency-Key from a header. We persist
// (tenantId, key, method, scope) → (responseStatus, responseBody) and replay
// on subsequent matching requests.
//
// Why scope, not full path: the URL contains client/note ids that change per
// request. The "scope" is a stable logical operation name like
// `client_note.create`. method is held constant per scope (typically POST).
//
// Race-safety:
//   1) Try to INSERT a reservation row with responseBody=null. P2002 means
//      another caller won the race.
//   2) On reservation win: run the handler, update the row with the response.
//   3) On reservation loss: re-read; if the winner's row has responseBody
//      filled, replay it; if still null, return 409 — caller should retry
//      after a short backoff (the in-flight handler is still running).
//
// Body-mismatch detection: requestHash is sha256 of the JSON body. Replaying
// the same key with a different body returns 422 — typically a client bug.
//
// TTL: 24 hours. Cleanup of expired rows is a follow-up TODO (sweeper job).

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const HEADER_NAME = 'idempotency-key';

// Cap to prevent abuse — RFC draft says <= 255 chars, we accept that.
const MAX_KEY_LENGTH = 255;

function readIdempotencyKey(request: FastifyRequest): string | null {
  const raw = request.headers[HEADER_NAME];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_KEY_LENGTH) return null;
  return trimmed;
}

function hashBody(body: unknown): string {
  const json = JSON.stringify(body ?? null);
  return createHash('sha256').update(json).digest('hex');
}

export type IdempotencyHandlerResult = {
  status: number;
  body: unknown;
};

export type WithIdempotencyOptions = {
  prisma: ExtendedPrismaClient;
  // Tenant-scoped operations pass tenantId; tenant-free endpoints pass null.
  tenantId: string | null;
  // Stable logical operation name. Must NOT include id values. Examples:
  // 'client_note.create', 'client_note.acknowledge'.
  scope: string;
};

// Fastify-style helper. Call from a POST handler:
//
//   const result = await withIdempotency(
//     request,
//     reply,
//     { prisma: app.prisma, tenantId, scope: 'client_note.create' },
//     async () => ({ status: 201, body: { note } }),
//   );
//   return result;
//
// When no Idempotency-Key header is present, the handler runs directly and
// the result is sent back without any DB write — endpoints stay usable from
// curl / one-off scripts.
export async function withIdempotency(
  request: FastifyRequest,
  reply: FastifyReply,
  opts: WithIdempotencyOptions,
  fn: () => Promise<IdempotencyHandlerResult>,
): Promise<FastifyReply> {
  const key = readIdempotencyKey(request);

  // No header → no caching, just run the handler.
  if (!key) {
    const result = await fn();
    return reply.code(result.status).send(result.body);
  }

  const { prisma, tenantId, scope } = opts;
  const requestHash = hashBody(request.body);
  const now = new Date();

  // Look for a fresh prior result.
  const existing = await prisma.idempotencyKey.findFirst({
    where: { tenantId, key, method: request.method, path: scope },
  });

  if (existing && existing.expiresAt > now) {
    if (existing.requestHash !== requestHash) {
      return reply.code(422).send({
        error: 'Unprocessable Entity',
        message:
          'Idempotency-Key was reused with a different request body. Use a fresh key for a new request.',
      });
    }
    if (existing.responseStatus !== null && existing.responseBody !== null) {
      return reply
        .code(existing.responseStatus)
        .send(existing.responseBody);
    }
    // Reservation exists but in-flight — caller should retry shortly.
    return reply.code(409).send({
      error: 'Conflict',
      message:
        'A request with this Idempotency-Key is currently in flight. Retry shortly.',
    });
  }

  // Either no row, or the existing row is expired. Try to claim a reservation.
  // If two callers race here, exactly one wins.
  const expiresAt = new Date(now.getTime() + IDEMPOTENCY_TTL_MS);
  let reservedId: string | null = null;
  try {
    if (existing) {
      // Expired row — replace its contents with a fresh reservation. The
      // unique key prevents two reservations from coexisting.
      const refreshed = await prisma.idempotencyKey.update({
        where: { id: existing.id },
        data: {
          requestHash,
          responseStatus: null,
          responseBody: Prisma.DbNull,
          createdAt: now,
          expiresAt,
        },
      });
      reservedId = refreshed.id;
    } else {
      const created = await prisma.idempotencyKey.create({
        data: {
          tenantId,
          key,
          method: request.method,
          path: scope,
          requestHash,
          expiresAt,
        },
      });
      reservedId = created.id;
    }
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      // Lost the race. Re-read and replay if the winner has finished.
      const winner = await prisma.idempotencyKey.findFirst({
        where: { tenantId, key, method: request.method, path: scope },
      });
      if (
        winner &&
        winner.expiresAt > now &&
        winner.responseStatus !== null &&
        winner.responseBody !== null
      ) {
        if (winner.requestHash !== requestHash) {
          return reply.code(422).send({
            error: 'Unprocessable Entity',
            message:
              'Idempotency-Key was reused with a different request body. Use a fresh key for a new request.',
          });
        }
        return reply.code(winner.responseStatus).send(winner.responseBody);
      }
      return reply.code(409).send({
        error: 'Conflict',
        message:
          'A request with this Idempotency-Key is currently in flight. Retry shortly.',
      });
    }
    throw err;
  }

  // Reservation held — run the handler.
  try {
    const result = await fn();
    await prisma.idempotencyKey.update({
      where: { id: reservedId },
      data: {
        responseStatus: result.status,
        responseBody: (result.body ?? null) as Prisma.InputJsonValue,
      },
    });
    return reply.code(result.status).send(result.body);
  } catch (err) {
    // Don't persist the failed response — let the reservation expire so the
    // client can retry. Best-effort delete; if it fails, the row TTLs out.
    try {
      await prisma.idempotencyKey.delete({ where: { id: reservedId } });
    } catch {
      // ignore — reservation will expire on its own
    }
    throw err;
  }
}
