import Fastify from 'fastify';

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

app.get('/healthz', async () => {
  return { ok: true };
});

app.get('/', async () => {
  return {
    service: 'wellos-api',
    healthz: '/healthz',
  };
});

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
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void start();
