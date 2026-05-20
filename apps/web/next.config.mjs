import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { withSentryConfig } from '@sentry/nextjs';

const requireFromHere = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Monorepo root (…/wellos-one); next.config lives in apps/web. */
const repoRoot = path.resolve(__dirname, '..', '..');
const requireFromRepoRoot = createRequire(path.join(repoRoot, 'package.json'));

/**
 * pnpm stores scoped packages under node_modules/.pnpm as "@scope+name@ver".
 * When workspace symlinks are broken (Windows EPERM / partial install), webpack
 * still needs a real directory for resolve.alias.
 */
function findScopedPackageInPnpm(repoRootPath, scope, name) {
  const pnpmDir = path.join(repoRootPath, 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpmDir)) return undefined;
  const prefix = `${scope}+${name}@`;
  let entries;
  try {
    entries = fs.readdirSync(pnpmDir);
  } catch {
    return undefined;
  }
  const folder = entries.find((e) => e.startsWith(prefix));
  if (!folder) return undefined;
  const candidate = path.join(pnpmDir, folder, 'node_modules', scope, name);
  return fs.existsSync(path.join(candidate, 'package.json')) ? candidate : undefined;
}

/** Root dir of an installed package, or undefined if missing / broken install. */
function packageRoot(name) {
  const candidates = [
    () => path.dirname(requireFromHere.resolve(`${name}/package.json`)),
    () => path.dirname(requireFromRepoRoot.resolve(`${name}/package.json`)),
  ];
  if (name.startsWith('@')) {
    const parts = name.split('/');
    if (parts.length >= 2) {
      const [scope, ...rest] = parts;
      const pkgName = rest.join('/');
      if (scope && pkgName) {
        candidates.push(() => findScopedPackageInPnpm(repoRoot, scope, pkgName));
      }
    }
  }
  for (const tryResolve of candidates) {
    try {
      const resolved = tryResolve();
      if (resolved) return resolved;
    } catch {
      /* next candidate */
    }
  }
  return undefined;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pnpm + Sentry: webpack must compile these from source; otherwise client
  // chunks (e.g. `'use client'` layouts) can fail to resolve `@sentry/core`.
  transpilePackages: ['@sentry/nextjs', '@sentry/core', '@sentry/react'],
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = { ...config.resolve.alias };
    // Pin Sentry package roots — fixes intermittent "Can't resolve '@sentry/core'"
    // when pnpm’s symlink layout + client chunks confuse webpack.
    for (const pkg of ['@sentry/core', '@sentry/react', '@sentry/browser']) {
      const rootDir = packageRoot(pkg);
      if (rootDir) {
        config.resolve.alias[pkg] = rootDir;
      }
    }
    return config;
  },
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
