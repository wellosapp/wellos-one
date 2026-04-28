# Wellos / Wellos Studio — fresh-clone env file scaffold (PowerShell variant).
#
# Creates the four .env files Wellos needs at dev time:
#
#   .env                       — root, used by `prisma` CLI
#   apps/api/.env              — Fastify dev (tsx 4.x reads .env from CWD)
#   apps/web/.env.local        — Next.js, NEXT_PUBLIC_* + Clerk routing only
#   apps/studio/.env.local     — same shape as web, plus Studio-specific vars
#
# Idempotent: existing files are left alone unless -Force is passed.
# This script only writes empty schemas — fill in real values from the
# password manager before running `pnpm dev`.

[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

function Write-IfMissing {
    param(
        [string]$Target,
        [string]$Content
    )
    if ((Test-Path $Target) -and -not $Force) {
        Write-Host "  skip   $Target (exists; pass -Force to overwrite)"
        return
    }
    $dir = Split-Path -Parent $Target
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    # Use UTF-8 (no BOM) so other tools read these files cleanly.
    [System.IO.File]::WriteAllText($Target, $Content, [System.Text.UTF8Encoding]::new($false))
    Write-Host "  wrote  $Target"
}

# Root .env — full schema. Just copy .env.example.
if ((-not (Test-Path '.env')) -or $Force) {
    Copy-Item '.env.example' '.env' -Force
    Write-Host '  wrote  .env (copied from .env.example)'
} else {
    Write-Host '  skip   .env (exists; pass -Force to overwrite)'
}

# apps/api/.env — same schema as root. Prisma 5 doesn't walk up from
# apps/api to find the root .env, and tsx auto-loads .env from CWD when
# `pnpm --filter @wellos/api dev` runs. Two files, same contents.
if ((-not (Test-Path 'apps/api/.env')) -or $Force) {
    Copy-Item '.env' 'apps/api/.env' -Force
    Write-Host '  wrote  apps/api/.env (copied from root .env)'
} else {
    Write-Host '  skip   apps/api/.env (exists; pass -Force to overwrite)'
}

# apps/web/.env.local — Next.js only reads NEXT_PUBLIC_* vars on the
# client. Clerk + PostHog + Sentry browser SDKs need their publishable
# keys here.
$WebEnv = @'
# apps/web — Next.js dev env. Fill in from password manager.
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
'@
Write-IfMissing 'apps/web/.env.local' $WebEnv

# apps/studio/.env.local
$StudioEnv = @'
# apps/studio — Next.js dev env. Fill in from password manager.
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
'@
Write-IfMissing 'apps/studio/.env.local' $StudioEnv

Write-Host ''
Write-Host 'Done. Next:'
Write-Host '  1. Open .env and fill in real values from the password manager.'
Write-Host '  2. Re-run this script with -Force to push the new root .env into apps/api/.env.'
Write-Host '     (Or just: Copy-Item .env apps/api/.env -Force)'
Write-Host '  3. Open apps/web/.env.local and apps/studio/.env.local — fill the NEXT_PUBLIC_* values.'
Write-Host '  4. pnpm install && pnpm dev'
