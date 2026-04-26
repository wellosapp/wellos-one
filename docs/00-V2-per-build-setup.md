# 00 — Pre-Build Setup & Daily Workflow Playbook (v2)

**Version:** 2.0
**Date:** April 26, 2026
**Purpose:** This is the single checklist we follow before writing a line of app code, and the daily push/pull rhythm we use once building starts. If it isn't in this doc, it isn't done.

**Changelog from v1:**
- Hosting path changed from DigitalOcean Droplets (self-hosted everything) to **Railway + Supabase + Upstash + Vercel + Cloudflare** (managed PaaS) for MVP. DO Droplet path moved to Appendix A as the Phase 2 migration target.
- Email provider changed from Resend to **Postmark** (using existing Clarity Labs USA paid account, dedicated Server).
- SMS provider TextLink confirmed (paid 3-SIM plan).
- Auth added: **Clerk** for staff/admin/manager roles.
- Env var, webhook, and cost tables aligned with `09-dev-handoff.md` v1.2.

**Related docs (read these after this one):**
- `mindbody-rebuild-master-spec.md` — the engineering blueprint
- `technical-build-spec.md` — what we're building
- `09-dev-handoff.md` — accounts, env vars, epic sequencing (canonical)
- `textlink-integration-guide.md` — SMS architecture details
- `push-to-production.md` — Phase 2 deploy pipeline (DO Droplet path)
- `digitalocean-droplets.md`, `digitalocean-api.md` — Phase 2 infra reference

---

## 0. How to Use This Doc

This is a **sequential checklist**. Do the sections in order. Section 1 (accounts) unlocks Section 2 (local tools) unlocks Section 3 (repo) unlocks Section 4 (managed services wiring) unlocks Section 5 (domain) unlocks Section 6 (CI/CD) unlocks Section 7 (we start building).

Every item has one of three states: **Not Started**, **In Progress**, **Done**. Track these in the companion spreadsheet `00-setup-checklist.xlsx`. When every row is green, and only then, open Epic 1 from `09-dev-handoff.md`.

**Rule:** no skipping ahead. The solo-dev failure mode is half-built foundations. We finish foundations first.

**MVP hosting model:** Railway runs the Fastify API + BullMQ worker. Vercel runs the Next.js frontend. Supabase is Postgres + Storage. Upstash is Redis. Cloudflare is DNS + registrar. We are deliberately **not** running our own VMs at MVP — the DigitalOcean Droplet playbook is Appendix A and is the migration target for Phase 2 when traffic justifies it.

---

## 1. External Accounts & API Keys (Section A of checklist)

The full account roster (16 services across 5 tiers) is documented in `09-dev-handoff.md` § "Accounts and services setup". That table is canonical — this section gives the same picture in checklist form for setup-day execution.

**Operational rules for every account:**
- One shared `founder@<platform-domain>` email used for all signups. Never personal email.
- 2FA enabled on every account, especially Stripe, Postmark, Supabase, Railway, Cloudflare, and the domain registrar.
- API keys/tokens stored in 1Password (or Bitwarden) only. Never in `.env` files committed to git, never in Slack/Discord, never in a text file on the desktop.
- Production and staging credentials are separate. Use sandbox/test mode for staging where the provider supports it (Stripe, Postmark, TextLink).

### 1.1 Tier 1 — Required to deploy anything (Week 1)

| # | Service | Purpose | Plan / Cost | Action |
|---|---|---|---|---|
| 1 | **GitHub** (org, not personal) | Code repo + CI/CD via Actions | Free | Create org, add team, set branch protection on `main` |
| 2 | **Cloudflare** | DNS + registrar (cheapest, at-cost) + future CDN | Free | Register platform domain, point nameservers, enable proxying for the apex |
| 3 | **Railway** | Backend hosting (Fastify API + BullMQ worker) | Hobby ~$5/mo + usage; expect **$5–15/mo** at MVP | Connect GitHub, create project, add env vars |
| 4 | **Supabase** | Postgres + Storage (+ Auth fallback) | Free tier (500 MB DB, 1 GB storage); $25/mo Pro when outgrown | Create project, copy connection strings, enable RLS, save service-role key |
| 5 | **Upstash** | Redis for BullMQ queues + cache | Free tier (10K commands/day) | Create Redis instance, copy URL |
| 6 | **Vercel** | Next.js frontend hosting | Hobby (free) | Connect GitHub, configure custom domain |
| 7 | **Clerk** | Authentication (admin, staff, manager roles) | Free up to 10K MAU | Create application, configure roles + JWT template |

### 1.2 Tier 2 — Required before charging or messaging (Week 2)

| # | Service | Purpose | Plan / Cost | Action |
|---|---|---|---|---|
| 8 | **Stripe** | Payments + Stripe Connect (tenant payouts) + Terminal (in-person) | Pay-per-transaction (~2.9% + $0.30) | Create account, **(approval delay)** apply for Stripe Connect, request Terminal access |
| 9 | **Postmark** | Transactional email | $0 incremental — **using existing Clarity Labs USA paid account** | Create dedicated Server `MedSpa Platform - Production` + a Sandbox Server for staging. Add sending domain `mail.<platform-domain>`, configure DKIM/SPF/Return-Path, enable Bounce + Spam Complaint webhooks pointing at `api.<platform-domain>/webhooks/postmark/*` |
| 10 | **TextLink** | SMS (confirmations, reminders, OTP, waitlist) | Paid plan with **3 SIMs** at MVP | Already paid. Provision 3 SIMs, copy API key, configure Sent / Failed / Received / Tag-change webhooks pointing at `api.<platform-domain>/webhooks/textlink/*`. See `textlink-integration-guide.md` for SIM allocation strategy |
| 11 | **Square Developer** *(BYO adapter — Phase 2)* | Tenants who already use Square as PoS | Free dev account | Create dev account, get sandbox creds in the password manager — wiring is Phase 2 |

### 1.3 Tier 3 — Observability and ops (Week 2–3, free tiers)

| # | Service | Purpose | Plan / Cost | Action |
|---|---|---|---|---|
| 12 | **Sentry** | Error tracking (frontend + backend) | Free tier (5K errors/mo) | Create projects for `web` and `api`, install SDK, wire source maps |
| 13 | **PostHog** | Product analytics + session replay | Free tier (1M events/mo) | Create project, add to web app, define key events (booking_completed, checkout_failed, etc.) |
| 14 | **BetterStack** *or* **Uptime Robot** | Uptime monitoring + status page | Free tier (10 monitors) | Add monitors for `app.<platform-domain>`, `api.<platform-domain>/health`, Postmark + TextLink webhook endpoints |

### 1.4 Tier 4 — Business + legal (whenever ready to take real money)

| # | Service | Purpose | Plan / Cost | Action |
|---|---|---|---|---|
| 15 | **Google Workspace** | Business email on platform domain | ~$7/user/mo | Create `founder@`, `support@`. (`noreply@` is aliased only — Postmark handles all sending.) |
| 16 | **Mercury** *or* **Relay** | Business banking, integrates with Stripe payouts | Free | Open business account, connect to Stripe |
| 17 | **Termly** *or* **Iubenda** | ToS + Privacy Policy generator (required before launch) | Free tier or ~$10/mo | Generate ToS, Privacy Policy, Cookie Policy; embed on marketing site |

### 1.5 AI tooling

| # | Service | Purpose |
|---|---|---|
| 18 | **Anthropic Console** | Claude Code API access |
| 19 | **Claude Code** (CLI) | Primary coding agent |
| 20 | **Password manager** (1Password / Bitwarden) | Secrets custody — Day 1, mandatory |

### 1.6 Tier 5 — NOT needed at MVP (Phase 2 migration target)

These are listed so it's clear what's deliberately deferred:

- **DigitalOcean** — Droplets, Managed Postgres, Spaces, Container Registry. Migration trigger: Railway compute > $80/mo, or compliance requires VM control. Playbook in Appendix A and `push-to-production.md`.
- **Apple Developer** ($99/yr) — only if native iOS app ships in Phase 3.
- **Google Play** ($25 one-time) — only if native Android app ships in Phase 3.

### 1.7 Total MVP monthly cost

| Service | Cost |
|---|---|
| Railway | $5–15 |
| Supabase | $0 (free tier) |
| Upstash | $0 (free tier) |
| Vercel | $0 (Hobby) |
| Clerk | $0 (free up to 10K MAU) |
| Stripe | Pay-per-transaction (no minimum) |
| Postmark | $0 incremental (existing Clarity Labs account) |
| TextLink | $0 incremental (3-SIM plan already paid) |
| Cloudflare | $0 |
| Sentry / PostHog / BetterStack | $0 (free tiers) |
| Google Workspace | ~$7/user/mo |
| **Total** | **~$12–25/mo** + Stripe transaction fees |

The checklist spreadsheet tracks per account: account created, billing enabled, team members invited, API key generated, API key + webhook secret stored in password manager. **An API key that isn't in the password manager doesn't exist for our purposes.**

**Never commit** any of these to git. The only env file in the repo is `.env.example` with empty placeholders.

---

## 2. Local Development Environment (Section B of checklist)

Every developer working on the project needs the same local toolchain. Pin versions. Mismatched Node versions is how three hours disappear.

### 2.1 Required tools (MVP Railway path)

| Tool | Version | Install |
|---|---|---|
| **Node.js** | 20.x LTS | `nvm install 20 && nvm use 20` |
| **pnpm** | 10.x | `corepack enable && corepack prepare pnpm@10 --activate` |
| **Docker Desktop** | latest | docker.com — used for local Postgres/Redis if developing offline |
| **Git** | 2.40+ | git-scm.com |
| **`gh`** (GitHub CLI) | latest | `brew install gh` |
| **`railway`** (Railway CLI) | latest | `brew install railway` or `npm i -g @railway/cli` |
| **`vercel`** (Vercel CLI) | latest | `npm i -g vercel` |
| **`supabase`** (Supabase CLI) | latest | `brew install supabase/tap/supabase` |
| **PostgreSQL client** (`psql`) | 16.x | `brew install postgresql@16` |
| **Redis client** (`redis-cli`) | 7.x | `brew install redis` |
| **Claude Code** (CLI) | latest | see 2.2 |
| **VS Code / Cursor** | latest | editor of choice |

Verify each with: `node -v && pnpm -v && docker -v && git --version && gh --version && railway --version && vercel --version && supabase --version && psql --version && redis-cli --version`.

> **Phase 2 only:** `doctl` (DigitalOcean CLI) is added to this list when the migration to Droplets begins. Not needed at MVP.

### 2.2 Claude Code setup

Claude Code is the primary coding agent we drive this build with. It runs in the terminal and edits files in the repo directly.

1. Install: follow the current install instructions at the official Claude Code docs. Requires Node.js 18+ and works on macOS, Linux, and WSL on Windows.
2. Authenticate: on first run Claude Code will prompt for an Anthropic API key or browser sign-in.
3. From inside the repo root: run `claude` to start an interactive session.
4. Create a `CLAUDE.md` file at the repo root (we do this in Section 3.4) — Claude Code reads it automatically.

**Rule of thumb for using Claude Code on this project:**
- Tell it which doc(s) to read first (`mindbody-rebuild-master-spec.md`, the relevant epic doc from `09-dev-handoff.md`, and any integration guide like `textlink-integration-guide.md`).
- Scope the task tightly — one ticket at a time, not "build the whole dashboard."
- Review every diff before committing. Claude Code does not commit on its own — the human clicks the button.
- When it gets stuck, give it more context (logs, error messages, the exact file it should look at), not more pressure.

### 2.3 SSH keys

Even on the Railway/Vercel path, generate a project SSH key now — it's needed for GitHub and for the Phase 2 DO migration:

1. Generate a dedicated SSH key for this project: `ssh-keygen -t ed25519 -C "founder+project@<platform-domain>" -f ~/.ssh/id_ed25519_projectname`.
2. Add public key to GitHub (Settings → SSH keys).
3. Add to `~/.ssh/config` so commands pick it up automatically.

### 2.4 Password manager

One shared vault for the project. Required entries before continuing:
- All API keys and webhook secrets from Section 1
- Domain registrar login + 2FA backup codes
- Cloudflare API token (DNS edit scope)
- Railway, Vercel, Supabase, Upstash account credentials
- GitHub deploy SSH private key (created in Section 6)

---

## 3. Repository Bootstrap (Section C of checklist)

### 3.1 Create the repo

1. Create **one** GitHub repo under the org. Private. Name it something boring and descriptive.
2. Default branch: `main`. Protect it from day one:
   - Require pull request before merging
   - Require at least one approving review
   - Require status checks to pass (we'll wire CI in Section 6, add this rule then)
   - Disable direct pushes to `main`
3. Clone locally.

### 3.2 Repo structure (MVP Railway path)

```
/
├── apps/
│   ├── web/                  # Next.js 14 (App Router) — deployed to Vercel
│   └── api/                  # Fastify + BullMQ worker — deployed to Railway
├── packages/
│   ├── shared/               # Shared types, utils, schema
│   └── notifications/        # SmsProvider + EmailProvider interfaces and adapters
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── supabase/                 # Supabase CLI artifacts (RLS policies, seed)
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy-api.yml        # Railway deploy
│   └── deploy-web.yml        # Vercel deploy
├── docs/                     # Every doc in this project lives here
│   ├── 00-V2-per-build-setup.md (this file)
│   ├── mindbody-rebuild-master-spec.md
│   ├── technical-build-spec.md
│   ├── 01-design-system.md
│   ├── 02-onboarding-flow.md
│   ├── 03-dashboard-today-view.md
│   ├── 04-booking-flow.md
│   ├── 09-dev-handoff.md
│   ├── textlink-integration-guide.md
│   ├── textlink-api-reference.md
│   ├── push-to-production.md          # Phase 2 reference
│   ├── digitalocean-droplets.md       # Phase 2 reference
│   └── digitalocean-api.md            # Phase 2 reference
├── .env.example
├── .gitignore
├── CLAUDE.md
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
└── README.md
```

> **Note:** the `infra/`, `docker/`, `migrations/` (raw SQL) directories from v1 are deferred to the Phase 2 DigitalOcean migration. At MVP, Railway handles container build, Prisma owns migrations, and Supabase RLS lives under `supabase/`.

### 3.3 `.gitignore` essentials

```
node_modules/
.next/
.env
.env.local
.env.*.local
dist/
build/
.turbo/
.DS_Store
*.log
.vscode/settings.json
.idea/
```

### 3.4 `CLAUDE.md` — agent instructions

Create `CLAUDE.md` at the repo root. This is the file Claude Code reads on every session start. Keep it short and factual.

```markdown
# CLAUDE.md — Project Conventions

## What this project is
Multi-vertical booking + scheduling SaaS platform (Mindbody rebuild). See docs/mindbody-rebuild-master-spec.md for the full blueprint.

## Stack (MVP)
- Node 20 + TypeScript + Fastify (apps/api)
- Next.js 14 App Router + TypeScript (apps/web)
- Postgres via Supabase + Prisma ORM
- Redis on Upstash for queues (BullMQ) and cache
- Clerk for auth
- Stripe for payments
- Postmark for transactional email
- TextLink for SMS
- Sentry for error tracking, PostHog for analytics
- API deployed to Railway, web deployed to Vercel

## Before you write code
1. Read docs/mindbody-rebuild-master-spec.md for the relevant section.
2. Read docs/09-dev-handoff.md for the epic this ticket belongs to.
3. For SMS work, read docs/textlink-integration-guide.md first.
4. Confirm with me (the human) the file(s) you plan to touch before editing.

## Hard rules
- Never commit .env files or secrets.
- Never push directly to main. Always work on a feature/* branch and open a PR.
- Never run destructive commands (rm -rf, DROP TABLE, force push) without me confirming.
- Use pnpm, not npm or yarn.
- TypeScript strict mode is on. No `any` without a comment explaining why.
- New database columns require a Prisma migration in /prisma/migrations, never schema edits to existing tables without a migration.
- Provider SDK calls (Stripe, Postmark, TextLink, Clerk) live behind interfaces in packages/notifications or apps/api/src/integrations. Do not inline SDK calls in business logic.
- Webhook handlers must verify provider signatures before doing anything else.

## Commit style
- Conventional commits: feat:, fix:, chore:, docs:, refactor:, test:
- One concern per commit.
- Reference the ticket in the body: `Refs: O-3`.

## How to ask for help
If you're blocked on missing context, ask one specific question. Don't guess.
```

### 3.5 `.env.example`

Use the consolidated env block from `09-dev-handoff.md` § "Environment variables required (consolidated reference)". Values are empty in this file — it's a **schema**, not a secret. Anyone cloning the repo runs `cp .env.example .env` and fills in values from the password manager.

### 3.6 README.md

Short. Three sections: what the project is, how to run it locally (filled in once Epic 1 exists), and a link to the docs folder. Not the place for design decisions — those go in `docs/`.

### 3.7 First commit

`chore: initial repo scaffolding`. Push. Verify branch protection is actually enforced by trying to push directly to `main` — it should be rejected.

---

## 4. Managed Services Wiring (Section D of checklist)

This replaces the v1 "Server Provisioning" section. We are not provisioning a server at MVP — we are wiring up managed services and pointing them at the repo.

### 4.1 Supabase project

1. Supabase Dashboard → New Project. Name it `<project>-prod`. Region: closest to majority of users (stick with it — region migration is painful).
2. Database password: generate strong, store in password manager.
3. Once provisioned, copy from Settings → Database:
   - **Connection string (pooled, port 6543)** → `DATABASE_URL` (use this in Railway for runtime)
   - **Connection string (direct, port 5432)** → `DIRECT_URL` (use this for Prisma migrations only)
4. From Settings → API, copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon` key → `SUPABASE_ANON_KEY` (frontend-safe)
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**backend only, never expose to client**)
5. Create a separate Supabase project `<project>-staging` with the same setup for staging. Smaller tier is fine.
6. Enable Row-Level Security (RLS) on all tables once schema is applied — multi-tenant safety is not optional. See `mindbody-rebuild-master-spec.md` for tenant scoping rules.
7. Create a Supabase Storage bucket: `tenant-uploads` (private, signed URL access).

### 4.2 Upstash Redis

1. Upstash Console → Create Database. Region: same as Supabase project.
2. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or the standard `REDIS_URL` if using the BullMQ-compatible TCP endpoint — BullMQ needs TCP, not REST).
3. Repeat for `<project>-staging`.

### 4.3 Railway project

1. Railway Dashboard → New Project → Deploy from GitHub repo.
2. Connect the repo, point at `apps/api` as the root for the API service.
3. Add environment variables (paste from password manager — see `09-dev-handoff.md` env block).
4. Add a second service in the same Railway project: `apps/api` again, but with start command `pnpm worker` (or whatever the BullMQ worker entry point is). This is the worker process; runs the same code but a different entrypoint.
5. Configure custom domain inside Railway: `api.<platform-domain>`.
6. Repeat the whole setup in a separate Railway project for staging: `<project>-staging` with `api-staging.<platform-domain>`.

> **Why two services in one project, not two projects:** they share env vars, share the same Postgres connection pool, and share BullMQ via the same Redis. Two projects means duplicating env management.

### 4.4 Vercel project

1. Vercel Dashboard → Add New → Project → Import the GitHub repo.
2. Root directory: `apps/web`.
3. Framework preset: Next.js (auto-detected).
4. Add environment variables from the password manager (only the `NEXT_PUBLIC_*` and frontend-safe ones — the rest live in Railway).
5. Configure custom domain: `app.<platform-domain>`.
6. Set up a separate Vercel project (or use Vercel's Preview Deployments + Environment) for staging at `app-staging.<platform-domain>`.

### 4.5 Clerk application

1. Clerk Dashboard → Create application. Name: `<project>-prod`.
2. Enable Email + Password sign-in. Disable social logins for MVP unless explicitly required.
3. Define roles in JWT template: `admin`, `staff`, `manager`. (Client users don't authenticate at MVP — they use magic links per Epic 4.)
4. Copy:
   - `Publishable Key` → `CLERK_PUBLISHABLE_KEY` (frontend)
   - `Secret Key` → `CLERK_SECRET_KEY` (backend)
5. Create a webhook endpoint pointing at `api.<platform-domain>/webhooks/clerk` for `user.created`, `user.updated`, `user.deleted` events. Copy the **Signing Secret** → `CLERK_WEBHOOK_SECRET`.
6. Repeat for `<project>-staging`.

### 4.6 Stripe account + Connect

1. Stripe Dashboard → activate account, complete business verification.
2. Apply for **Stripe Connect Standard** (one-time approval, takes a few days). This is what tenants onboard onto for payouts.
3. Apply for **Stripe Terminal** access (in-person card readers, used in Epic 6).
4. Toggle to Test Mode for staging credentials. Copy:
   - Test mode → Publishable + Secret + Connect Client ID → staging env
   - Live mode → same → production env (Railway)
5. Create webhook endpoints in Stripe Dashboard:
   - `api.<platform-domain>/webhooks/stripe` (events: `payment_intent.*`, `charge.*`, `account.*`)
   - Same for staging URL
6. Copy each endpoint's **Signing Secret** → `STRIPE_WEBHOOK_SECRET` (separate value per env).

### 4.7 Postmark — using existing Clarity Labs USA account

Setup detail is also in `09-dev-handoff.md` Epic 8 — this is the operational checklist:

1. Log in to the existing Clarity Labs USA Postmark account.
2. Create a new **Server**: `MedSpa Platform - Production`. Pick the transactional template.
3. Create a second Server: `MedSpa Platform - Sandbox` for staging/dev sends.
4. In each Server → Sender Signatures & Domains → add domain `mail.<platform-domain>`. Postmark provides DKIM, SPF, and Return-Path DNS records — add these in Cloudflare (Section 5).
5. Wait for DKIM verification to pass (usually < 30 minutes).
6. Server → Settings → API Tokens — copy the **Server Token** → `POSTMARK_SERVER_TOKEN` (this is per-Server, not the account token; account token never goes in our code).
7. Server → Settings → Webhooks — add:
   - `api.<platform-domain>/webhooks/postmark/bounce` for Bounce events
   - `api.<platform-domain>/webhooks/postmark/complaint` for Spam Complaint events
8. Generate a **Postmark webhook secret** (we set this ourselves, since Postmark uses Basic Auth on webhook calls — set the Basic Auth user/pass to a random string and store as `POSTMARK_WEBHOOK_SECRET`).
9. Confirm Message Streams: keep the default `outbound` (transactional) and create a `broadcast` stream now to avoid a future migration when marketing email lands.

### 4.8 TextLink

1. Log into existing TextLink account.
2. Confirm 3 SIMs are provisioned and active in the Devices Console.
3. Decide SIM allocation strategy per `textlink-integration-guide.md` §3 (recommended: Option C — pooled with recipient pinning, for the most flexibility). Document the choice in the repo at `docs/textlink-sim-allocation.md`.
4. Note each SIM ID for env vars: `TEXTLINK_SIM_TRANSACTIONAL`, `TEXTLINK_SIM_REMINDERS`, `TEXTLINK_SIM_MARKETING` (or whatever the chosen allocation requires).
5. Dashboard → API Console — copy API key → `TEXTLINK_API_KEY`.
6. Configure webhooks pointing at:
   - `api.<platform-domain>/webhooks/textlink/sent`
   - `api.<platform-domain>/webhooks/textlink/failed`
   - `api.<platform-domain>/webhooks/textlink/inbound` (Received Message)
   - `api.<platform-domain>/webhooks/textlink/tag` (Tag Update)
7. Set a webhook secret in TextLink → store as `TEXTLINK_WEBHOOK_SECRET`.

### 4.9 Smoke test (no app yet)

From your laptop, with env vars loaded:

```bash
# Postgres reachable
psql "$DATABASE_URL" -c "SELECT 1;"

# Redis reachable
redis-cli -u "$REDIS_URL" ping       # should return PONG

# Postmark API reachable
curl -X GET "https://api.postmarkapp.com/server" \
  -H "X-Postmark-Server-Token: $POSTMARK_SERVER_TOKEN"

# TextLink API reachable
curl -X POST "https://textlinksms.com/api/send-sms" \
  -H "Authorization: Bearer $TEXTLINK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"+1<your-test-phone>","text":"setup smoke test"}'
```

If all four succeed, the managed services layer is ready. The Stripe and Clerk smoke tests come later — they require app code to actually exercise.

---

## 5. Domain & TLS (Section E of checklist)

### 5.1 DNS plan

| Hostname | Points to | Notes |
|---|---|---|
| `app.<platform-domain>` | Vercel (CNAME to `cname.vercel-dns.com`) | Staff web app |
| `book.<platform-domain>` | Vercel (CNAME) | Consumer booking — same Vercel project, different subdomain handling |
| `api.<platform-domain>` | Railway (CNAME to Railway's domain) | API + worker + webhook receiver |
| `mail.<platform-domain>` | Postmark (DKIM TXT records, no A/CNAME) | Email sending domain |
| `app-staging.<platform-domain>` | Vercel staging | |
| `api-staging.<platform-domain>` | Railway staging | |

**DNS lives in Cloudflare** — even if the domain was registered elsewhere, transfer DNS management to Cloudflare for: (a) free, generous DNS, (b) future Cloudflare Workers/CDN, (c) `dig` works fast.

### 5.2 Cloudflare DNS records

In Cloudflare → DNS:

1. Add CNAMEs for `app`, `book`, `api`, `app-staging`, `api-staging` per the table above. Use **DNS-only** (gray cloud) for these initially — Vercel and Railway handle TLS themselves, and orange-cloud proxying interferes with their cert provisioning.
2. Once Vercel/Railway confirm cert issued, you can flip to orange-cloud proxied if you want Cloudflare's CDN/DDoS in front. For MVP, gray-cloud is simpler.
3. Add the **Postmark DKIM TXT records** for `mail.<platform-domain>` exactly as Postmark provides them.
4. Add the **SPF record** for the apex domain: `v=spf1 include:spf.mtasv.net ~all` (Postmark) — adjust if Google Workspace also sends from the apex.
5. Add a **DMARC record** at `_dmarc.<platform-domain>`: `v=DMARC1; p=quarantine; rua=mailto:dmarc@<platform-domain>`.
6. Add **MX records** if Google Workspace is in use (per Workspace setup wizard).

### 5.3 TLS

TLS is **automatic** on this stack:
- **Vercel** issues and renews Let's Encrypt certs for any custom domain you add. Nothing to configure.
- **Railway** does the same for any custom domain.
- **Postmark** uses its own infrastructure — `mail.<platform-domain>` doesn't need a cert because we don't host anything there, we just sign email with DKIM.

> **No certbot, no nginx, no manual renewal at MVP.** That whole apparatus comes back if/when we migrate to DigitalOcean Droplets — see Appendix A.

### 5.4 Verify

```bash
dig app.<platform-domain> +short          # should resolve to Vercel
dig api.<platform-domain> +short          # should resolve to Railway
dig TXT mail.<platform-domain> +short     # should show Postmark DKIM
curl -I https://app.<platform-domain>     # 200 once Vercel deploys hello-world
curl -I https://api.<platform-domain>     # 200 once Railway deploys hello-world health endpoint
```

---

## 6. CI/CD Pipeline (Section F of checklist)

The MVP CI/CD is dramatically simpler than the v1 DigitalOcean playbook because Railway and Vercel handle the deploy half on their own. CI runs in GitHub Actions; deploys are triggered by Railway/Vercel watching `main`.

### 6.1 GitHub repo secrets

Settings → Secrets and variables → Actions → New repository secret. Add each from the password manager:

- [ ] `DATABASE_URL` — used by CI for migration check job
- [ ] `DIRECT_URL` — same
- [ ] `RAILWAY_TOKEN` — for `railway` CLI in CI if doing imperative deploys (optional; Railway auto-deploys on push by default)
- [ ] `VERCEL_TOKEN` — same for Vercel CLI (optional)
- [ ] `STRIPE_SECRET_KEY` (test mode) — if any CI tests hit Stripe
- [ ] `POSTMARK_SERVER_TOKEN` (sandbox) — if any CI tests send email
- [ ] `TEXTLINK_API_KEY` (test) — if any CI tests send SMS
- [ ] `SENTRY_AUTH_TOKEN` — for source map upload at deploy time

### 6.2 Workflows

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          DIRECT_URL: ${{ secrets.DIRECT_URL }}
```

**Deploys are handled by:**
- **Railway** — auto-deploys on push to `main` (configured in Railway dashboard). Uses the Railway-detected build for `apps/api`.
- **Vercel** — auto-deploys on push to `main`. Preview deploys for every PR.

No `deploy.yml` needed at MVP. We get to that in Phase 2.

### 6.3 First deploy (smoke test)

Before Epic 1 starts:

1. Create a throwaway branch with a trivial hello-world: a Next.js page in `apps/web` that says "hello" and a Fastify route `GET /healthz` returning `{ ok: true }` in `apps/api`.
2. Open a PR. CI runs lint/typecheck/test — they pass trivially. Vercel posts a Preview URL in the PR.
3. Merge to `main`. Railway and Vercel both auto-deploy.
4. Hit `https://app.<platform-domain>` — hello page loads.
5. Hit `https://api.<platform-domain>/healthz` — returns `{ ok: true }` over HTTPS.

If both work, **the platform is ready**. If not, fix the deploy chain before writing a single feature. Do not debug deploys while also building features — one unknown at a time.

### 6.4 Branch protection (enable now)

With CI working, go to Settings → Branches → `main` rule and require the `ci` status check to pass before merging.

---

## 7. Observability & Ops Day-One (Section G of checklist)

Minimum viable ops before real features:

- [ ] **Sentry projects** for `web` and `api`. `SENTRY_DSN_*` in env. Trigger a test error from each — confirm both land in Sentry.
- [ ] **PostHog** project created, snippet in `apps/web/app/layout.tsx`. Confirm events arrive.
- [ ] **BetterStack / Uptime Robot** monitors:
  - `https://app.<platform-domain>` — every minute
  - `https://api.<platform-domain>/healthz` — every minute
  - Postmark webhook endpoint — every 5 minutes (synthetic POST or check the audit log)
  - TextLink webhook endpoint — every 5 minutes
- [ ] **Railway built-in metrics** — confirm visible. CPU and memory dashboard for the API + worker services.
- [ ] **Logs** — structured JSON logs to stdout from the app. Railway captures them and provides search. Sufficient for MVP; ship to a dedicated log service when volume warrants it (Phase 2).
- [ ] **Alert routing** — alerts from Sentry and BetterStack go to a Slack channel + email that the right human actually watches.

---

## 8. The Daily Push/Pull Flow

Once Sections 1–7 are green, **this is the rhythm we follow for every ticket** from Epic 1 forward. Print it. Pin it.

### 8.1 Starting a ticket

```bash
# 1. Start fresh — pull latest main
git checkout main
git pull origin main

# 2. Create a feature branch per ticket
git checkout -b feature/O-3-business-profile-setup

# 3. Start Claude Code from the repo root
claude

# 4. Point Claude at the right docs before asking it to build anything
# Example prompt:
#   "Read docs/09-dev-handoff.md Epic 2 and docs/02-onboarding-flow.md.
#    Then implement ticket O-3. Confirm which files you plan to touch before editing."
```

**Rule:** one ticket, one branch. Never start a second ticket's work on the same branch.

### 8.2 While you work

- Commit in small, meaningful increments. Conventional commits (`feat: add business profile form`).
- Run the full check suite locally before pushing: `pnpm test && pnpm lint && pnpm typecheck`.
- If Claude Code generated a chunk of code, **read the diff**. Every line. You're accountable for what ships with your name on the commit.
- Push at the end of each work session, even if the work isn't done:
  ```bash
  git push origin feature/O-3-business-profile-setup
  ```
- Vercel posts a Preview URL on the PR — use it to verify UI changes before requesting review.

### 8.3 Opening a PR

```bash
gh pr create \
  --title "feat(onboarding): business profile setup (O-3)" \
  --body "Closes O-3. See docs/09-dev-handoff.md Epic 2."
```

Required in the PR body:
- What ticket this closes (`Closes O-3` or `Refs O-3`)
- One-paragraph description
- Screenshots if UI changed (link to Vercel Preview is fine)
- Migration notes if schema changed (Prisma migration filename)
- Any follow-up tickets discovered

CI runs. It must pass. If it fails, fix it on the branch — never force-merge a failing PR.

### 8.4 Code review

- At least one human approval before merge. On a solo project, self-review after a break counts — read your own diff cold the next morning.
- Reviewer checks: matches spec, tests cover new behavior, no secrets in the diff, no `any` in TypeScript without comment, migrations are additive (expand, not contract), provider SDK calls go through the abstraction layer, webhook handlers verify signatures.

### 8.5 Merging

- **Squash and merge.** One PR = one commit on `main`. Commit message = PR title.
- Delete the feature branch after merge (GitHub auto-deletes if you turned the setting on — do).
- Railway + Vercel auto-deploy on push to `main`. Watch Railway's deploy log and Vercel's deployment dashboard until both go green.
- Hit `https://app.<platform-domain>` and `https://api.<platform-domain>/healthz` after deploy — both 200 means production is live on the new version.

### 8.6 When CI fails

- **Never** merge a red PR by overriding protections.
- If a test is flaky, fix the test — don't retry until it passes.
- If a Prisma migration fails in CI, the migration is wrong — fix it on the branch and force-push the fix (branch-only, never `main`).

### 8.7 When a deploy fails

- Railway and Vercel deploys are atomic — a failed deploy doesn't replace the running version.
- If a deploy fails on a real bug: revert the offending commit on `main` via a new PR, merge the revert, deploy again. **Don't** edit code through the Railway/Vercel dashboards. Don't `git reset --hard` on `main`. Always revert via a forward commit.
- Both Railway and Vercel let you roll back to a previous deploy from their UI — use that as a stop-gap while preparing the revert PR.

### 8.8 Pull cadence

- **Every morning:** `git checkout main && git pull` before starting anything. If your feature branch is behind main, rebase or merge main into it — don't let it rot.
- **Before opening a PR:** rebase on main one more time.
- **After merging your PR:** `git checkout main && git pull`.

### 8.9 The `.env` sync rule

If you add a new env var:
1. Add the placeholder to `.env.example` in the same commit.
2. Add the real value to the password manager.
3. Add to GitHub Actions secrets (if needed at build/test time).
4. Add to **Railway** env (backend runtime) and **Vercel** env (frontend runtime), in both production and staging projects.
5. Note it in the PR body so the reviewer knows.

Miss any of these and the next person to pull will have a broken local or broken deploy. This is the single most common source of "it works on my machine" pain — enforce all five.

---

## 9. Definition of Done for Setup

The setup phase is done when **every checkbox below is green**:

- [ ] All Tier 1 + Tier 2 accounts created and credentials in the password manager (Section 1)
- [ ] Every developer has the local toolchain from Section 2 installed and verified
- [ ] Repo created, structured, protected, with `CLAUDE.md` and `.env.example` committed
- [ ] Supabase project live (prod + staging), RLS enabled, connection strings stored
- [ ] Upstash Redis instances live (prod + staging), `REDIS_URL` stored
- [ ] Railway projects live (prod + staging), API + worker services configured, env vars populated
- [ ] Vercel projects live (prod + staging), env vars populated
- [ ] Clerk applications configured (prod + staging), webhooks pointing at api endpoint
- [ ] Stripe account active, Connect approved (or in approval), Test mode keys in staging, webhooks configured
- [ ] Postmark Server `MedSpa Platform - Production` created in Clarity Labs account, sending domain DKIM-verified, webhooks configured
- [ ] TextLink: 3 SIMs confirmed active, allocation strategy documented, all four webhooks configured
- [ ] Domain DNS in Cloudflare, all subdomains resolve, DKIM/SPF/DMARC records published
- [ ] TLS issued automatically by Vercel + Railway for all subdomains
- [ ] GitHub Actions secrets populated, `ci.yml` present and tested with hello-world deploy
- [ ] Branch protection requires passing CI before merge
- [ ] Sentry receiving test errors from web + api, PostHog receiving events, uptime monitors pinging
- [ ] This doc read by every developer on the project

Once green, open Epic 1 from `09-dev-handoff.md`. The setup phase is over. Building begins.

---

## 10. Troubleshooting Quick Reference

| Symptom | First thing to check |
|---|---|
| Railway build fails | Check the build log — most often a missing env var or a wrong `package.json` entry. Railway expects either `npm start` or a `railway.json` config. |
| Railway service crashes on boot | Check service logs in Railway dashboard. Most common: bad `DATABASE_URL` (using direct URL instead of pooler), missing required env var. |
| Vercel build fails | Check build log. Most often: a server-only env var (no `NEXT_PUBLIC_` prefix) referenced in a client component. |
| Vercel deployed but page shows "Application error" | Check Vercel runtime logs (Functions tab). Usually a runtime env var is missing. |
| Supabase connection times out from Railway | Confirm Railway is using the **pooler** connection string (port 6543), not direct (5432). Direct is for Prisma migrations only. |
| Prisma migration fails with "prepared statement already exists" | You're using the pooler URL for migrations — switch to `DIRECT_URL` for `prisma migrate`, keep `DATABASE_URL` (pooler) for runtime. |
| Clerk webhook doesn't fire | Verify the webhook URL is the `https://api.<platform-domain>/...` form, not the Railway-default `*.up.railway.app` URL (Clerk requires a stable domain). |
| Stripe webhook signature verification fails | You're using the wrong `STRIPE_WEBHOOK_SECRET` — there's a separate one per webhook endpoint, and a separate one per env (test vs live). |
| Postmark email goes to spam | DKIM probably failed to verify. Run `dig TXT _domainkey.<platform-domain>` and confirm Postmark sees it as verified in their dashboard. |
| Postmark webhook fires but handler 401s | Postmark uses Basic Auth on webhooks. Set the user/pass in Postmark's webhook config and on your handler. |
| TextLink message stuck in queue | One of the 3 SIMs is offline. Check Devices Console; physical phone may be off Wi-Fi or low battery. |
| TextLink inbound webhook missing STOP message | Confirm "Received Message" webhook is configured in TextLink — separate from "Sent" and "Failed". |
| BullMQ jobs not running | Check Railway worker service logs. Most often: worker service not started, or `REDIS_URL` is the REST URL when BullMQ needs the TCP URL. |
| Local `pnpm dev` can't connect to anything | Run `cp .env.example .env` and fill in from password manager. Most common omission: forgot to populate `.env` after pulling new env vars. |

For anything not on this list: check Sentry, then check Railway/Vercel logs, then ask Claude Code with the exact error text.

---

## 11. Sign-off

| Role | Name | Date | ✅ |
|---|---|---|---|
| Technical lead | | | |
| Product | | | |

All signatures required before Epic 1 begins.

---

# Appendix A — Phase 2 Migration: DigitalOcean Droplet Path

This is the original v1 setup playbook, preserved as the migration target for when MVP outgrows Railway. **Do not execute this section at MVP.** The trigger to migrate is one of:

1. Railway compute bill exceeds ~$80/month sustained
2. A Railway limitation is hit (custom kernel needed, specific networking, on-prem hardware integration like Stripe Terminal that requires a static outbound IP)
3. Multi-region deployment becomes a requirement
4. Compliance (HIPAA-track work, specific tenant contracts) requires VM-level control

When that trigger fires, this appendix becomes the playbook. The full deploy details are in `push-to-production.md`; this is the ordered checklist version.

## A.1 Additional accounts

Add to the Tier list:
- **DigitalOcean** — Droplet, Managed Postgres, Spaces, Container Registry, DNS

## A.2 Additional local tools

| Tool | Install |
|---|---|
| **`doctl`** | `brew install doctl` / `snap install doctl` |

## A.3 Droplet provisioning

Region same as MVP Supabase region. Size: 4 vCPU / 8 GB RAM / 80 GB SSD. Image: Ubuntu 24.04 LTS. Enable VPC, IPv6, Monitoring, Backups at create-time. SSH key only. Cloud-init script from `infra/cloud-init/droplet-bootstrap.yml` creates the `deploy` user, installs Docker + nginx, configures UFW, sets up unattended-upgrades, creates a 2 GB swap file. Tags: `app-web`, `env:prod`. See `digitalocean-droplets.md` for the reasoning.

## A.4 Cloud Firewall

Apply to the `app-web` tag:

| Direction | Protocol | Port | Source | Purpose |
|---|---|---|---|---|
| Inbound | TCP | 22 | Office IP / VPN CIDR | SSH (never `0.0.0.0/0`) |
| Inbound | TCP | 80 | `0.0.0.0/0`, `::/0` | HTTP |
| Inbound | TCP | 443 | `0.0.0.0/0`, `::/0` | HTTPS |
| Inbound | TCP | 5432 | VPC CIDR only | Postgres internal |
| Inbound | TCP | 6379 | VPC CIDR only | Redis internal |
| Outbound | all | all | all | Default allow |

## A.5 Managed Postgres

DO Managed Postgres 16, same region, same VPC. Migrate Supabase data via `pg_dump`/`pg_restore` over the private network. Update `DATABASE_URL` in Railway (or in the Droplet's `/opt/app/shared/.env` once the Droplet is the runtime).

## A.6 Container Registry

`registry.digitalocean.com/<team-name>/app`. From laptop: `doctl registry login`. On Droplet: install `doctl` with a deploy-scoped token (Container Registry read + Droplets read only).

## A.7 Spaces

Create `app-prod-uploads` Space, same region. Migrate from Supabase Storage by streaming objects through the API (separate migration script).

## A.8 nginx + certbot

```bash
sudo certbot --nginx \
  -d app.<platform-domain> \
  -d book.<platform-domain> \
  -d api.<platform-domain> \
  --email ops@<platform-domain> \
  --agree-tos --no-eff-email --redirect
```

`webhooks.<platform-domain>` (or just paths under `api.<platform-domain>`) get their own nginx server block with a relaxed rate limit and 30-second timeout for Stripe/TextLink/Postmark webhooks.

## A.9 GitHub Actions deploy.yml

Add `.github/workflows/deploy.yml` per `push-to-production.md` Section 4. Required new secrets:
- `DIGITALOCEAN_ACCESS_TOKEN` (Container Registry write)
- `DEPLOY_SSH_KEY` (private key for CI → Droplet)
- `DEPLOY_HOST` (Droplet DNS or IP)
- `DEPLOY_USER` (`deploy`)

## A.10 Cutover

1. Deploy a green Droplet running the same code as Railway production (`docker compose up`).
2. Smoke test the Droplet stack against staging traffic.
3. Update Cloudflare CNAMEs to point at the Droplet (`api.<platform-domain>` from Railway → DO Droplet IP via Cloudflare proxy).
4. Decommission Railway only after one full week of clean Droplet operation.

The `mindbody-rebuild-master-spec.md` PART 12 and `push-to-production.md` are the canonical references for this path.
