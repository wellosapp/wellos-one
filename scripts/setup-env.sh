#!/usr/bin/env bash
# Wellos / Wellos Studio — fresh-clone env file scaffold.
#
# Creates the four .env files Wellos needs at dev time:
#
#   .env                       — root, used by `prisma` CLI
#   apps/api/.env              — Fastify dev (tsx 4.x reads .env from CWD)
#   apps/web/.env.local        — Next.js, NEXT_PUBLIC_* + Clerk routing only
#   apps/studio/.env.local     — same shape as web, plus Studio-specific vars
#
# Idempotent: existing files are left alone unless --force is passed.
# This script only writes empty schemas — fill in real values from the
# password manager before running `pnpm dev`.

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." &>/dev/null && pwd)"
cd "$REPO_ROOT"

FORCE=0
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
fi

write_if_missing() {
  local target="$1"
  local content="$2"
  if [[ -f "$target" && "$FORCE" -ne 1 ]]; then
    echo "  skip   $target (exists; pass --force to overwrite)"
    return 0
  fi
  mkdir -p "$(dirname "$target")"
  printf '%s' "$content" > "$target"
  echo "  wrote  $target"
}

# Root .env — full schema. Just copy .env.example, which is already empty.
if [[ ! -f .env || "$FORCE" -eq 1 ]]; then
  cp .env.example .env
  echo "  wrote  .env (copied from .env.example)"
else
  echo "  skip   .env (exists; pass --force to overwrite)"
fi

# apps/api/.env — same schema as root. Prisma 5 doesn't walk up from
# apps/api to find the root .env, and tsx auto-loads .env from CWD when
# `pnpm --filter @wellos/api dev` runs. Two files, same contents.
if [[ ! -f apps/api/.env || "$FORCE" -eq 1 ]]; then
  cp .env apps/api/.env
  echo "  wrote  apps/api/.env (copied from root .env)"
else
  echo "  skip   apps/api/.env (exists; pass --force to overwrite)"
fi

# apps/web/.env.local — Next.js only reads NEXT_PUBLIC_* vars on the
# client. Clerk + PostHog + Sentry browser SDKs need their publishable
# keys here. Server components inherit from the same file.
WEB_ENV='# apps/web — Next.js dev env. Fill in from password manager.
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3002

# Clerk — same publishable key as apps/studio (one Clerk app drives both).
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard

# Sentry — set these to upload source maps + capture browser errors.
# Leave blank locally unless you want Sentry on for dev.
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_ENABLED_LOCAL=false

# PostHog — leave blank locally unless you want analytics on for dev.
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.posthog.com
'
write_if_missing apps/web/.env.local "$WEB_ENV"

# apps/studio/.env.local — same shape as web with Studio-specific Sentry
# DSN and the studio app URL.
STUDIO_ENV='# apps/studio — Next.js dev env. Fill in from password manager.
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3002
NEXT_PUBLIC_STUDIO_APP_URL=http://localhost:3003

# Clerk — same publishable key as apps/web.
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard

# Sentry — separate project from apps/web.
NEXT_PUBLIC_SENTRY_DSN_STUDIO=
NEXT_PUBLIC_SENTRY_ENABLED_LOCAL=false

# PostHog — same project as apps/web.
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.posthog.com
'
write_if_missing apps/studio/.env.local "$STUDIO_ENV"

echo
echo "Done. Next:"
echo "  1. Open .env and fill in real values from the password manager."
echo "  2. Re-run this script with --force to push the new root .env into apps/api/.env."
echo "     (Or just: cp .env apps/api/.env)"
echo "  3. Open apps/web/.env.local and apps/studio/.env.local — fill the NEXT_PUBLIC_* values."
echo "  4. pnpm install && pnpm dev"
