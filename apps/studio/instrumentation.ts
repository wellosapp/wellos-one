// Next.js 14 instrumentation hook. See apps/web/instrumentation.ts for
// the rationale on why onRequestError is not re-exported (Sentry v8 vs v9).

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
