# CLAUDE.md — Wellos Project Conventions

This file is the standing order sheet for Claude Code working in this repo. It merges the workflow rules from `00-V2-per-build-setup.md` §3.4 with a skill-routing layer so the right installed skills fire automatically for each type of work.

**Read this file in full at the start of every session.**

---

## 1. What we're building

**Product family:** there are two products under the Wellos brand, sharing one backend, one database, one event bus, one tenant model:

| Product | Public domain | What it is |
|---|---|---|
| **Wellos** | `wellos.one` | Full multi-vertical platform (salon, massage, medspa, fitness/studio, personal training). The Mindbody / Vagaro / GlossGenius rebuild. |
| **Wellos Studio** | `wellos.studio` | Lighter PWA for solo practitioners and small studios — calendar, booking, SMS, email, CRM, payments. Same backend, simplified UI, gated feature set. See `docs/wellos-studio-start-plan.md`. |

**Category:** Multi-vertical booking + scheduling + payments + CRM SaaS
**Verticals at launch:** salon, massage, medspa, fitness/studio, personal training

> **Naming history:** the project iterated through "Velura" (full app codename) and "Fundamira Salon" (light app) before settling on Wellos / Wellos Studio in April 2026. Spec docs (`04-booking-flow.md`, `05-`, `10-`, `11-`, `12-`, `006-booking-design-refresh.md`) still contain legacy references to scrub during a later content pass — when reading them, mentally substitute Velura → Wellos and Fundamira → Wellos Studio.

---

## 2. Where the specs live

**Target state** (after `00-V2-per-build-setup.md` §3.2 is executed): specs live at `docs/` inside this repo.
**Current state** (pre-build phase): specs live one level up at `../`. Use the `../` paths until the setup step that moves them into `docs/` is done.

| Doc | Purpose |
|---|---|
| `00-V2-per-build-setup.md` | **CANONICAL** setup checklist + daily workflow (READ FIRST) |
| `00-pre-build-setup.md` | **SUPERSEDED** by v2 — kept only as historical reference for the v1 DigitalOcean path |
| `mindbody-rebuild-master-spec.md` | Master engineering spec — source of truth |
| `technical-build-spec.md` | What we're building (companion to master spec) |
| `09-dev-handoff.md` | Epic + ticket sequencing, accounts roster, env var canonical list |
| `01-design-system.md` + `10-design-system-buildout.md` | Design tokens, typography, components |
| `02-onboarding-flow.md` + `11-onboarding-buildout.md` | Onboarding UX |
| `03-dashboard-today-view.md` + `12-dashboard-buildout.md` | Dashboard UX |
| `04-booking-flow.md` + `04-booking-flow-context.md` + `05-booking-enhancements.md` + `006-booking-design-refresh.md` | Booking engine |
| `textlink-integration-guide.md` + `textlink-api-reference.md` | SMS architecture details |
| `002_payments_full.sql` | Payments schema (port to Prisma migration) |
| `digitalocean-droplets.md` + `digitalocean-api.md` + `push-to-production.md` | **Phase 2 reference only** — DO migration target |

### Before you write code (mandatory)

1. Read `mindbody-rebuild-master-spec.md` PART 11 (stack) and the specific PART relevant to the ticket.
2. Read `09-dev-handoff.md` to know which epic the ticket belongs to and pull env var names from the consolidated reference.
3. Read the feature-specific buildout doc (e.g. `11-onboarding-buildout.md` for an onboarding ticket).
4. **Confirm with the human the file(s) you plan to touch before editing.**

When a spec is ambiguous, fire the `clarify` skill and ask. Do not silently pick a direction.

When `mindbody-rebuild-master-spec.md` references the v1 stack (Drizzle / Lucia / Resend / DigitalOcean as primary), defer to v2 (`00-V2-per-build-setup.md`) — v2 is newer and supersedes the v1 stack choices for MVP.

---

## 3. Stack (authoritative — do not substitute without asking)

**MVP path is managed PaaS. The DigitalOcean Droplet path is Phase 2 (Appendix A of `00-V2-per-build-setup.md`).**

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript on Node.js 20 LTS | strict mode, no `any` without a comment explaining why |
| Package manager | **pnpm 10.x** | not npm, not yarn. Pin via `packageManager` field in `package.json` once Epic 1 scaffolds the workspace. |
| Backend HTTP | **Fastify** | not Express, not NestJS |
| DB | **Postgres 16 via Supabase** | use the **pooler** URL (port 6543) for runtime, **direct** URL (port 5432) for Prisma migrations only |
| ORM | **Prisma** | (v1 spec referenced Drizzle — v2 wins; flag if unsure) |
| Cache / queue | **Upstash Redis** + BullMQ | BullMQ needs the **TCP** Redis URL, not the REST URL |
| Auth | **Clerk** (admin, staff, manager roles) | client users get magic links per Epic 4 — they don't authenticate via Clerk in MVP |
| Email | **Postmark** | using existing Clarity Labs USA paid account, dedicated `MedSpa Platform - Production` Server |
| SMS | **TextLink** | 3-SIM paid plan, see `textlink-integration-guide.md` for SIM allocation |
| Payments | Multi-provider: **Stripe + Square** in MVP | Stripe Connect Standard is the platform default; Stripe Terminal for in-person |
| File storage | **Supabase Storage** | private `tenant-uploads` bucket, signed URL access |
| Frontend web | **Next.js 14 App Router + React + Tailwind + shadcn/ui** | (master spec references v15 — v2 setup says v14; flag if unsure before bumping) |
| Mobile | **PWA in MVP** — React Native deferred to Growth phase | do NOT build RN in MVP |
| Automations | **n8n** (self-hosted) + internal bridge | |
| Backend hosting | **Railway** (API + BullMQ worker) | two services in one project (API + worker), staging is a separate Railway project |
| Frontend hosting | **Vercel** (Hobby tier in MVP) | one project, custom domain `app.wellos.one`, separate project for staging |
| DNS / registrar | **Cloudflare** | gray-cloud (DNS only) at MVP — orange-cloud proxying interferes with Vercel/Railway TLS provisioning |
| Monorepo | pnpm workspaces | |
| Error tracking | **Sentry** | separate projects for `web` and `api`, source maps uploaded at deploy |
| Analytics | **PostHog** | free tier, key events per `09-dev-handoff.md` |
| Uptime | **BetterStack** or **Uptime Robot** | monitors on `app`, `api/healthz`, Postmark + TextLink webhook endpoints |
| CI | **GitHub Actions** | lint / typecheck / test / Prisma migrate diff |
| Deploys | **Railway + Vercel auto-deploy on push to `main`** | no `deploy.yml` in MVP — Railway and Vercel watch the repo |

### Repo structure (target — v2 §3.2)

```
/
├── apps/
│   ├── web/                  # Full Wellos staff/admin app — Next.js 14 → Vercel → app.wellos.one
│   ├── studio/               # Wellos Studio PWA — Next.js 14 → Vercel → app.wellos.studio
│   └── api/                  # Fastify + BullMQ worker — Railway → api.wellos.one (shared by both products)
├── packages/
│   ├── shared/               # Shared types, utils, schema
│   └── notifications/        # SmsProvider + EmailProvider interfaces and adapters
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── supabase/                 # Supabase CLI artifacts (RLS policies, seed)
├── .github/workflows/
│   └── ci.yml                # lint + typecheck + test + prisma migrate diff
├── docs/                     # All specs (after §3.2 move)
├── .env.example
├── .gitignore
├── CLAUDE.md                 # this file
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
└── README.md
```

> **Phase 2 only:** the `infra/`, `docker/`, raw SQL `migrations/` directories from the v1 scaffold are kept for reference but are NOT the active build path. They become the playbook when DigitalOcean migration triggers fire (Railway compute > $80/mo sustained, or compliance / networking constraints — see v2 Appendix A).

---

## 4. Hard rules (from `00-V2-per-build-setup.md` §3.4)

1. **Never commit `.env` files or secrets.** The only env file committed is `.env.example` with empty placeholders.
2. **Never push directly to `main`.** Always work on a `feature/*` branch and open a PR.
3. **Never run destructive commands** (`rm -rf`, `DROP TABLE`, force push, `git reset --hard` on `main`) without the human confirming.
4. **Use pnpm 10, not npm or yarn.**
5. **TypeScript strict mode is on. No `any` without a comment explaining why.**
6. **New database columns require a Prisma migration in `/prisma/migrations`.** Never edit existing tables without a migration. Migrations are additive (expand, not contract).
7. **Multi-tenant from day one** — every query scoped by `tenant_id`. Supabase RLS enabled on all tables. Never write a query that trusts a single-tenant assumption.
8. **Idempotency is non-negotiable** on every mutating API — `idempotency_key` header on public endpoints (master spec §1.2).
9. **Feature flags everywhere** — vertical-specific behavior is gated by per-tenant flags, not code branches.
10. **Events for everything** — every domain mutation emits an event via the shared bus. Reporting, notifications, webhooks all consume from the bus.
11. **Design tokens only** — no hex codes or magic spacing numbers in components. Reference tokens from `10-design-system-buildout.md` §2.
12. **Provider SDK calls (Stripe, Postmark, TextLink, Clerk) live behind interfaces** in `packages/notifications` or `apps/api/src/integrations`. Do not inline SDK calls in business logic.
13. **Webhook handlers must verify provider signatures before doing anything else.** Stripe, Clerk, TextLink use HMAC; Postmark uses Basic Auth on webhook calls (we set the user/pass).
14. **Ask before substituting any stack choice in §3.** Those choices are intentional.

---

## 5. Design direction

One sentence: **warm professional — not clinical, not techy, not corporate**. Subtle shadows over heavy ones. Warm off-white over cold grey. Sage accent over corporate blue. "Looks like a well-run boutique business," not "SaaS dashboard."

All color / spacing / radius / shadow values reference CSS custom-property tokens defined in `10-design-system-buildout.md` §2.

---

## 6. Daily workflow (from `00-V2-per-build-setup.md` §8)

### 6.1 Starting a ticket

```bash
git checkout main && git pull origin main
git checkout -b feature/O-3-business-profile-setup   # one ticket, one branch
```

Then **before writing code**, Claude must:
1. State the ticket ID and which epic it belongs to.
2. List the spec docs it will read (from §2 above).
3. Fire the applicable skills from §8.
4. Confirm the file list to touch with the human.
5. For non-trivial tickets, enter plan mode and draft a plan first.

### 6.2 While working

- Commit in small meaningful increments.
- Conventional commit format: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- One concern per commit.
- Reference the ticket in the body: `Refs: O-3`.
- Before every push: `pnpm test && pnpm lint && pnpm typecheck` must be green.
- Push at the end of each session so work isn't stuck on one laptop.
- Vercel posts a Preview URL on every PR — use it to verify UI changes before requesting review.
- **Read every diff Claude Code generates. Every line.** The human is accountable for what ships.

### 6.3 Opening a PR

```bash
gh pr create \
  --title "feat(onboarding): business profile setup (O-3)" \
  --body "Closes O-3. See docs/09-dev-handoff.md Epic 2."
```

PR body must include: ticket reference (`Closes O-X` / `Refs O-X`), one-paragraph description, screenshots if UI changed (Vercel Preview link is fine), migration notes if schema changed (Prisma migration filename), follow-up tickets discovered.

### 6.4 Merging

- **Squash and merge.** One PR = one commit on `main`.
- Delete the feature branch after merge.
- Railway + Vercel auto-deploy on push to `main`. Watch Railway's deploy log and Vercel's deployment dashboard until both go green.
- Hit `https://app.wellos.one` and `https://api.wellos.one/healthz` after deploy — both 200 means production is live on the new version.

### 6.5 When things fail

- **Never force-merge a red PR.** Fix CI, don't bypass it.
- Flaky test → fix the test, don't retry.
- Bad deploy → **forward-fix via revert commit**. Never `git reset --hard` on `main`. Don't edit code through the Railway/Vercel dashboards.
- Both Railway and Vercel let you roll back to a previous deploy from their UI — use that as a stop-gap while preparing the revert PR.

### 6.6 The `.env` sync rule (§8.9) — enforce all five places

When adding a new env var, update all five or the next pull breaks someone:
1. `.env.example` placeholder (in the same commit)
2. Password manager (real value)
3. GitHub Actions secrets (if needed at build/test time)
4. **Railway** env (backend runtime) — both production and staging projects
5. **Vercel** env (frontend runtime) — both production and staging projects (or staging environment within one project)

Note it in the PR body.

---

## 7. How to talk to Claude on this project

- Tell Claude which doc(s) to read first before coding (e.g. "Read `docs/09-dev-handoff.md` Epic 2 and `docs/02-onboarding-flow.md`, then implement O-3").
- **Scope tightly** — one ticket at a time, never "build the whole dashboard."
- **Review every diff before committing.** Claude does not commit on its own — the human clicks the button.
- When Claude is stuck, give it **more context** (logs, error text, exact file to look at), not more pressure.
- If blocked on missing context, Claude asks **one specific question**. No guessing.

---

## 8. Skill routing — which installed skills fire for which work

Skills auto-trigger on description match. For overlap cases, this section is the tiebreaker. At the start of a task Claude should **name the skills it's loading out loud** so the human can correct the selection.

### 8.1 Always-on methodology (apply to most tasks)

- **`clarify`** — whenever a request is ambiguous; fire before writing code.
- **`systematic-debugging`** — all debugging work.
- **`requesting-code-review`** — before calling a substantial change "done."
- **`dispatching-parallel-agents`** — when exploring scope across multiple subsystems.
- **`improve-codebase-architecture`** — when a change reveals structural debt worth fixing alongside.
- **`software-architecture`** — for new modules or cross-module decisions.

### 8.2 Frontend (Next.js 14 App Router · React · Tailwind · shadcn/ui · deployed to Vercel)

Primary:
- **`nextjs-app-router-patterns`** — default for routing / server-components / data-fetching.
- **`nextjs-react-typescript`** — TS ergonomics inside Next.js.
- **`vercel-react-best-practices`** — Vercel-specific perf patterns. **Now in scope** since we're on Vercel for MVP.
- **`typescript-advanced-types`** — when types get hard (generics, conditional types, inference).
- **`tailwind-design-system`** — when building or extending the token system.
- **`tailwind-css-patterns`** — everyday utility-class patterns.
- **`tailwindcss`** (hairyf) — secondary reference; prefer the two above first.

Vercel ops (now in scope):
- **`vercel:deploy`** — deploy actions.
- **`vercel:setup`** — initial Vercel CLI / project linking.
- **`vercel:logs`** — deployment log inspection.
- **`deploy-to-vercel`** — generic deploy guidance.

Design polish (load when the ticket is visual / UX):
- **`frontend-design`** — general design direction.
- **`interface-design`** — UI composition + hierarchy.
- **`design-taste-frontend`** / **`high-end-visual-design`** — refining from "works" to "feels premium."
- **`make-interfaces-feel-better`** — micro-interactions, motion, feel.
- **`emil-design-eng`** — design-engineering polish.
- **`landing-page-design`** — marketing / landing surfaces only.
- **`ux-designer`** — flows + information architecture.
- **`liquid-glass-design`** — ONLY if we explicitly want glass/translucent. **Wellos default is warm matte — do not apply by default.**

Skip in MVP (defer to Growth):
- ~~`building-native-ui`~~, ~~`react-native-best-practices`~~, ~~`react-native-design`~~, ~~`sleek-design-mobile-apps`~~, ~~`vercel-react-native-skills`~~ — PWA-only in MVP.
- ~~`nuxt-ui`~~ — wrong framework (Vue).

### 8.3 Backend (Fastify · Prisma · Supabase Postgres · Upstash Redis/BullMQ · deployed to Railway)

Primary:
- **`api-design-principles`** — default for endpoint design.
- **`api-design`** — secondary API reference.
- **`api-and-interface-design`** — when designing internal module boundaries + their public surface together.
- **`fullstack-guardian`** — cross-cutting concerns (auth, validation, consistency).

Database / Supabase (now in scope as our managed Postgres + Storage + RLS):
- **`supabase`** — **now primary**. Supabase Postgres, Storage, RLS, SSR client integration. (Note: we are NOT using Supabase Auth — Clerk handles auth. Ignore Supabase Auth advice.)
- **`supabase-postgres-best-practices`** — Postgres patterns, RLS, indexing, JSONB.
- **`database-schema-designer`** — new tables, migrations, relationships.
- **`sql-optimization-patterns`** — query tuning, index selection.
- **`sql-code-review`** — before shipping migrations or complex queries.

Skip:
- ~~`nestjs-expert`~~ — we use Fastify.
- ~~`rails-expert`~~, ~~`java-architect`~~ — wrong stack.
- ~~`creating-oracle-to-postgres-migration-bug-report`~~ — not relevant.

### 8.4 Automations (n8n)

- **`n8n-node-configuration`** — wiring an n8n flow / adding a node.
- **`n8n-code-javascript`** — Code node in JS.
- **`n8n-code-python`** — Code node in Python.

Use whenever work touches the `automations` module or the n8n bridge.

### 8.5 SEO / marketing

- **`schema-markup`** — SEO structured data on public booking surface or marketing pages. Not MVP-critical; apply when explicitly requested.

### 8.6 Diagrams

- **`pretty-mermaid`** — nice mermaid diagrams for architecture explanations. Only invoke if a diagram is explicitly requested.

### 8.7 Cross-session memory (optional)

- **`remembering-conversations`** — persists context between sessions. Off by default; enable when the human asks.

---

## 9. Troubleshooting quick reference (from `00-V2-per-build-setup.md` §10)

| Symptom | First thing to check |
|---|---|
| Railway build fails | Check the build log — most often a missing env var or a wrong `package.json` entry. Railway expects either `npm start` or a `railway.json` config. |
| Railway service crashes on boot | Check service logs. Most common: bad `DATABASE_URL` (using direct URL instead of pooler), missing required env var. |
| Vercel build fails | Check build log. Most often: a server-only env var (no `NEXT_PUBLIC_` prefix) referenced in a client component. |
| Vercel deployed but page shows "Application error" | Check Vercel runtime logs (Functions tab). Usually a runtime env var is missing. |
| Supabase connection times out from Railway | Confirm Railway is using the **pooler** connection string (port 6543), not direct (5432). |
| Prisma migration fails with "prepared statement already exists" | You're using the pooler URL for migrations — switch to `DIRECT_URL` for `prisma migrate`, keep `DATABASE_URL` (pooler) for runtime. |
| Clerk webhook doesn't fire | Verify the webhook URL is the `https://api.wellos.one/...` form, not the Railway-default `*.up.railway.app` URL (Clerk requires a stable domain). |
| Stripe webhook signature verification fails | Wrong `STRIPE_WEBHOOK_SECRET` — there's a separate one per webhook endpoint, and a separate one per env (test vs live). |
| Postmark email goes to spam | DKIM probably failed to verify. Run `dig TXT _domainkey.wellos.one` and confirm Postmark sees it as verified. |
| Postmark webhook fires but handler 401s | Postmark uses Basic Auth on webhooks. Set the user/pass in Postmark's webhook config and on your handler. |
| TextLink message stuck in queue | One of the 3 SIMs is offline. Check Devices Console; physical phone may be off Wi-Fi or low battery. |
| TextLink inbound webhook missing STOP message | Confirm "Received Message" webhook is configured in TextLink — separate from "Sent" and "Failed". |
| BullMQ jobs not running | Check Railway worker service logs. Most often: worker service not started, or `REDIS_URL` is the REST URL when BullMQ needs the TCP URL. |
| Local `pnpm dev` can't connect to anything | Run `cp .env.example .env` and fill in from password manager. |

For anything else: check Sentry, then Railway/Vercel logs, then ask Claude with the exact error text.

---

## 10. Session-start checklist for Claude

At the start of every task, in this order:

1. **Read `CLAUDE.md`** (this file).
2. **Identify the ticket ID** (e.g. O-3) and the epic it belongs to from `09-dev-handoff.md`.
3. **Name the spec docs** I'm about to read (master spec PART X + the relevant buildout doc).
4. **Name the skills** I'm loading for this task (from §8) — out loud.
5. **Run `clarify`** if any requirement is ambiguous.
6. **Draft a plan** in plan mode for non-trivial tickets — confirm files to touch with the human before editing.
7. **Write code**, running `pnpm test && pnpm lint && pnpm typecheck` locally before declaring anything done.
8. **Run `requesting-code-review`** before opening a PR.
9. **Do NOT commit or open the PR** — the human does that.
