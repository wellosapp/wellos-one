// This file configures Sentry on the browser side. Loaded by Next.js
// automatically when withSentryConfig wraps next.config.mjs.
//
// See https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN_STUDIO;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',

    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    enabled:
      process.env.NODE_ENV === 'production' ||
      process.env.NEXT_PUBLIC_SENTRY_ENABLED_LOCAL === 'true',
  });
}
