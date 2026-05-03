// IMPORTANT: This file MUST be imported at the very top of src/index.ts,
// before any other Fastify or app imports. Call `preloadOpenTelemetry()` before
// `Sentry.init()` and keep `fastify` as a dynamic import in `index.ts` so OTEL
// can patch before construction (ESM + tsx).

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const dsn = process.env.SENTRY_DSN_API;

if (dsn) {
  Sentry.preloadOpenTelemetry();
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',

    // Adds request data, route name, and HTTP method to error events.
    integrations: [nodeProfilingIntegration()],

    // Performance: 10% of transactions sampled in production, 100% in dev.
    // Adjust later if Sentry quota becomes a concern.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Profiling: same as tracing — sample at the same rate.
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Don't capture errors during local dev unless explicitly opted in.
    enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_ENABLED_LOCAL === 'true',

    // Release identifier for source map matching. Railway injects
    // RAILWAY_GIT_COMMIT_SHA automatically; fall back to a placeholder.
    release: process.env.RAILWAY_GIT_COMMIT_SHA ?? 'local',
  });
}
