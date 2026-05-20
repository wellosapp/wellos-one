// Sentry MUST be imported FIRST so its auto-instrumentation patches Node
// modules before Fastify and other deps are loaded.
import './instrument.js';

// Teach JSON.stringify how to serialize BigInt — Prisma returns BigInt for
// columns like MediaAsset.sizeBytes, and Fastify's default serializer
// otherwise throws "Do not know how to serialize a BigInt" on response.
// Stringifying preserves precision past Number.MAX_SAFE_INTEGER; the web
// wrapper coerces back to number where needed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

import * as Sentry from '@sentry/node';
import Fastify from 'fastify';

import clerkPlugin from './plugins/clerk.js';
import corsPlugin from './plugins/cors.js';
import prismaPlugin from './plugins/prisma.js';
import adminRoutes from './routes/admin/index.js';
import meRoutes from './routes/me.js';
import publicRoutes from './routes/public/index.js';
import webhookRoutes from './routes/webhooks/index.js';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
  // Railway / Vercel sit in front of the API. Without trustProxy, request.ip
  // and the X-Forwarded-* headers don't reflect the real client.
  trustProxy: true,
});

// Hook Sentry into Fastify's error pipeline. Captures unhandled errors and
// sends them to Sentry with route + request context attached.
Sentry.setupFastifyErrorHandler(app);

// Plugin order:
//   1. CORS — first so OPTIONS preflights short-circuit before JWKS work.
//   2. Clerk — populates request.auth on every request; does NOT block.
//      Per-route opt-in via requireAuth keeps /healthz + future
//      /webhooks/* routes open.
//   3. Prisma — DB decorator.
await app.register(corsPlugin);
await app.register(clerkPlugin);
await app.register(prismaPlugin);

// Public routes — no requireAuth. /healthz is hit by BetterStack uptime
// monitoring without credentials; / is a humans-curl smoke target.
//
// /healthz also pings Postgres so the Prisma connection pool stays warm
// between Railway serverless cold starts. Without this, the first webhook
// after an idle period times out trying to reach Supabase pooler. BetterStack
// hits us every 3 minutes — that's enough to keep the pool warm.
//
// If the DB ping fails, we still return 200 so BetterStack doesn't false-
// alarm on Supabase blips, but include `db: 'error'` in the body so a deeper
// monitor can detect it.
app.get('/healthz', async () => {
  try {
    await app.prisma.$queryRaw`SELECT 1`;
    return { ok: true, db: 'ok' };
  } catch (err) {
    app.log.warn({ err }, '/healthz DB ping failed');
    return { ok: true, db: 'error' };
  }
});

app.get('/', async () => {
  return {
    service: 'wellos-api',
    healthz: '/healthz',
    version: '/version',
  };
});

// /version exposes the running commit SHA so post-deploy verification
// (GitHub Actions, BetterStack, manual curl) can confirm prod is on the
// expected build. Without this, a failed Railway deploy that silently
// rolls back to the previous container is invisible from outside —
// /healthz stays 200 because the *old* container is still alive.
// (Lesson from the 2026-04-29 incident: 50 min stuck on stale code with
//  no external signal.)
//
// Railway populates RAILWAY_GIT_COMMIT_SHA + friends automatically. Locally
// they're undefined and we report "unknown".
const BOOTED_AT = new Date().toISOString();
app.get('/version', async () => {
  return {
    service: 'wellos-api',
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? 'unknown',
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID ?? 'unknown',
    environment:
      process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV ?? 'unknown',
    bootedAt: BOOTED_AT,
  };
});

// Protected routes — pulled into routes/ files as the surface grows.
await app.register(meRoutes);
await app.register(adminRoutes);
await app.register(publicRoutes);

// Webhooks last, encapsulated. Raw-body content-type parser is scoped to
// this register call only so non-webhook routes keep Fastify's default
// JSON parser. requireAuth NOT applied — provider HMAC (svix for Clerk)
// is the authentication mechanism.
await app.register(webhookRoutes);

const start = async () => {
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`wellos-api listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown on SIGTERM (Railway sends this on deploy) and SIGINT (Ctrl+C).
// Without this, in-flight requests get cut and BullMQ jobs may be left dangling
// when we add the worker process.
const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, closing server`);
  try {
    await app.close();
    // Flush any pending Sentry events before exit.
    await Sentry.close(2000);
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void start();
