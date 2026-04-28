# Session handoff — Wellos / Wellos Studio (2026-04-28 → next)

Continuing the Wellos build. **8 PRs merged this session** (#10 through #16, plus the bootstrap admin run against prod). Epic 1 is 7 of 9 sub-steps shipped — auth pipeline is fully live end-to-end on production.

---

## Session-start ritual (do this FIRST, before anything else)

Per `docs/000-CLAUDE-session-start-snippet.md`:

1. Read `docs/INFRASTRUCTURE.md` — current state of every service
2. Read `docs/01A-current-build-context.md` — what's safe to build, what's deferred, hard rules
3. Read the Epic 1 section of `docs/09-dev-handoff.md` — sub-step descriptions
4. Read `CLAUDE.md` — agent conventions, skill routing, hard rules
5. Memory files load automatically — trust them. Especially:
   - `MEMORY.md` (index, always loaded)
   - `deployed_surface.md` — current production state, just updated end of this session
   - `project_pre_launch_sweep.md` — running list of items to clean up before launch (rotated credentials, dual Clerk apps, Clerk widget styling, etc.)
   - `feedback_offer_to_push.md` — for commit/push, ask "want me to push or do you want to?" instead of defaulting to "you do it"
   - `feedback_secrets_rotation_pre_launch.md` — track leaked dev creds in pre-launch sweep, don't pause to rotate mid-flow
6. Summarize state, confirm files-to-edit before changing anything

Local path: `H:\OneDrive\OneDrive - Evo Tech\Apps\WellOs\wellos-one`. Repo: `wellosapp/wellos-one`. Main is at `ce2c941` after PR #16.

---

## What we shipped this session

| PR | Sub-step | Title |
|---|---|---|
| #10 | E1-S2 + S3 | feat(db): foundation tables + Studio feature-flag seed |
| #11 | E1-S4 | feat(auth): wire Clerk into web + studio Next.js apps |
| #12 | E1-S5 | feat(auth): Fastify Clerk JWT verification + /me + CORS |
| #13 | E1-S7 | feat(auth): Clerk webhook + users DB sync, /me extended |
| #14 | E1-S7 follow-up | fix(api): warm Prisma connection at boot + DB ping in /healthz |
| #15 | E1-S8 | feat(admin): bootstrap-admin CLI to claim first orphan as admin |
| #16 | E1-S8 follow-up | fix(scripts): use DIRECT_URL for one-off scripts |

After #15, ran the bootstrap script against prod DB:
- Created Tenant `Wellos` (slug `wellos`)
- Created Location `Wellos`
- Claimed `johnathan.carlson@me.com` as admin
- 4 audit_log entries written

**Verified end-to-end on production:** real signups via `app.wellos.one` flow through Clerk → webhook → svix HMAC verify → `/webhooks/clerk` handler → upsert into `users` table → audit log entry. `/me` returns the full DB user record. The bootstrap admin claim was confirmed via SQL.

---

## What's deferred (do NOT assume wired)

Per `docs/01A-current-build-context.md` §4 hard rules:
- Stripe (Epic 6)
- TextLink (Epic 8)
- Postmark webhooks (Epic 8)
- BullMQ worker on Railway (Epic 8)
- Staging environments (mirror prod later)
- Branch protection on `main` (deferred — GitHub Pro $4/mo)

Active items in the **pre-launch sweep tracker** (`project_pre_launch_sweep.md`):
- Supabase DB password rotation (was visible in chat early in this session — solo dev, deferred)
- TWO Clerk apps exist (`wellos-web` + `wellos-studio`) — should be ONE per `INFRASTRUCTURE.md` §3.6. Workaround: webhook created on both. Consolidate before launch.
- Clerk app display name still says "wellos-web" (visible in sign-in widget on both apps)
- Clerk widget shows Apple/Facebook/Google + phone — should be email-only per §3.6 (drift)
- Clerk verification emails come from Clerk's default sender, not `mail.wellos.one` Postmark domain
- Clerk widget styling needs design system pass (no `appearance` prop set yet)
- Clerk dev keys (`pk_test_*`) require dev-browser-cookie bootstrap — flip to `pk_live_*` at Epic 11
- Repo lives under OneDrive sync (`H:\OneDrive\...`) — Next.js dev compiles hang. Move to `H:\Projects\wellos-one` whenever convenient.
- `/__test/error` Sentry route + dashboard "Throw error" buttons in hello pages
- 3 misrouted Sentry events in `wellos-api` project (DSN paste mistake from earlier session)
- Railway project still named `diligent-achievement` (rename to `wellos-prod`)
- DMARC `p=quarantine` on wellos.one — tighten to `p=reject` post-MVP
- `apple-mobile-web-app-capable` deprecation warning in apps/studio/app/layout.tsx
- Add favicons to both Next apps
- Investigate "11 issues" badge in DevTools console on app.wellos.one
- `cuid()` v1 plan deviation (Prisma 5.22 limitation; revisit with Prisma 6+)
- `apps/api/.env` is a manual copy of root `.env` (Prisma 5 doesn't walk up). Wrap with dotenv-cli later.
- Prisma CLI installed at workspace root (necessary for project-root binary detection)
- **Webhook reliability**: was flaky (~70% failure on Railway serverless cold-start). Fixed via #14 (warm-up) + #16 (DIRECT_URL for scripts) + Railway DATABASE_URL params. If issues recur, options are documented in tracker.

---

## What's NEXT — Epic 1 sub-step 6 (role guards)

**Goal:** gate API routes by checking `role_assignments` for the authenticated Clerk user. Today, `/me` is the only auth-required route and it just returns the user's identity. We need to add role-aware preHandlers so admin-only / staff-only / manager-only routes can be created.

**Likely shape:**
- New middleware `apps/api/src/middleware/requireRole.ts` — preHandler that takes a role name (or array) and checks `role_assignments` for the user via Prisma. 403 if no matching role.
- Probably also a `withTenant()` helper that resolves `request.user.tenantId` from the Clerk userId via the `users` table (cached per request).
- Add a smoke endpoint like `GET /admin/whoami` (admin-only) that returns full user + tenant + roles. Proves the wire end-to-end.
- Decide: do we use Clerk session claims (custom JWT template) or pure DB lookup? Pure DB is simpler for MVP — every authed request does a `prisma.roleAssignment.findMany()`. Consider caching later.

**Out of scope for sub-step 6** (separate concerns):
- Frontend role-aware UI (`useRole()` hook in apps/web)
- Custom Clerk JWT template with role claims
- RLS policies on Postgres
- Tenant context resolution beyond admin's own tenant

After sub-step 6:
- **Sub-step 9** — manual fresh-clone end-to-end smoke test (clone repo on a different machine, run `pnpm install`, fill `.env`, run `pnpm dev`, sign in, verify everything works)

That closes Epic 1. Then we move to Epic 2 (client/staff/service schema + admin CRUD).

---

## Pending USER tasks (no rush, do anytime)

1. **Edit Johnathan in Clerk dashboard → save** to re-fire `user.updated` webhook. Currently DB has stale `first_name = "John"` from an earlier test edit (Clerk source of truth says "Johnathan"). Saving any field will sync.
2. **Delete John Carson from Clerk** (the second test user with Erica's number) — ONLY after sub-step 6 lands so we've confirmed they're not accidentally an admin somewhere. The `user.deleted` webhook will soft-delete cleanly in our DB.

---

## Stack pins (don't substitute without asking — see CLAUDE.md §3)

- Node 20 LTS · pnpm 10 · TypeScript strict
- Fastify 5.0.0 (api) · Next.js 14 App Router (web, studio)
- **Prisma 5.22.0** (Prisma 6 has a pnpm-10 workspace auto-install bug; Prisma 7 broke schema-based datasource)
- **`@clerk/nextjs` 6.x** (frontend) · **`@clerk/fastify` 1.x** (backend)
- **`svix`** for webhook HMAC verification
- Prisma → Postgres via Supabase (pooler URL port 6543 for `DATABASE_URL` runtime, session pooler port 5432 for `DIRECT_URL` migrations + scripts)
- Upstash Redis (TCP URL for BullMQ when added)
- Postmark (email, sending domain `mail.wellos.one`)
- Sentry · PostHog · BetterStack

---

## Gotchas accumulated this session (won't re-bite if remembered)

- Prisma 5.22 doesn't accept `cuid(2)` syntax — using `cuid()` v1 for now (revisit at Prisma 6 upgrade)
- `prisma migrate dev` requires interactive shell — for non-interactive (CI, agent), use `prisma migrate deploy` after baselining via `prisma migrate resolve --applied <migration-name>`
- `_prisma_migrations` table didn't exist on prod DB initially — baseline via `migrate resolve` before `migrate deploy`
- pnpm script `--` propagation breaks parseArgs in scripts; for any script taking flags, invoke directly: `pnpm --filter @wellos/api exec tsx scripts/foo.ts --flag value` instead of `pnpm --filter @wellos/api foo -- --flag value`
- Clerk's "Send Example" payload has empty `email_addresses` — our handler correctly rejects with "no email"; use a real signup or edit-existing-user to test webhook
- Clerk dev keys (`pk_test_*`) require dev-browser-cookie bootstrap on production custom domains — `app.wellos.one/dashboard` hit via curl returns 404 with `X-Clerk-Auth-Reason: dev-browser-missing`. Real browsers handle this transparently.
- `@fastify/cors` v10 is the Fastify 5 line — don't accidentally install v9
- Sentry must load FIRST in `apps/api/src/index.ts` (`import './instrument.js'` is line 1)
- ESM `.js` extensions required on every relative import (NodeNext)
- TypeScript strict mode + `noUncheckedIndexedAccess` — array access needs guards
- Webhook routes need raw body for HMAC; encapsulated `addContentTypeParser` scoped to `/webhooks/*` only via Fastify `register` context
- Force `export const dynamic = 'force-dynamic'` in both Next app root layouts so ClerkProvider doesn't crash prerender on missing keys

---

## How to start the next chat

Paste this to seed the next session:

> Continuing the Wellos project. Read `docs/SESSION-HANDOFF-2026-04-28.md` then follow `docs/000-CLAUDE-session-start-snippet.md` (read INFRASTRUCTURE.md, 01A, the Epic 1 section of 09-dev-handoff.md, CLAUDE.md). Memory files load automatically — trust them. Then summarize state and propose the plan for Epic 1 sub-step 6 (role guards) in plan mode before editing.

---

## TL;DR for the next session

- Auth pipeline is fully live (frontend + backend + webhook + DB sync + bootstrap admin)
- Johnathan Carlson is admin of Wellos tenant
- Next: sub-step 6 (role guards) — gate API routes by checking `role_assignments`
- Then: sub-step 9 (fresh-clone smoke) — closes Epic 1
- Defer: dual Clerk app cleanup, Postmark for Clerk emails, widget styling, password rotations, Repo move off OneDrive — all tracked in pre-launch sweep
