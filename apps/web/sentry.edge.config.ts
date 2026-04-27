// This file configures Sentry for Next.js code running in the Edge runtime
// (middleware and route handlers using `export const runtime = 'edge'`).
// Loaded automatically when withSentryConfig wraps next.config.mjs.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN_WEB;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLED_LOCAL === 'true',
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
  });
}
