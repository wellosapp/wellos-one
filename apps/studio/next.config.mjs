import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_STUDIO,
  hideSourceMaps: true,
  silent: !process.env.CI,
  tunnelRoute: '/monitoring',
  automaticVercelMonitors: false,
});
