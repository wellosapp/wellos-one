import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

// CORS allow-list. Production: app.wellos.one + app.wellos.studio only.
// Dev or pk_test_*: also localhost:3002, localhost:3003, *.vercel.app.
// credentials:true so Clerk's __clerk_db_jwt cookie round-trips on dev keys.
//
// Webhooks (Postmark, Clerk, TextLink, Stripe) are not browser requests —
// they don't go through CORS. Don't add provider hostnames here.

const PROD_ORIGINS = ['https://app.wellos.one', 'https://app.wellos.studio'];
const DEV_ORIGINS = ['http://localhost:3002', 'http://localhost:3003'];
const VERCEL_PREVIEW_REGEX = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

async function corsPlugin(app: FastifyInstance): Promise<void> {
  const isDev = process.env.NODE_ENV !== 'production';
  const isClerkTest = (process.env.CLERK_PUBLISHABLE_KEY ?? '').startsWith('pk_test_');
  const allowDevOrigins = isDev || isClerkTest;

  const allowList = new Set<string>([
    ...PROD_ORIGINS,
    ...(allowDevOrigins ? DEV_ORIGINS : []),
  ]);

  await app.register(cors, {
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Clerk-Auth',
      // Public booking tenant resolution (see routes/public/booking.ts).
      'X-Wellos-Tenant-Slug',
      'X-Tenant-Id',
    ],
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowList.has(origin)) return cb(null, true);
      if (allowDevOrigins && VERCEL_PREVIEW_REGEX.test(origin)) return cb(null, true);
      app.log.warn({ origin }, 'CORS blocked: origin not in allow-list');
      return cb(new Error('Not allowed by CORS'), false);
    },
  });
}

export default fp(corsPlugin, { name: 'wellos-cors', fastify: '5.x' });
