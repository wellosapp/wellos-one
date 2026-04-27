# Wellos

Multi-vertical booking, payments, and CRM platform — competitor to Mindbody, Vagaro, and GlossGenius. Covers salon, massage, medspa, fitness/studio, and personal-training verticals.

This monorepo ships **two products** sharing one backend, one database, and one tenant model:

| Product | Domain | What it is |
|---|---|---|
| **Wellos** | [`wellos.one`](https://wellos.one) | Full multi-vertical platform (`apps/web`) |
| **Wellos Studio** | [`wellos.studio`](https://wellos.studio) | Lighter PWA for solo practitioners and small studios (`apps/studio`) |

## Running locally

Prerequisites: Node 20.x LTS, pnpm 10.x (auto-installed via Corepack from the `packageManager` pin in `package.json`), Docker (for local Postgres/Redis if developing offline).

```bash
# Install workspace dependencies
pnpm install

# Run all apps in parallel (api on :3001, web on :3002, studio on :3003)
pnpm dev

# Or run individually
pnpm --filter @wellos/api dev
pnpm --filter @wellos/web dev
pnpm --filter @wellos/studio dev

# Quality gates
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

For first-time setup of accounts, managed services (Railway / Supabase / Upstash / Vercel / Clerk / Postmark), and domain + TLS, follow [`docs/00-V2-per-build-setup.md`](./docs/00-V2-per-build-setup.md) end-to-end.

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
