// Sentry MUST be imported FIRST so its auto-instrumentation patches Node
// modules before Fastify and other deps are loaded.
import './instrument.js';

import * as Sentry from '@sentry/node';
import Fastify from 'fastify';

import clerkPlugin from './plugins/clerk.js';
import corsPlugin from './plugins/cors.js';
import prismaPlugin from './plugins/prisma.js';
import meRoutes from './routes/me.js';
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
  };
});

// Protected routes — pulled into routes/ files as the surface grows.
await app.register(meRoutes);

// Webhooks last, encapsulated. Raw-body content-type parser is scoped to
// this register call only so non-webhook routes keep Fastify's default
// JSON parser. requireAuth NOT applied — provider HMAC (svix for Clerk)
// is the authentication mechanism.
await app.register(webhookRoutes);

// Verification endpoint for confirming Sentry is wired correctly. Hit this
// from anywhere (curl, browser) and a deliberate error should appear in
// Sentry's wellos-api project within 30 seconds.
//
// Gated to NODE_ENV !== 'production' so it can't be hit on real traffic.
// Remove or move behind an auth check before any real production launch.
if (process.env.NODE_ENV !== 'production' || process.env.SENTRY_TEST_ROUTE_ENABLED === 'true') {
  app.get('/__test/error', async () => {
    throw new Error('Sentry test error from /__test/error — if you see this in Sentry, the wire is good.');
  });
}

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
