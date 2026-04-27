// Next.js 14 instrumentation hook. Routes Sentry init to the correct
// runtime-specific config file based on which runtime we're in.
//
// See https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// (Note: Sentry v9 introduced an `onRequestError` export for capturing
// Server Component errors. We're on v8 which captures server errors via
// the withSentryConfig wrapper in next.config.mjs — sufficient for now.
// When we bump to Sentry v9, re-export onRequestError from here.)

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
