// Sentry MUST be imported FIRST so its auto-instrumentation patches Node
// modules before Fastify and other deps are loaded.
import './instrument.js';

import * as Sentry from '@sentry/node';
import Fastify from 'fastify';

import prismaPlugin from './plugins/prisma.js';

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

await app.register(prismaPlugin);

app.get('/healthz', async () => {
  return { ok: true };
});

app.get('/', async () => {
  return {
    service: 'wellos-api',
    healthz: '/healthz',
  };
});

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
