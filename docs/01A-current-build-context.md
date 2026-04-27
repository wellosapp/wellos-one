# 01A — Current Build Context & Recommendations

**Project:** Wellos / Wellos Studio  
**Date:** April 26, 2026  
**Purpose:** This document translates the current live infrastructure into a practical build guide for the next phase of work. It is meant to be the fastest way for a developer or coding AI to understand what already exists, what is intentionally deferred, what must not be changed casually, and what should be built next.

---

## 1. What This Doc Is For

`INFRASTRUCTURE.md` is the source of truth for what is live right now. This file explains how to build from the current state without assuming deferred systems are already complete.

Use this file when:
- starting a new development session
- giving the project to a coding AI
- onboarding a future developer
- deciding what to build next
- checking whether a provider integration is actually ready or only planned

If there is a conflict between this file and `INFRASTRUCTURE.md` about what is live, trust `INFRASTRUCTURE.md` and update this file in the same commit.

---

## 2. Current Reality Snapshot

As of this document, the MVP infrastructure foundation is in place but product functionality is mostly not built yet.

### 2.1 Live surfaces

| Surface | URL | Current state |
|---|---|---|
| API | `https://api.wellos.one/healthz` | Live on Railway, health check only |
| Main app | `https://app.wellos.one` | Live on Vercel, hello-world page |
| Studio app | `https://app.wellos.studio` | Live on Vercel, hello-world page + PWA manifest |

### 2.2 Live hosting stack

| Layer | Current platform | Notes |
|---|---|---|
| API | Railway | Auto-deploy on push to `main` |
| Frontend | Vercel | Separate projects for `apps/web` and `apps/studio` |
| Database | Supabase Postgres | Runtime uses pooler; Prisma migrations use session pooler |
| File storage | Supabase Storage | Planned for uploads; bucket strategy not fully exercised yet |
| Redis / queues | Upstash | TCP Redis URL exists; BullMQ worker not deployed yet |
| DNS | Cloudflare | DNS-only gray-cloud for Vercel/Railway/Postmark records |
| Email | Postmark | Production server exists; sending domain verified; webhooks deferred |
| Auth | Clerk | App exists in development environment; webhook deferred |
| Payments | Stripe | Deferred |
| SMS | TextLink | Deferred |
| Observability | Sentry/PostHog/BetterStack | **Live and verified end-to-end (2026-04-27)** |

---

## 3. What Is Actually Ready Right Now

### Ready now

- Monorepo structure exists
- CI workflow exists
- Railway deploy for API exists
- Vercel deploys for `apps/web` and `apps/studio` exist
- Custom domains are live
- Supabase project exists
- Upstash Redis exists
- Clerk application exists
- Postmark production server exists
- `.env.example` schema exists
- Health endpoint is already live

### Ready but only partially exercised

- Supabase runtime connection
- Prisma migration flow
- Supabase Storage access pattern
- Clerk auth flow inside app code
- Postmark send flow inside app code
- Redis queue flow in running product logic

Treat these as infrastructure ready, implementation not proven.

---

## 4. What Is Intentionally Deferred

These are not missing by accident. They are intentionally postponed.

- Stripe account, Connect, Terminal, webhooks
- TextLink API key, SIM routing, webhooks
- Clerk webhook + DB sync
- Postmark webhooks
- BullMQ worker Railway service
- Staging parity across all services
- Sentry, PostHog, BetterStack
- Branch protection on `main`

Deferred does not mean optional forever. It means do not fake completeness before the matching epic.

---

## 5. Hard Rules for Future Sessions

- Do not assume Stripe is wired
- Do not assume TextLink is wired
- Do not assume Clerk webhook sync is live
- Do not assume Postmark webhooks are live
- Do not assume BullMQ worker is deployed
- Do not assume staging exists
- Do not rename env vars unless docs and dashboards are updated too
- Do not re-litigate the stack in the middle of feature work
- Webhook handlers must verify provider authenticity first

---

## 6. Recommended Next Build Order

### Immediate next infra tasks

All immediate infra tasks completed:
1. ~~Set up Sentry for API and web~~ — verified end-to-end 2026-04-27 (test errors captured in all 3 projects with un-minified stack traces)
2. ~~Set up PostHog in the web app~~ — verified 2026-04-27 (pageviews, pageleave, web vitals, autocapture all flowing for both Next apps)
3. ~~Set up BetterStack or Uptime Robot~~ — 3 monitors green, 3-min interval (free-tier)
4. ~~Fix the Git/Vercel identity mismatch~~ — done 2026-04-26
5. ~~Rename the Railway auto-generated project~~ — DEFERRED (still `diligent-achievement`; cosmetic only)

**Small follow-ups noted but not yet done** (none blocking Epic 1):
- Resolve/delete 3 misrouted events in `wellos-api` Sentry (from initial DSN paste mistake)
- Fix `apple-mobile-web-app-capable` deprecation warning in `apps/studio/app/layout.tsx`
- Add favicon to both Next apps
- Investigate "11 issues" badge in Chrome DevTools console on app.wellos.one (likely benign init logs)
- Rename Railway project `diligent-achievement` → `wellos-prod`

### Then start Epic 1

After the immediate infra cleanup, start Epic 1 in this order:
1. Finalize repo conventions and package boundaries
2. Install Prisma client and land first migration
3. Create foundational tables for users, tenants, roles, and auth mappings
4. Wire Clerk into app code
5. Create backend auth middleware
6. Add role-based route guards
7. Implement Clerk webhook endpoint
8. Generate and store `CLERK_WEBHOOK_SECRET`
9. Add seed/admin bootstrap path
10. Confirm fresh clone and real login work end-to-end

### Then continue

After Epic 1 is stable:
- Epic 2: client/staff/service schema + CRUD
- Epic 3: booking engine
- Epic 4: login-free booking + magic links
- Epic 5: intake forms
- Epic 6: Stripe
- Epic 8: notifications / BullMQ / TextLink / Postmark webhooks

---

## 7. What Is Safe to Build Right Now

Safe now:
- app shell and layout structure
- shared TypeScript config cleanup
- API module folder structure
- Prisma schema foundation
- first migration
- tenant/user/role data model
- Clerk auth UI and protected routes
- role-based API middleware
- basic admin landing pages
- standard API response shape and error utilities
- health/readiness endpoints
- initial design system bootstrap

Not safe yet without prep:
- payment flows
- Stripe Connect onboarding
- TextLink messaging
- notification scheduling jobs in production
- Postmark bounce/complaint processing
- full staging automation

---

## 8. Session Start Prompt for Claude Code

Use this prompt style every session:

> Read `docs/INFRASTRUCTURE.md`, then `docs/00A-claude-session-start-guide.md`, then `docs/01A-current-build-context.md`, then the relevant section of `docs/09-dev-handoff.md`. Confirm what is already live, what is deferred, what step we are on, and which files you plan to edit before making changes.

---

## 9. Short Version

- infrastructure foundation is real
- product logic is mostly still ahead
- observability should be added next
- Epic 1 is the first major build target
- Stripe, TextLink, worker deployment, and full staging stay deferred until their phase
