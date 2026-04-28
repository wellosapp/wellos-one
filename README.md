# Wellos

Multi-vertical booking, payments, and CRM platform — competitor to Mindbody, Vagaro, and GlossGenius. Covers salon, massage, medspa, fitness/studio, and personal-training verticals.

This monorepo ships **two products** sharing one backend, one database, and one tenant model:

| Product | Domain | What it is |
|---|---|---|
| **Wellos** | [`wellos.one`](https://wellos.one) | Full multi-vertical platform (`apps/web`) |
| **Wellos Studio** | [`wellos.studio`](https://wellos.studio) | Lighter PWA for solo practitioners and small studios (`apps/studio`) |

## Running locally

### Prerequisites

- **Node 20.x LTS** (currently tested on 20.20.x)
- **pnpm 10.x** — auto-installed via Corepack from the `packageManager` pin in `package.json`
- A filled-in password-manager entry for the Wellos accounts (Supabase, Clerk, Postmark, Upstash, Sentry, PostHog) — see [`docs/INFRASTRUCTURE.md`](./docs/INFRASTRUCTURE.md) §3 for the full list

> Docker is **not** required at MVP — we run on managed Supabase + Upstash. Docker only becomes relevant for the Phase 2 DigitalOcean migration target.

### Fresh-clone walkthrough

The dev setup needs **four** env files because of how each tool reads its environment. The `setup-env` script creates all four with the right shape; you fill in the values.

```bash
git clone git@github.com:wellosapp/wellos-one.git
cd wellos-one
pnpm install                                  # also runs `prisma generate` via postinstall

# Scaffold all four env files (idempotent — safe to re-run; pass --force to overwrite)
bash scripts/setup-env.sh                     # macOS / Linux / Git Bash on Windows
# pwsh scripts/setup-env.ps1                  # Windows PowerShell

# Fill in real values:
#   - .env                       (root: full schema, used by `prisma` CLI)
#   - apps/api/.env              (same schema as root; tsx loads .env from CWD)
#   - apps/web/.env.local        (NEXT_PUBLIC_* + Clerk routing only)
#   - apps/studio/.env.local     (same shape as web, plus Studio-specific vars)

# After editing root .env, re-sync to apps/api so they don't drift:
bash scripts/setup-env.sh --force             # or:  cp .env apps/api/.env
```

Why four files (not one):

- **Root `.env`** is read by the Prisma CLI (`pnpm prisma db seed`, migrations). Prisma reads it from the schema's directory.
- **`apps/api/.env`** is read by `tsx` (4.x) when `pnpm --filter @wellos/api dev` runs — tsx auto-loads `.env` from CWD, and Prisma 5 doesn't walk up to find the root `.env`. We track this as a follow-up to consolidate via `dotenv-cli` (see [`docs/SESSION-HANDOFF-2026-04-28.md`](./docs/SESSION-HANDOFF-2026-04-28.md)).
- **`apps/web/.env.local`** and **`apps/studio/.env.local`** are read by Next.js per app directory. Only `NEXT_PUBLIC_*` and Clerk routing vars belong here — Next.js never sees the root `.env`.

### Run the dev servers

```bash
pnpm dev                                      # all three apps in parallel
# api on :3001  ·  web on :3002  ·  studio on :3003

# or individually:
pnpm --filter @wellos/api dev
pnpm --filter @wellos/web dev
pnpm --filter @wellos/studio dev
```

### Smoke check

```bash
# API health (expect: {"ok":true,"db":"ok"})
curl -sS http://localhost:3001/healthz

# Visit http://localhost:3002 — sign in via Clerk, then check
# http://localhost:3001/me with the session token (devtools → cookies →
# __session). Expect a payload with your DB user populated by the Clerk
# webhook from earlier in your session.
```

If `/healthz` returns `db: "error"`, the API can't reach Postgres — most likely `DATABASE_URL` is wrong, or you're using the direct connection (`db.<ref>.supabase.co`, IPv6-only) instead of the **Transaction Pooler** URL on port 6543. See [`docs/INFRASTRUCTURE.md`](./docs/INFRASTRUCTURE.md) §3.4.

### Database migrations & seed

The dev DB is the production Supabase project — there's no separate dev DB at MVP (per [`docs/01A-current-build-context.md`](./docs/01A-current-build-context.md) §7). Migrations land via PR; for a fresh clone there's nothing to run unless you're working on a new schema change.

```bash
# Create a new migration (interactive — needs DIRECT_URL)
pnpm --filter @wellos/api db:migrate

# Apply pending migrations to the connected DB (non-interactive, used by Railway)
pnpm --filter @wellos/api db:migrate:deploy

# Seed roles + feature flags (idempotent)
pnpm --filter @wellos/api db:seed

# Open Prisma Studio against the connected DB
pnpm --filter @wellos/api db:studio
```

### Quality gates

```bash
pnpm typecheck                                # all 4 workspaces
pnpm lint
pnpm test
pnpm build
```

For first-time setup of the managed-service accounts (Railway / Supabase / Upstash / Vercel / Clerk / Postmark) and domain + TLS, follow [`docs/00-V2-per-build-setup.md`](./docs/00-V2-per-build-setup.md) end-to-end.

## Documentation

All engineering docs live in [`docs/`](./docs). Start with:

- [`docs/INFRASTRUCTURE.md`](./docs/INFRASTRUCTURE.md) — **current state snapshot** of every running service, env var, DNS record, and deploy URL. Update after every infra change.
- [`docs/00-V2-per-build-setup.md`](./docs/00-V2-per-build-setup.md) — **canonical** setup checklist + daily workflow (v2, managed PaaS path)
- [`docs/mindbody-rebuild-master-spec.md`](./docs/mindbody-rebuild-master-spec.md) — engineering blueprint (single source of truth for the full Wellos app)
- [`docs/wellos-studio-start-plan.md`](./docs/wellos-studio-start-plan.md) — startup plan for the Wellos Studio lighter sibling
- [`docs/09-dev-handoff.md`](./docs/09-dev-handoff.md) — accounts roster, env var reference, epic sequencing *(pending export from Claude.ai project — see `docs/MISSING-DOCS.md`)*
- [`docs/00-pre-build-setup.md`](./docs/00-pre-build-setup.md) — *superseded* v1 setup (DigitalOcean path, kept as Phase 2 reference)
- [`docs/push-to-production.md`](./docs/push-to-production.md) — Phase 2 deploy pipeline (DigitalOcean Droplet)

Agent conventions for Claude Code live at [`CLAUDE.md`](./CLAUDE.md) at the repo root.

> **Naming history:** the product iterated through "Velura" (full app codename) and "Fundamira Salon" (light app) before settling on Wellos / Wellos Studio in April 2026. Spec docs (`04-booking-flow.md`, `05-`, `10-`, `11-`, `12-`, `006-booking-design-refresh.md`) still contain legacy Velura/Fundamira references — to be scrubbed in a later content pass.

## Stack (summary — MVP path)

- **Backend:** TypeScript / Node 20 / Fastify / Prisma / Postgres 16 (Supabase) / Upstash Redis + BullMQ
- **Frontends:** Next.js 14 App Router / React / Tailwind / shadcn/ui — `apps/web` (full Wellos) and `apps/studio` (Wellos Studio PWA)
- **Auth:** Clerk (admin / staff / manager); client users use magic links
- **Payments:** Stripe (Connect Standard + Terminal) + Square (multi-provider abstraction)
- **Notifications:** Postmark (email, via existing Clarity Labs USA account, sending domain `mail.wellos.one`) + TextLink (SMS, 3-SIM plan)
- **Hosting:** Railway (API + worker) · Vercel (both frontends) · Supabase (DB + Storage) · Cloudflare (DNS, registrar may stay at Squarespace)
- **Observability:** Sentry · PostHog · BetterStack
- **CI/CD:** GitHub Actions (lint / typecheck / test / `prisma migrate diff`) · Railway + Vercel auto-deploy on push to `main`

**Phase 2 migration target:** DigitalOcean Droplet + Managed Postgres + Spaces — triggered when Railway compute > $80/mo sustained, or compliance / networking constraints require VM-level control. Reference material in [`phase2-reference/`](./phase2-reference). See `docs/00-V2-per-build-setup.md` Appendix A.

See `docs/mindbody-rebuild-master-spec.md` PART 11 for the full stack and rationale.
