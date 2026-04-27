import { PrismaClient } from '@prisma/client';

// Single PrismaClient per process. Cached on globalThis in non-production so
// that tsx-watch reloads don't open a new connection pool on every save —
// without this, dev sessions exhaust Supabase pooled connections fast.
declare global {
  // eslint-disable-next-line no-var
  var __wellosPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__wellosPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__wellosPrisma = prisma;
}
