# WellOs / Velura

Multi-vertical booking, payments, and CRM platform. Competitor to Mindbody, Vagaro, and GlossGenius, covering salon, massage, medspa, fitness/studio, and personal-training verticals.

## Running locally

TBD — fill in once Epic 1 is scaffolded. Until then, follow [`docs/00-V2-per-build-setup.md`](./docs/00-V2-per-build-setup.md) end-to-end to provision accounts, local toolchain, the repo, managed services (Railway / Supabase / Upstash / Vercel / Clerk / Stripe / Postmark / TextLink), domain + TLS, and CI.

## Documentation

All engineering docs live in [`docs/`](./docs). Start with:

- [`docs/00-V2-per-build-setup.md`](./docs/00-V2-per-build-setup.md) — **canonical** setup checklist + daily workflow (v2, managed PaaS path)
- [`docs/mindbody-rebuild-master-spec.md`](./docs/mindbody-rebuild-master-spec.md) — engineering blueprint (single source of truth)
- [`docs/09-dev-handoff.md`](./docs/09-dev-handoff.md) — accounts roster, env var reference, epic sequencing
- [`docs/00-pre-build-setup.md`](./docs/00-pre-build-setup.md) — *superseded* v1 (DigitalOcean path, kept as Phase 2 reference)
- [`docs/push-to-production.md`](./docs/push-to-production.md) — Phase 2 deploy pipeline (DigitalOcean Droplet)

Agent conventions for Claude Code live at [`CLAUDE.md`](./CLAUDE.md) at the repo root.

## Stack (summary — MVP path)

- **Backend:** TypeScript / Node 20 / Fastify / Prisma / Postgres 16 (Supabase) / Upstash Redis + BullMQ
- **Frontend:** Next.js 14 App Router / React / Tailwind / shadcn/ui
- **Auth:** Clerk (admin / staff / manager); client users use magic links
- **Payments:** Stripe (Connect Standard + Terminal) + Square (multi-provider abstraction)
- **Notifications:** Postmark (email, via existing Clarity Labs USA account) + TextLink (SMS, 3-SIM plan)
- **Hosting:** Railway (API + worker) · Vercel (web) · Supabase (DB + Storage) · Cloudflare (DNS + registrar)
- **Observability:** Sentry · PostHog · BetterStack
- **CI/CD:** GitHub Actions (lint / typecheck / test) · Railway + Vercel auto-deploy on push to `main`

**Phase 2 migration target:** DigitalOcean Droplet + Managed Postgres + Spaces — triggered when Railway compute > $80/mo sustained, or compliance / networking constraints require VM-level control. See `docs/00-V2-per-build-setup.md` Appendix A.

See `docs/mindbody-rebuild-master-spec.md` PART 11 for the full stack and rationale.
