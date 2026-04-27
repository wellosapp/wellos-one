import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Type-safe `<Link href="...">` based on actual route segments.
    typedRoutes: true,
  },
};

// Sentry build-time configuration. Uploads source maps to Sentry on every
// Vercel build (when SENTRY_AUTH_TOKEN is set in Vercel env), so production
// stack traces stay un-minified.
//
// See https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#extend-your-nextjs-configuration
export default withSentryConfig(nextConfig, {
  // Sentry org and project slug — set via env vars so this file is the same
  // across web and studio. Vercel env: SENTRY_ORG, SENTRY_PROJECT.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_WEB,

  // Hide source maps from the deployed client bundle (still uploaded to
  // Sentry for stack-trace de-minification).
  hideSourceMaps: true,

  // Don't fail the Vercel build if SENTRY_AUTH_TOKEN is missing — log a
  // warning instead. Useful during the rollout phase before the token is
  // set everywhere.
  silent: !process.env.CI,

  // Tunnel client-side Sentry requests through this Next.js route to bypass
  // ad-blockers that block requests to *.ingest.sentry.io.
  tunnelRoute: '/monitoring',

  // Disable Sentry's automatic instrumentation of Vercel cron jobs — we
  // don't use Vercel cron.
  automaticVercelMonitors: false,
});
