// This file configures Sentry on the browser side. Loaded by Next.js
// automatically when withSentryConfig wraps next.config.mjs.
//
// See https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',

    // Performance: 10% sample rate in production, 100% in dev.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session replay: capture 10% of normal sessions, 100% of sessions
    // that contain an error. Replay is genuinely useful for debugging UX
    // issues; we can dial down later if quota becomes a concern.
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Don't send events from local dev unless explicitly opted in.
    enabled:
      process.env.NODE_ENV === 'production' ||
      process.env.NEXT_PUBLIC_SENTRY_ENABLED_LOCAL === 'true',
  });
}
