# Wellos Infrastructure — Current State Snapshot

**Last updated:** 2026-04-26 (end of v2 §1–§6 setup, before §7 observability and Epic 1)
**Maintainer:** keep current after every infrastructure change. Treat this doc as the single source of truth for "what's actually running where."

This document describes the live state of Wellos infrastructure as of today. For the original setup checklist that produced this state, see [`00-V2-per-build-setup.md`](./00-V2-per-build-setup.md). For account roster and env var canonical reference, see [`09-dev-handoff.md`](./09-dev-handoff.md).

---

## 1. Live Surfaces

| URL | What it serves | Hosted on | TLS |
|---|---|---|---|
| `https://api.wellos.one/healthz` | Fastify API (`apps/api`) — currently a `/healthz` endpoint returning `{"ok":true}` | Railway | Let's Encrypt (auto) |
| `https://app.wellos.one` | Wellos full-app frontend (`apps/web`) — currently a hello-world page | Vercel (`wellos-web`) | Let's Encrypt (auto) |
| `https://app.wellos.studio` | Wellos Studio frontend (`apps/studio`) — currently a hello-world page + PWA manifest | Vercel (`wellos-studio`) | Let's Encrypt (auto) |
| `https://wellosapi-production.up.railway.app/healthz` | Same as `api.wellos.one` — Railway-default URL kept as fallback | Railway | Let's Encrypt (auto) |
| `https://wellos-web-*.vercel.app` | Same as `app.wellos.one` — Vercel-default URL | Vercel | Let's Encrypt (auto) |
| `https://wellos-one-studio.vercel.app` | Same as `app.wellos.studio` — Vercel-default URL (project renamed but URL kept original) | Vercel | Let's Encrypt (auto) |

---

## 2. Domains & DNS

### 2.1 Registrar

Both `wellos.one` and `wellos.studio` are registered at **Squarespace Domains** (formerly Google Domains). DNS management is delegated to Cloudflare via nameserver change — Squarespace still owns the registration but Cloudflare answers DNS queries.

**Why split:** consolidates DNS management with Cloudflare's R2 object storage (already on the same Cloudflare account) and gives faster propagation + better DNS tooling. Registrar transfer to Cloudflare possible later for at-cost renewals; not urgent.

### 2.2 Cloudflare

- **Account:** existing personal Cloudflare account (`johnathanmericamarketing@gmail.com`)
- **Plan:** Free tier
- **Why this account:** R2 object storage is already on it; consolidates billing rather than splitting infra spend across two Cloudflare accounts. See `cloudflare_and_storage` memory.

### 2.3 Cloudflare nameservers

Both zones use Cloudflare's standard nameserver pair issued at zone creation:
- `armfazh.ns.cloudflare.com`
- `marissa.ns.cloudflare.com`

(The exact pair varies per Cloudflare zone — these were the assigned set for `wellos.one`.)

### 2.4 DNS records — `wellos.one` zone

| Type | Name | Content | Proxy | Purpose |
|---|---|---|---|---|
| `CNAME` | `api` | `xdfh4s3x.up.railway.app` | DNS only | Routes `api.wellos.one` to Railway |
| `CNAME` | `app` | `cname.vercel-dns.com` (or project-specific) | DNS only | Routes `app.wellos.one` to Vercel `wellos-web` |
| `CNAME` | `pm-bounces.mail` | `pm.mtasv.net` | DNS only | Postmark Return-Path for `mail.wellos.one` sending domain |
| `CNAME` | `pm-bounces` | `pm.mtasv.net` | DNS only | Postmark Return-Path at apex (backup; we send via subdomain) |
| `TXT` | `_railway-verify.api` | `railway-verify=...` | DNS only | Railway domain ownership verification for `api.wellos.one` |
| `TXT` | `_vercel` | `vc-domain-verify=app.wellos.one,...` | DNS only | Vercel domain ownership verification for `app.wellos.one` |
| `TXT` | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@mail.wellos.one` | DNS only | DMARC policy — quarantine failures (will tighten to `p=reject` post-MVP) |
| `TXT` | `20260426203400p._domainkey` | `k=rsa; p=...` (DKIM key) | DNS only | Postmark DKIM at apex (verified) |
| `TXT` | `20260426204106pm._domainkey.mail` | `k=rsa; p=...` (DKIM key) | DNS only | Postmark DKIM for `mail.wellos.one` subdomain (verified) |
| `TXT` | `@` (apex) | `v=spf1 -all` | DNS only | SPF anti-spoofing — explicitly says "no server is authorized to send from `@wellos.one`". Postmark uses `@mail.wellos.one`, which has its own Return-Path-based SPF. |

### 2.5 DNS records — `wellos.studio` zone

| Type | Name | Content | Proxy | Purpose |
|---|---|---|---|---|
| `CNAME` | `app` | `63413e82060b81dc.vercel...` | DNS only | Routes `app.wellos.studio` to Vercel `wellos-studio` |
| `TXT` | `_vercel` | `vc-domain-verify=...` | DNS only | Vercel domain ownership verification |
| `TXT` | `_dmarc` | `v=DMARC1; p=reject; sp=...` | DNS only | DMARC — reject failures |
| `TXT` | `@` (apex) | `v=spf1 -all` | DNS only | SPF — we don't send email from `@wellos.studio` |

### 2.6 DNS rules we follow

- **Always DNS-only (gray cloud) for `app`, `api`, `pm-bounces.*` records.** Vercel, Railway, and Postmark provision their own TLS certs; Cloudflare proxy interferes with cert validation. TXT records can't be proxied at all.
- **Marketing apex (`wellos.one`, `wellos.studio`)** currently has no A/CNAME records — neither domain serves a marketing site yet. Squarespace's old placeholder records were removed. When marketing pages ship (probably Vercel-hosted), records will be added at the apex level.

---

## 3. Services & Accounts

All accounts live under email `luexwellness@gmail.com` unless otherwise noted. 2FA is enabled on each. Credentials in password manager only — never in `.env` or chat.

### 3.1 GitHub

- **Org / user:** `wellosapp` (free GitHub user, NOT the older `johnathanmericamarketing` personal account)
- **Repo:** `wellosapp/wellos-one` (private)
- **Default branch:** `main`
- **Branch protection:** **NOT enabled** — requires GitHub Pro ($4/mo). User opted to defer; relying on PR-workflow self-discipline per CLAUDE.md §6.
- **GitHub Actions:** CI workflow at `.github/workflows/ci.yml` — runs lint, typecheck, test, build on every PR and push to main
- **GitHub Apps installed on `wellosapp`:** Railway, Vercel — both granted access to `wellos-one` only
- **`gh` CLI:** authenticated as `wellosapp` on the dev machine

### 3.2 Railway (backend)

- **Account:** `wellosapp` (signed in via GitHub OAuth)
- **Plan:** Free trial credit (~$5 / 30 days), then Hobby $5/mo + usage at MVP
- **Project:** `diligent-achievement` (Railway-auto-named — pending rename to `wellos-prod`)
- **Service:** `@wellos/api`
  - Source: GitHub `wellosapp/wellos-one` `main` branch, auto-deploy on push
  - Region: `us-east4` (Virginia)
  - Builder: **Metal** (Railway's new builder, Nixpacks marked deprecated)
  - Build command: `pnpm install --frozen-lockfile && pnpm --filter @wellos/api build`
  - Start command: `pnpm --filter @wellos/api start`
  - Healthcheck: `/healthz`, 60s timeout
  - Watch paths: `apps/api/**`, `packages/**`, `pnpm-lock.yaml`, `package.json`
  - Serverless: enabled (scales to zero when idle)
  - Restart policy: On Failure, max 10 retries
  - Custom domain: `api.wellos.one`
  - Default URL: `wellosapi-production.up.railway.app`

### 3.3 Vercel (frontends)

- **Team:** `wellosapp's projects` (Hobby plan)
- **Account:** signed in via GitHub OAuth as `wellosapp`
- **Projects:**

  | Project | Root Directory | Custom Domain | Default URL |
  |---|---|---|---|
  | `wellos-web` | `apps/web` | `app.wellos.one` | `wellos-web-*.vercel.app` |
  | `wellos-studio` | `apps/studio` | `app.wellos.studio` | `wellos-one-studio.vercel.app` (project was renamed from `wellos-one-studio` but Vercel kept the original URL) |

- Both projects: framework Next.js 14, auto-detected from monorepo, deploy from `wellosapp/wellos-one` `main` branch
- Auto-deploy on push to `main`, preview deploys on every PR

### 3.4 Supabase (Postgres + Storage)

- **Account:** `luexwellness@gmail.com` (org: `wellosapp's Org`, plan: Free)
- **Project:** `Wellosapp Project` (slug `xwiqyspbnhbjgdbtaywe`)
- **Region:** `us-east-2` (Ohio)
- **Plan:** Free tier (500 MB DB, 1 GB Storage, 10K-MAU Auth — Auth unused)
- **Compute:** Nano (`t4g.nano`) — Free tier default
- **URL:** `https://xwiqyspbnhbjgdbtaywe.supabase.co`
- **Connection strings (URLs in vault, not here):**
  - Transaction Pooler — port `6543`, IPv4 → `DATABASE_URL` (Railway runtime)
  - Session Pooler — port `5432`, IPv4 → `DIRECT_URL` (Prisma migrations)
  - Direct connection — port `5432` to `db.<ref>.supabase.co`, IPv6-only, **NOT used** (Railway is IPv4)
- **Keys (in vault):**
  - Publishable key (`sb_publishable_*`) → frontend safe
  - Secret key (`sb_secret_*`) → **backend only**
- **RLS:** not yet enabled (no tables to protect yet — will turn on as schema lands per CLAUDE.md hard rule #7)
- **Password:** alphanumeric + `-_.` only (no special chars — see `# in URL` lesson learned below)

### 3.5 Upstash (Redis)

- **Account:** `Personal` workspace
- **Database:** `wellos-prod`
- **Region:** `us-east-2` (Ohio) — matches Supabase exactly
- **Plan:** Free tier (10K commands/day, 256 MB, single region)
- **Eviction:** Disabled / `noeviction` (BullMQ requires this — eviction would silently drop queued jobs)
- **Connection (URLs in vault):**
  - TCP `rediss://default:<token>@<name>-<id>.upstash.io:6379` → `REDIS_URL` (BullMQ uses TCP)
  - REST `https://<name>-<id>.upstash.io` + token → `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (unused at MVP, kept for future Vercel-edge access)

### 3.6 Clerk (auth)

- **Workspace:** `Personal workspace` (Hobby plan)
- **Application:** `wellos-prod`
- **Environment:** Development (`pk_test_*` / `sk_test_*` keys) — Production environment unused at MVP
- **Sign-in methods enabled:** Email + Password
- **Sign-in methods disabled:** Phone number, SMS MFA (these were paid features Clerk had auto-enabled by default), all social logins (Google/Apple/GitHub/etc.)
- **Organizations feature:** disabled (paid tier; we do tenancy in our own DB)
- **Roles:** to be configured via custom session claims when Epic 1 wires auth code (`admin`, `staff`, `manager` per CLAUDE.md §3 and 09-dev-handoff Epic 1)
- **Webhook:** **NOT yet wired** — Clerk webhook URL `api.wellos.one/webhooks/clerk` for `user.created/updated/deleted` events deferred until Epic 1 implements the handler. `CLERK_WEBHOOK_SECRET` not yet generated.
- **Single Clerk app for both products** — same `CLERK_PUBLISHABLE_KEY` used by `app.wellos.one` and `app.wellos.studio`. Tenant + product context determined post-auth from our DB.

### 3.7 Postmark (transactional email)

- **Account:** existing **Clarity Labs USA** Postmark account (paid, $0 incremental for our use)
- **Server:** `Wellos - Production` (transactional, on the existing Clarity Labs account)
- **Sandbox Server:** **NOT yet created** — `Wellos - Sandbox` deferred to staging setup
- **Sending domains verified:**
  - `wellos.one` (apex) — DKIM at `20260426203400p._domainkey`, Return-Path `pm-bounces` → `pm.mtasv.net` ✅
  - `mail.wellos.one` (subdomain, **canonical sender**) — DKIM at `20260426204106pm._domainkey.mail`, Return-Path `pm-bounces.mail` → `pm.mtasv.net` ✅
- **Default sender:** `noreply@mail.wellos.one` (per `email_sending_convention` memory and `POSTMARK_FROM_EMAIL` in `.env.example`)
- **Why subdomain:** apex SPF stays restrictive (`v=spf1 -all`) as anti-spoofing; sending traffic isolated to `mail.wellos.one`; Postmark handles SPF for the subdomain via Return-Path automatically
- **Message Streams in use:** `outbound` (default transactional). `broadcast` stream specified in `.env.example` for future marketing email — not yet created in Postmark dashboard, do when we ship marketing email
- **Webhooks:** **NOT yet wired** — Bounce + Spam Complaint URLs to be added after Epic 8 (Notifications). `POSTMARK_WEBHOOK_SECRET` not yet generated.

### 3.8 Stripe (payments)

**Status: deferred** — see `stripe_deferred` memory. Will create account, apply for Connect Standard, and request Terminal access before Epic 6 (Stripe checkout). Connect approval takes days, so the clock starts ~3–4 weeks before Epic 6 begins.

### 3.9 TextLink (SMS)

**Status: deferred** — see `textlink_deferred` memory. Existing TextLink account with 3 SIMs already paid. Webhook URLs (`api.wellos.one/webhooks/textlink/*`) need Railway up first (✅ done) but SIM allocation strategy lives in `textlink-integration-guide.md` which is still pending export from Claude.ai project. Will pick up before Epic 8 (Notifications).

### 3.10 Sentry / PostHog / BetterStack

**Status: not yet set up** — v2 §7 (the next thing to do). All free tiers.

---

## 4. Environment Variables

Variable schema lives in [`.env.example`](../.env.example) at the repo root. Don't modify env var names without updating that file in the same commit.

### 4.1 Set in Railway (backend service `@wellos/api`)

| Variable | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase Transaction Pooler URL | port 6543 |
| `DIRECT_URL` | Supabase Session Pooler URL | port 5432 — Prisma migrations only |
| `SUPABASE_URL` | Supabase API URL | |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key | new `sb_publishable_*` naming |
| `SUPABASE_SECRET_KEY` | Supabase secret key | **backend only**, new `sb_secret_*` naming |
| `REDIS_URL` | Upstash TCP URL | `rediss://...:6379` |
| `CLERK_PUBLISHABLE_KEY` | Clerk Dev | `pk_test_*` |
| `CLERK_SECRET_KEY` | Clerk Dev | `sk_test_*`, **backend only** |
| `POSTMARK_SERVER_TOKEN` | Postmark `Wellos - Production` Server | per-Server token |
| `LOG_LEVEL` | manual | `info` |
| `NODE_ENV` | manual | `production` |
| `APP_URL` | manual | `https://app.wellos.one` |
| `API_URL` | manual | `https://api.wellos.one` |
| `FEATURE_FLAGS_PROVIDER` | manual | `internal` |

### 4.2 Set in Vercel (`wellos-web`)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://app.wellos.one` |
| `NEXT_PUBLIC_API_URL` | `https://api.wellos.one` |

### 4.3 Set in Vercel (`wellos-studio`)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://app.wellos.one` |
| `NEXT_PUBLIC_API_URL` | `https://api.wellos.one` |
| `NEXT_PUBLIC_STUDIO_APP_URL` | `https://app.wellos.studio` |

### 4.4 Set in GitHub Actions secrets

**None yet.** Will populate when CI needs to interact with external services (Sentry source map upload, etc.).

### 4.5 NOT yet set anywhere

These are in `.env.example` as placeholders but no real values exist yet:

- `CLERK_WEBHOOK_SECRET` — generated when Clerk webhook is wired
- `POSTMARK_WEBHOOK_SECRET` — generated by us when Postmark webhooks are wired
- `POSTMARK_FROM_EMAIL` — value is `noreply@mail.wellos.one` per `.env.example`, set when first email-sending code runs
- `POSTMARK_TRANSACTIONAL_STREAM=outbound`, `POSTMARK_BROADCAST_STREAM=broadcast` — when email-sending code runs
- All `STRIPE_*` — Stripe deferred (Epic 6)
- All `SQUARE_*` — multi-provider payments, set per-tenant via DB at onboarding (no platform values needed at MVP)
- All `TEXTLINK_*` — TextLink deferred (Epic 8)
- All `SENTRY_*`, `POSTHOG_*` — observability deferred (v2 §7, next)
- `JWT_SECRET` — generated when Epic 4 (magic links) wires the signing
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — REST API; only needed if we ever access Redis from Vercel edge functions

---

## 5. Repository State

- **Repo:** [`wellosapp/wellos-one`](https://github.com/wellosapp/wellos-one)
- **Default branch:** `main`
- **Local clone:** `H:/OneDrive/OneDrive - Evo Tech/Apps/WellOs/wellos-one`
- **Old scaffold (sunset):** `H:/OneDrive/OneDrive - Evo Tech/Apps/WellOs/WellOs_buildout` — kept for reference; not active. Safe to delete after a confidence period.

### 5.1 Monorepo structure

```
wellos-one/
├── apps/
│   ├── api/            # Fastify backend → Railway → api.wellos.one
│   ├── web/            # Next.js 14 → Vercel → app.wellos.one
│   └── studio/         # Next.js 14 + PWA manifest → Vercel → app.wellos.studio
├── packages/
│   └── shared/         # Cross-app shared code (placeholder)
├── prisma/
│   └── schema.prisma   # generator + datasource only, no models yet
├── supabase/           # RLS policies + seed data (placeholder)
├── docs/               # All engineering docs
├── phase2-reference/   # DigitalOcean Droplet path (Phase 2 migration target)
├── .github/workflows/
│   └── ci.yml          # lint + typecheck + test + build
├── .env.example        # env var schema
├── CLAUDE.md           # agent conventions
├── README.md
├── package.json        # pnpm workspace root, packageManager pinned to pnpm@10.33.2
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

### 5.2 Local toolchain (verified working)

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20.20.2 LTS | |
| pnpm | 10.33.2 | pinned via `packageManager` field in root `package.json` |
| Docker Desktop | 29.4.0 | unused at MVP (managed services) — for future local Postgres/Redis dev |
| psql | 16.13 | |
| `gh` CLI | latest | authed as `wellosapp` |
| `railway` CLI | 4.42.1 | unused for deploys (Railway auto-deploys on push to main) |
| `vercel` CLI | 52.0.0 | unused for deploys (Vercel auto-deploys on push to main) |
| `supabase` CLI | 2.90.0 | installed via Scoop |
| `redis-cli` | not installed | Windows lacks first-class support; use Upstash console for testing |

### 5.3 Git identity (known issue)

Local git config: `user.name=johnathanmericamarketing`, `user.email=johnathan.mericamarketing@gmail.com` — the **old** identity. All commits are authored as this user. Implications:

- Vercel preview deploys on PRs **fail** with "Git author must have access to the project" because `johnathanmericamarketing` isn't on the `wellosapp's projects` Vercel team.
- Production deploys (post-merge to `main`) **work** because they trigger via the wellosapp GitHub integration, not commit author.
- Commit attribution on GitHub shows the old account, not wellosapp.

**Two ways to fix later:**
1. Configure local git to commit as a wellosapp-owned email (`git config user.email "<wellosapp-verified-email>"`) and amend / re-commit going forward
2. Invite `johnathanmericamarketing` as a member to the Vercel team `wellosapp's projects`

Not blocking; flagged for follow-up cleanup.

### 5.4 Merged commits (chronological)

| # | PR | Commit | Description |
|---|---|---|---|
| 1 | — | `561f251` | Initial v2 scaffold (CLAUDE.md / README / .env.example for Wellos rebrand-to-be) |
| 2 | [#1](https://github.com/wellosapp/wellos-one/pull/1) | `aec3ad6` | Align pnpm version pin to 10.x in docs |
| 3 | [#2](https://github.com/wellosapp/wellos-one/pull/2) | `ec7bf2e` | Rebrand Velura/Fundamira → Wellos / Wellos Studio |
| 4 | [#3](https://github.com/wellosapp/wellos-one/pull/3) | `92654ca` | Scaffold pnpm monorepo (`apps/api`, `apps/web`, `apps/studio`) |
| 5 | [#4](https://github.com/wellosapp/wellos-one/pull/4) | `8398fec` | Bump Next 14.2.18 → 14.2.35 (CVE patches, Railway scan fix) |
| 6 | [#5](https://github.com/wellosapp/wellos-one/pull/5) | `a548e13` | Import 09-dev-handoff + .env.example alignments |

### 5.5 Open PRs

None at time of writing (this doc PR is the next).

---

## 6. CI/CD Pipeline

### 6.1 GitHub Actions (`.github/workflows/ci.yml`)

Runs on every PR and every push to `main`:

1. Checkout
2. `pnpm/action-setup@v4` (reads version from `packageManager` field in root `package.json`)
3. `actions/setup-node@v4` with Node 20
4. `pnpm install --frozen-lockfile`
5. `pnpm lint` (Next apps use `next lint`; api + shared have placeholder commands)
6. `pnpm typecheck` (all 4 workspaces)
7. `pnpm test` (placeholders — Vitest setup in a follow-up PR)
8. `pnpm build` (api → tsc → `dist/`; web + studio → Next static-prerender)

### 6.2 Auto-deploy

- **Railway** auto-deploys `apps/api` on every push to `main`
- **Vercel `wellos-web`** auto-deploys `apps/web` on every push to `main`
- **Vercel `wellos-studio`** auto-deploys `apps/studio` on every push to `main`
- **Vercel preview deploys** auto-trigger on every PR (currently failing — see §5.3 git identity issue)

No `deploy.yml` workflow needed — Railway and Vercel watch the repo themselves.

---

## 7. What's Deferred & Why

| Item | Status | Why |
|---|---|---|
| Stripe (account + Connect approval) | Deferred to Epic 6 (~6–8 weeks out) | Needs business entity / EIN / bank account; user prefers to handle business setup separately. See `stripe_deferred` memory. |
| TextLink (API key + webhook config) | Deferred to Epic 8 (~6–8 weeks out) | Needs SIM allocation guide (`textlink-integration-guide.md` — pending export from Claude.ai); webhook URLs need a real `api.wellos.one` (✅ done) but other prep still pending. See `textlink_deferred` memory. |
| Sentry / PostHog / BetterStack | v2 §7 (immediate next chunk) | Half-day of clicks; deferred to a fresh session after the major v2 §1–§6 push. |
| Staging environments (Railway + Vercel + Supabase + Upstash) | Will mirror prod once Epic 1 features stabilize | Premature staging would just duplicate currently-empty environments. Adding a staging Supabase project is the first thing once the schema starts changing. |
| BullMQ worker service on Railway | Will add when Epic 8 needs background jobs | No worker code yet (no notifications, no scheduled tasks). Worker will be a 2nd Railway service in the same project, sharing env vars. |
| Branch protection on `main` | Deferred indefinitely | Requires GitHub Pro ($4/mo); user opted for self-discipline on the PR workflow per CLAUDE.md §6. Revisit before second developer joins. |
| Webhook handlers for Clerk / Postmark / TextLink | Wired per epic when each is consumed | All three need code in `apps/api/src/routes/webhooks/*` plus signature verification. None of those endpoints exist yet. |
| Tailwind + shadcn/ui | Next focused PR after observability | Hello-world uses inline styles. Design system bootstrap is its own PR. |
| Vitest configuration | Follow-up PR | Test scripts are placeholders today. |
| Prisma client install + first migration | Epic 1 work | `prisma/schema.prisma` exists with generator + datasource only. Foundation tables (per `wellos-studio-start-plan.md` "Database Setup") land in Epic 1. |

---

## 8. Recovery Notes

If something breaks and you need to log in to fix it:

| Service | URL | Login |
|---|---|---|
| GitHub | github.com/wellosapp | wellosapp account |
| Cloudflare | dash.cloudflare.com | personal account (johnathanmericamarketing@gmail.com) |
| Squarespace | squarespace.com → Domains | account that owns wellos.one + wellos.studio |
| Railway | railway.app | wellosapp via GitHub OAuth |
| Vercel | vercel.com | wellosapp via GitHub OAuth |
| Supabase | supabase.com → Wellosapp Project | luexwellness@gmail.com |
| Upstash | console.upstash.com | Personal workspace |
| Clerk | dashboard.clerk.com | Personal workspace, app `wellos-prod` |
| Postmark | account.postmarkapp.com | existing Clarity Labs USA account |

All secrets live in the password manager. If a credential isn't there, it doesn't exist for our purposes — see CLAUDE.md hard rule #1.

---

## 9. Lessons Learned (gotchas hit during setup)

For future sessions or new team members — these are the non-obvious things that ate time:

1. **Supabase auto-generated DB password contained `#`** which broke the URL (URL fragment delimiter strips everything after it). Fix: regenerate password with alphanumeric + `-_.` only.
2. **Supabase "Direct" connection (port 5432 to `db.<ref>.supabase.co`) is IPv6-only** and won't work from Railway. Use the Session Pooler (also port 5432, but IPv4-compatible) for `DIRECT_URL`.
3. **Railway scans the entire `pnpm-lock.yaml` for security CVEs**, not just the deps of the deployed workspace. Bumping Next.js in `apps/web` / `apps/studio` was required even though only `apps/api` deploys to Railway.
4. **`pnpm/action-setup@v4` errors when both `version:` in workflow AND `packageManager` in `package.json` are set.** Keep only the `packageManager` field (modern single-source-of-truth).
5. **Vercel auto-detected the wrong workspace as Root Directory** on the first import (picked `apps/api` — Fastify, not what we want on Vercel). Always explicitly pick `apps/web` or `apps/studio`.
6. **Vercel project renames don't change the default `*.vercel.app` URL** — only the dashboard label. `wellos-studio` project still has URL `wellos-one-studio.vercel.app` from when it was named `wellos-one-studio`.
7. **Railway's "Generate Domain" needs the port your app is listening on** — for our Fastify, that's `8080` because Railway sets `PORT=8080` by default and our code reads `process.env.PORT`.
8. **Cloudflare imports from Squarespace come with `v=spf1 -all` on the apex** which would block Postmark sending if we sent from `@wellos.one`. Solution: send from `@mail.wellos.one` instead — apex stays restrictive as anti-spoofing.
9. **Clerk auto-enables paid features on new accounts** (Phone number sign-in, SMS MFA). Disable both before they incur Twilio charges.
10. **Railway's first deploys can be slow** (~10–20 min) during Railway's "Degraded Build Performance" incidents. Banner at top of dashboard. Not a config issue.

---

**Always update this doc when:** a service is added or removed, a domain or DNS record changes, a custom domain is wired, an env var is added or renamed, branch protection or deploy auto-trigger settings change, Stripe/TextLink/observability come out of "deferred."
