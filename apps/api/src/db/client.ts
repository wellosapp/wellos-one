import { PrismaClient } from '@prisma/client';

import { softDeleteExtension } from './softDelete.js';

// Single extended PrismaClient per process. Cached on globalThis in non-production
// so that tsx-watch reloads don't open a new connection pool on every save —
// without this, dev sessions exhaust Supabase pooled connections fast.
function buildClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  }).$extends(softDeleteExtension);
}

export type ExtendedPrismaClient = ReturnType<typeof buildClient>;

// The shape passed to a $transaction callback. Extended clients return a
// transaction client that's also extended, so the bare `Prisma.TransactionClient`
// type doesn't match. Helpers that take a tx (e.g. audit-log writers in
// services/) should accept this type.
export type ExtendedTransactionClient = Parameters<
  Parameters<ExtendedPrismaClient['$transaction']>[0]
>[0];

declare global {
  // eslint-disable-next-line no-var
  var __wellosPrisma: ExtendedPrismaClient | undefined;
}

export const prisma: ExtendedPrismaClient =
  globalThis.__wellosPrisma ?? buildClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__wellosPrisma = prisma;
}

// Eagerly establish the DB connection at module load instead of waiting for
// the first query. On Railway serverless, the container cold-starts on each
// invocation; lazy connection means the first webhook/request waits on TCP
// handshake + Postgres auth, which often times out before Supabase pooler
// answers (~70% of webhook attempts failed this way before this change).
//
// $connect() is fire-and-forget here — we don't await at module scope.
// If it fails, individual queries will retry on demand. If it succeeds,
// subsequent requests get a warm pool.
void prisma.$connect().catch((err) => {
  // Logged via console so it surfaces in Railway logs even before Fastify
  // boots its own logger.
  console.warn(
    '[prisma] eager $connect failed at boot:',
    err instanceof Error ? err.message : err,
  );
});
