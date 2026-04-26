# Wellos Studio — Startup Plan

## Purpose

**Wellos Studio** is the lighter sibling of the Wellos platform. It lives at `app.wellos.studio` and targets solo practitioners and small studios who only need calendar, booking, SMS, email, CRM, and payments — not the full multi-vertical depth of the main Wellos app.

It must use the **same backend, database, event bus, notifications, payments, and tenant model** as the full Wellos platform at `app.wellos.one`. Wellos Studio should *feel* small to the user without *being* small under the hood. Same engineering, simplified UI, gated feature set.

The product family was previously planned under "Velura" (full app) and "Fundamira Salon" (light app). Names settled to **Wellos** and **Wellos Studio** in April 2026 — see `MISSING-DOCS.md` and the `00-V2-per-build-setup.md` for current canonical references.

## Domain Plan

Two registered domains, both managed in Cloudflare DNS (registrar may stay at the original provider, e.g. Squarespace — only nameservers move).

| Hostname | Points to | Purpose |
|---|---|---|
| `wellos.one` | Vercel marketing site | Full-app marketing root |
| `app.wellos.one` | Vercel | Full Wellos staff/admin app |
| `book.wellos.one` | Vercel | Public booking surface for full-app tenants |
| `api.wellos.one` | Railway | **Shared API** — both products consume this |
| `wellos.studio` | Vercel marketing site | Studio marketing root |
| `app.wellos.studio` | Vercel | Wellos Studio PWA |
| `book.wellos.studio` | Vercel | Public booking surface for Studio tenants (or share `book.wellos.one`, decide at launch) |
| `mail.wellos.one` | Postmark (DKIM only) | Transactional email sending domain — used for both products |

Future vertical-specific surfaces (`medspa.wellos.one`, `fitness.wellos.one`, etc.) follow the same subdomain pattern. Marketing stays at the apex (`wellos.one`, `wellos.studio`); product apps, APIs, booking surfaces, and admin tools live on subdomains.

## Mobile App Plan

Wellos Studio launches as a **PWA**, not a native app — same as full Wellos.

PWA requirements for launch:

- Installable on iPhone and Android from the browser
- App icon, name, theme color, and splash configured via web app manifest
- Mobile-first responsive layout for calendar, booking, CRM, and payments
- Auth sessions (Clerk) survive normal use from the home-screen icon
- Offline-friendly shell for loading states and basic navigation
- Clear install prompt or instructions inside the app
- Push notifications planned but not required for launch — SMS (TextLink) and email (Postmark) are the reliable MVP channels

Native iOS and Android apps are deferred to Phase 3 (Growth), once the PWA proves the workflow.

## Product Scope

**Wellos Studio includes at launch:**

- Calendar for appointments, blocks, reschedules, cancellations, quick book
- Public booking link or embeddable widget
- SMS confirmations, reminders, magic links, cancellation/reschedule messages (TextLink)
- Email confirmations, receipts, reminders, onboarding, staff invites (Postmark)
- CRM: client profiles, contact details, notes, tags, communication preferences, visit history
- Payments: Stripe-first checkout, deposits, receipts, refunds, payment status
- Basic settings: business profile, services, staff, hours, booking policy, notifications, payments

**Wellos Studio does NOT launch with:**

- Classes, memberships, packages, inventory, payroll, marketing campaigns, automations, public API, franchise tools, AI receptionist
- Native mobile apps (PWA only at launch)
- A separate backend or database — it shares with full Wellos

## App Shape (monorepo)

Wellos Studio is its own app surface in the same monorepo as full Wellos. Same `apps/api`, same `packages/*`, two frontend apps:

```text
apps/
  web/           # Full Wellos staff/admin app — app.wellos.one
  studio/        # Wellos Studio PWA — app.wellos.studio
  api/           # Shared Fastify API + BullMQ worker — api.wellos.one (Railway)
  widget/        # Public booking widget (later)
packages/
  shared/        # Shared types, utils, schema
  notifications/ # SmsProvider + EmailProvider interfaces and adapters
  ui/            # Shared React components (later)
prisma/
  schema.prisma
  migrations/
supabase/        # RLS policies, seed data
```

Wellos Studio only renders features enabled for the Studio plan. The backend stores data in the full tenant-aware structure so a Studio tenant can upgrade to full Wellos later **without migration** — it's a feature-flag flip, not a data move.

## Hosting

Same managed-PaaS stack as full Wellos (per `00-V2-per-build-setup.md`):

- **Backend** (`apps/api` + worker): Railway, two services in one project (`api`, `worker`), staging in a separate Railway project
- **Frontends**: Vercel — separate Vercel projects for `apps/web` and `apps/studio`, each with their own custom domain
- **Database**: Supabase Postgres (shared between products), pooler URL for runtime, direct URL for Prisma migrations
- **Cache / queue**: Upstash Redis (shared, BullMQ TCP URL)
- **Auth**: Clerk — single Clerk app handles both products; tenant + product context determined post-auth
- **Payments**: Stripe (Connect Standard for tenant payouts, Terminal for in-person)
- **Email**: Postmark (`mail.wellos.one` sending domain, used for both products' transactional)
- **SMS**: TextLink (3-SIM paid plan, see `textlink-integration-guide.md` once exported)
- **Observability**: Sentry (separate projects for `web`, `studio`, `api`), PostHog, BetterStack uptime
- **DNS**: Cloudflare (registrar may stay at Squarespace; nameservers move to Cloudflare)

The DigitalOcean Droplet path is **deferred to Phase 2** per `00-V2-per-build-setup.md` Appendix A. See `phase2-reference/` for the migration playbook.

## Database Setup

**Postgres 16 via Supabase, with Prisma migrations** under `prisma/migrations/`. The Studio app starts with the same schema as full Wellos — naming and relationships are identical. Every tenant-owned table needs `tenant_id`, timestamps, soft-delete where appropriate, and tenant-scoped indexes. Supabase RLS enforced on every tenant-owned table.

Foundation tables:

- `tenants` — business/account root
- `locations` — single location at Studio launch, multi-location-ready
- `users` — login accounts (mirror of Clerk users, kept in sync via Clerk webhooks)
- `roles` — role definitions
- `role_assignments` — user-to-role mapping
- `feature_flags` — global feature definitions
- `tenant_feature_flags` — per-tenant enabled features and plan limits
- `idempotency_keys` — retry protection for mutating API requests
- `audit_log` — security and business-critical changes

Business setup tables:

- `staff_members`, `services`, `service_staff`, `business_hours`, `staff_schedules`, `resources`

Calendar and booking tables:

- `appointments`, `appointment_services`, `appointment_status_history`, `availability_rules`, `time_blocks`, `booking_settings`, `booking_holds`, `magic_links`

CRM tables:

- `clients`, `client_notes`, `client_tags`, `client_tag_assignments`, `client_communication_preferences`, `client_activity`

Notification tables:

- `notification_templates`, `message_dispatches`, `message_deliveries`, `notification_preferences`

Payments tables:

- `payment_provider_connections`, `payment_intents`, `payments`, `carts`, `cart_items`, `sales`, `refunds`, `ledger_entries`, `payouts`

Event and worker tables:

- `events` — durable domain event log
- `webhook_inbox` — inbound provider webhooks with dedupe
- `job_runs` — worker execution and retry tracking

The raw-SQL `phase2-reference/migrations/002_payments_full.sql` is the v1 reference for the payments schema — it gets ported to Prisma during Epic 5.

## Studio Feature Flags

Seed a Studio plan with these enabled:

- `calendar`
- `public_booking`
- `sms_notifications`
- `email_notifications`
- `client_crm`
- `stripe_payments`
- `basic_reports`
- `single_location_ui`

Seed these disabled until upgrade to full Wellos:

- `classes`, `memberships`, `packages`, `inventory`, `payroll`, `marketing_campaigns`, `automations`, `public_api`, `advanced_forms`, `protected_records`, `multi_location_ui`

## Environment Variables

Wellos Studio uses the **same `.env.example` as full Wellos** (one repo, one shared backend). The Studio frontend only consumes the subset of `NEXT_PUBLIC_*` vars it actually needs.

See `.env.example` at the repo root for the canonical schema. Studio-specific frontend env vars to add when scaffolded:

```text
NEXT_PUBLIC_STUDIO_APP_URL=https://app.wellos.studio
NEXT_PUBLIC_STUDIO_MARKETING_URL=https://wellos.studio
```

## Deployment Pipeline

**Railway + Vercel auto-deploy on push to `main`**. No SSH, no Droplet pull, no Docker registry — that's all Phase 2.

For each PR:

1. Developer pushes a feature branch
2. PR opens — CI runs (`pnpm lint && pnpm typecheck && pnpm test && pnpm prisma migrate diff`)
3. Vercel posts preview URLs for both `apps/web` and `apps/studio`
4. Squash-merge to `main`
5. Railway redeploys `apps/api` (backend + worker)
6. Vercel redeploys both `apps/web` and `apps/studio`
7. `/healthz` on `api.wellos.one` and 200 on both `app.wellos.one` and `app.wellos.studio` verify the deploy

Required GitHub Actions secrets (per `00-V2-per-build-setup.md` §6.1):

- `DATABASE_URL`, `DIRECT_URL` — for the Prisma migration check job
- `RAILWAY_TOKEN`, `VERCEL_TOKEN` — only if doing imperative CI deploys (auto-deploy mode doesn't need them)
- `SENTRY_AUTH_TOKEN` — for source map upload
- Test-mode keys for Stripe / Postmark (Sandbox Server) / TextLink — only if CI tests exercise them

## Build Order

### Phase 1: Foundations (covered by `00-V2-per-build-setup.md` §§1–7)

- Accounts created, password manager populated
- Local toolchain installed (Node 20, pnpm 10, Docker, railway CLI, vercel CLI, supabase CLI)
- Repo created on `wellosapp/wellos-one`, branch protection (when GitHub Pro enabled)
- Supabase / Upstash / Railway / Vercel / Clerk / Stripe / Postmark / TextLink wired and smoke-tested
- DNS configured in Cloudflare for both `wellos.one` and `wellos.studio`, Postmark DKIM verified, TLS issued automatically by Vercel/Railway
- GitHub Actions CI green, hello-world deploy verified end-to-end
- Sentry / PostHog / BetterStack receiving events

### Phase 2: Repo Scaffold

- Scaffold pnpm workspace, add `apps/web`, `apps/studio`, `apps/api`, `packages/shared`, `packages/notifications`
- Add Prisma schema and first foundation migration
- Add Fastify app with `/healthz` route
- Add PWA manifest, icons, install instructions to `apps/studio`
- Add CI workflow for lint/typecheck/test/migrate-diff

### Phase 3: Auth and Business Onboarding

- Wire Clerk into both frontends
- Build business onboarding (tenant, location, owner user, staff, services, hours, booking settings)
- Seed Studio feature flag plan
- Tenant + product context resolution from Clerk JWT

### Phase 4: Calendar and Booking

- Calendar day/week view in `apps/studio`
- Quick book flow
- Public booking link surface
- Appointment create / reschedule / cancel / block
- Booking holds + idempotency
- DB-level no-double-booking constraint

### Phase 5: CRM

- Client list and profile
- Notes, tags, communication preferences, visit history
- Booking flow → client matching/creation

### Phase 6: Notifications

- Appointment domain events
- SMS worker via TextLink (BullMQ on Upstash)
- Email worker via Postmark (BullMQ on Upstash)
- Reminder schedules
- Magic links for cancel/reschedule
- Track dispatch + delivery state, surface in UI

### Phase 7: Payments

- Stripe Connect onboarding
- Deposits and PaymentIntents
- Webhook handling + dedupe (signature verification first)
- Receipts, refunds, basic revenue summary
- Square BYO adapter after Stripe is stable

### Phase 8: Launch Hardening

- Tenant isolation tests (RLS + application-level)
- Role-gating tests
- DST and timezone tests
- Payment webhook tests
- Notification retry tests
- PWA install testing on iPhone Safari, Android Chrome, desktop Chrome
- Sentry + PostHog dashboards reviewed
- Backup/restore runbook documented (Supabase point-in-time recovery)
- Launch Wellos Studio to first beta users

## First Tickets

Start with these tickets before building UI (assumes Phase 1 of `00-V2-per-build-setup.md` is fully green):

1. Scaffold pnpm monorepo and app shells (`apps/api`, `apps/web`, `apps/studio`)
2. Add Prisma schema for foundation tables, run first migration on Supabase staging
3. Add Fastify API with `/healthz` route, deploy to Railway staging, verify
4. Add Next.js shells for `apps/web` and `apps/studio`, deploy both to Vercel staging, verify
5. Wire Clerk into both frontends — sign-in / sign-out flow working
6. Add CI workflow (lint / typecheck / test / migrate-diff)
7. Seed Studio feature flag plan (DB seed + tenant assignment helper)
8. Build auth/session foundation (server-side session validation, role lookup)
9. Build business onboarding (tenant + location + owner user creation)
10. Add PWA manifest, icons, installable shell to `apps/studio`

## Acceptance Criteria

Wellos Studio is ready to start feature development when:

- Supabase prod + staging projects exist, RLS enabled, foundation migration applied
- Upstash Redis (BullMQ TCP) reachable from Railway
- Railway prod + staging projects deploying `apps/api` + worker on push to `main`
- Vercel prod + staging projects deploying both `apps/web` and `apps/studio`
- Both `wellos.one` and `wellos.studio` resolve in Cloudflare with TLS issued automatically
- `app.wellos.one` and `app.wellos.studio` both render a logged-out landing route and a logged-in empty dashboard
- `api.wellos.one/healthz` returns `{ ok: true }`
- Wellos Studio PWA installs cleanly to a phone home screen
- Clerk sign-in/sign-out works on both frontends
- Postmark `mail.wellos.one` DKIM verified, test transactional email lands in inbox
- TextLink test SMS sends successfully through one of the 3 SIMs
- Sentry receives a deliberate test error from each of `web`, `studio`, `api`
- All secrets stored in password manager + Railway env + Vercel env (per the §8.9 five-place sync rule)
- No production data depends on local files anywhere
