# Session handoff — Wellos / Wellos Studio (2026-04-28 evening → next)

Continuing the Wellos build. **5 more PRs merged this session** (#18 through #22). Epic 1 is now **8 of 9 sub-steps shipped** with sub-step 9 substantively done in passing. **Repo moved off OneDrive sync to `H:\Projects\wellos-one`** — Next.js dev no longer hangs. A chunk of pre-launch sweep items knocked out.

Supersedes `docs/SESSION-HANDOFF-2026-04-28.md` (which covered the morning-of-2026-04-28 session). Read both if you want full context.

---

## Session-start ritual (do this FIRST, before anything else)

Per `docs/000-CLAUDE-session-start-snippet.md`:

1. Read `docs/INFRASTRUCTURE.md` — current state of every service
2. Read `docs/01A-current-build-context.md` — what's safe to build, what's deferred, hard rules
3. Read **this file** for what shipped on 2026-04-28 evening + the new working location
4. Read `docs/SESSION-HANDOFF-2026-04-28.md` (prior) for what shipped earlier 2026-04-28
5. Read the relevant Epic section of `docs/09-dev-handoff.md` (Epic 2 if starting CRUD work)
6. Read `CLAUDE.md` — agent conventions, skill routing, hard rules
7. Memory files load automatically — trust them. Especially:
   - `MEMORY.md` (index, always loaded)
   - `deployed_surface.md` — current production state (now lists `/me`, `/admin/whoami`, `/webhooks/clerk` as live API surface)
   - `project_pre_launch_sweep.md` — pre-launch tracker (5 rows fewer than yesterday morning, 2 new minor rows added)
   - **`feedback_powershell_cd_prefix.md`** — always lead PowerShell snippets with `cd H:\Projects\wellos-one` (the user opens fresh tabs constantly and they start in `C:\Users\johnn` where pnpm hits a corrupted Remio cache)
   - `feedback_offer_to_push.md`, `feedback_secrets_rotation_pre_launch.md`

**Local path: `H:\Projects\wellos-one`** (moved off OneDrive 2026-04-28 evening). Repo: `wellosapp/wellos-one`. Main at `96ed169` after PR #22.

---

## What we shipped this session

| PR | Sub-step | Title |
|---|---|---|
| #18 | E1-S6 | feat(auth): role-aware route guards + `/admin/whoami` smoke |
| #19 | E1-S9 prep | docs(setup): scripted four-file env scaffold + fresh-clone walkthrough |
| #20 | sweep | fix(studio): mobile-web-app-capable meta tag (silences Chrome deprecation) |
| #21 | sweep | chore(sentry): remove Sentry verification test artifacts (route + buttons) |
| #22 | sweep | chore(ci): bump GitHub Actions to Node 24-ready majors |

**Verified live in production 2026-04-28:** `/admin/whoami` returns `{"error":"Unauthorized","message":"Missing or invalid Clerk session token."}` to unauthenticated curl — the role-guard chain (`loadCurrentUser` → `requireRole('admin')`) works end-to-end against the real Railway-deployed API.

**Repo settings tightened to match CLAUDE.md §6.4:**
- Squash merge: only allowed method
- Merge commits + rebase merges: disabled
- Auto-delete branches on merge: enabled

---

## Repo move from OneDrive → `H:\Projects` (2026-04-28 evening)

Old path was `H:\OneDrive\OneDrive - Evo Tech\Apps\WellOs\wellos-one\`, where Next.js dev compile hung indefinitely on every `.next/` file write because OneDrive intercepted them. Permanent fix: fresh clone to `H:\Projects\wellos-one`.

Verification done from the new location:
- `pnpm install` succeeds in ~1m25s
- `pnpm typecheck` clean across all 4 workspaces (after one Prisma client regenerate — see Gotchas)
- All three dev servers boot; web (3002) and studio (3003) compile cleanly (OneDrive bug confirmed gone)
- API serves `/healthz` → `{"ok":true,"db":"ok"}` (Supabase pooler reachable)

**Old OneDrive copy:** still in place at the time of this writeup; user will delete when comfortable. Don't `git status` against it from this session — different working tree.

---

## What's still deferred (do NOT assume wired)

Hard rules from `docs/01A-current-build-context.md` §4 — same as before:
- Stripe (Epic 6)
- TextLink (Epic 8)
- Postmark webhooks (Epic 8)
- BullMQ worker on Railway (Epic 8)
- Staging environments
- Branch protection on `main`

Active items in **pre-launch sweep tracker** (`project_pre_launch_sweep.md`) — net 3 fewer than yesterday morning (5 removed, 2 added):

**Removed this session** (shipped or already-fixed):
- `apple-mobile-web-app-capable` deprecation → shipped via #20
- `/__test/error` route → removed via #21
- "Throw a test error" buttons on hello pages → removed via #21
- Webhook reliability ~70% failure → already fixed by PRs #14 + #16 (incorrectly tracked)
- GitHub Actions Node 20 deprecation → shipped via #22

**Added this session:**
- **Local-dev `apps/api/.env` is missing `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`** so the Clerk plugin doesn't register on `pnpm --filter @wellos/api dev`. API still serves `/healthz` and unauthenticated routes. Production unaffected. Fix at sweep: copy dev `pk_test_*`/`sk_test_*` from Clerk dashboard into `apps/api/.env` (and root `.env` for parity).
- **`pnpm dev` parallel runner buries `apps/api` Pino logs** — under `pnpm -r --parallel dev` the api's stdout never flushes. Workaround: run api in its own terminal. Not a launch blocker.

Still tracked (unchanged):
- Supabase DB password rotation
- Two Clerk apps (`wellos-web` + `wellos-studio`) → consolidate to one
- Clerk app display name "wellos-web" → rename to "Wellos"
- Clerk widget shows Apple/Facebook/Google + phone (drift from §3.6)
- Clerk verification emails come from default sender, not Postmark
- Clerk widget styling needs design system pass
- Clerk dev keys (`pk_test_*`) still in use — flip to `pk_live_*` at Epic 11
- Repo-level: 3 misrouted Sentry events in `wellos-api` project; Railway project name still `diligent-achievement`; DMARC `p=quarantine`; favicons missing; "11 issues" badge in DevTools to investigate
- Schema: `cuid()` v1 → cuid2 (blocked by Prisma 6+ install issues)
- Local-dev: `apps/api/.env` four-file workaround pending dotenv-cli consolidation; Prisma CLI installed at workspace root

---

## What's NEXT

### Option A — declare Epic 1 done and start Epic 2
**Recommendation.** Sub-step 9's actual purpose (verify a fresh clone bootstraps cleanly) was achieved during the OneDrive move. The "second machine" angle is theater for solo dev. If the user agrees, Epic 1 is closed.

Then: **Epic 2 — clients/staff/services schema + admin CRUD.** Per `docs/09-dev-handoff.md` Epic 2:
- New tables: `Client`, `Staff`, `Service`, `ClientTag` + many-to-many joins
- Soft-delete on all (`deleted_at`) — Prisma middleware to auto-filter `deletedAt IS NULL`
- Admin CRUD endpoints behind `requireRole.admin` (already shipped in #18)
- `(email, phone)` NOT unique at DB level — UI-only duplicate warning
- Staff working hours stored as JSON column for MVP

**Recommended starting point:** plan-mode session — read Epic 2 in `09-dev-handoff.md` PART 11/12, draft the Prisma schema additions, propose file list before writing migrations.

### Option B — second-machine smoke first, then Epic 2
The fresh clone worked on this machine. A genuine second-machine smoke catches "works only because I have global tools / env not in docs" issues. Solo dev value is low; if you have a spare laptop and want belt-and-suspenders, do it.

---

## Pending USER tasks (no rush, do anytime)

1. **Edit Johnathan in Clerk dashboard → save** — re-fires `user.updated` webhook to fix stale `first_name = "John"` (Clerk source of truth says "Johnathan").
2. **Delete John Carson from Clerk** (the second test user with Erica's number) — safe now that sub-step 6 confirmed he's not silently an admin anywhere.
3. **Clerk dashboard cleanup batch** (~15 min):
   - Rename Clerk app `wellos-web` → `Wellos`
   - Disable Apple/Facebook/Google + phone sign-in (drift from §3.6)
   - Decide on the two-Clerk-apps drift (consolidate to one or update §3.6 to admit reality)
4. **Cosmetic, no rush:**
   - Rename Railway project `diligent-achievement` → `wellos-prod`
   - Delete the old OneDrive copy when comfortable

---

## Stack pins (don't substitute without asking — see CLAUDE.md §3)

- Node 20 LTS · pnpm 10 · TypeScript strict
- Fastify 5.0.0 (api) · Next.js 14 App Router (web, studio)
- **Prisma 5.22.0** (Prisma 6 has pnpm-10 workspace auto-install bug; 7 broke schema-based datasource)
- **`@clerk/nextjs` 6.x** (frontend) · **`@clerk/fastify` 1.x** (backend)
- **`svix`** for webhook HMAC verification
- Prisma → Postgres via Supabase (pooler 6543 for runtime `DATABASE_URL`, session pooler 5432 for `DIRECT_URL`)
- Upstash Redis (TCP URL for BullMQ when added)
- Postmark (sending domain `mail.wellos.one`)
- Sentry · PostHog · BetterStack
- GitHub Actions: `actions/checkout@v6`, `actions/setup-node@v6`, `pnpm/action-setup@v5` (post-#22)

---

## Gotchas accumulated this session

- **Prisma client regenerate may need to run twice on a fresh clone** — first via `postinstall`, then manually if typecheck fails with missing `ActorType` / `User` / `Prisma.InputJsonValue` types. Run from project root:
  ```
  cd H:\Projects\wellos-one
  pnpm --filter @wellos/api exec prisma generate --schema=../../prisma/schema.prisma
  ```
- **`pnpm dev` parallel mode swallows api Pino logs.** API runs fine but appears silent. To debug api boot, run it in its own terminal:
  ```
  cd H:\Projects\wellos-one
  pnpm --filter @wellos/api dev
  ```
- **Local-dev api logs Clerk warning on boot** if `apps/api/.env` lacks `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY`: `{level:40, msg:"CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY missing — Clerk plugin not registered. All routes effectively unauthenticated."}`. API still serves `/healthz` and unauthenticated routes. Tracked in sweep.
- **New PowerShell tabs start in `C:\Users\johnn`** — pnpm walks up looking for the nearest `package.json` and hits a corrupted one in some Remio cache, throwing `ERR_PNPM_JSON_PARSE`. Always `cd H:\Projects\wellos-one` first. Memory rule: `feedback_powershell_cd_prefix.md`.
- **Two api instances can't both bind to 3001** — `EADDRINUSE`. Kill the first one (Ctrl+C) before starting another. Easy to hit when running api in a separate terminal then forgetting it's still up.
- **Clerk dev keys (`pk_test_*`) on production custom domains require dev-browser-cookie bootstrap** — `app.wellos.one/dashboard` returns 404 with `X-Clerk-Auth-Reason: dev-browser-missing` to curl. Real browsers handle this transparently. Not new; bears repeating because it confused us when verifying `/admin/whoami` earlier 2026-04-28.

---

## How to start the next chat

Paste this to seed the next session (after `cd H:\Projects\wellos-one`):

> Continuing the Wellos project. Read `docs/SESSION-HANDOFF-2026-04-29.md` then follow `docs/000-CLAUDE-session-start-snippet.md` (read INFRASTRUCTURE.md, 01A, the relevant section of 09-dev-handoff.md, CLAUDE.md). Memory files load automatically — trust them. Local working location is `H:\Projects\wellos-one`. Then summarize state and propose what's next (likely: declare Epic 1 done and plan Epic 2).

---

## TL;DR for the next session

- Epic 1 is **8/9 sub-steps shipped**; sub-step 9's intent satisfied via the OneDrive move
- **Repo is now at `H:\Projects\wellos-one`** — Next.js dev no longer hangs
- **5 PRs merged this session** (#18-#22): role guards, env scaffold + README walkthrough, mobile-web-app-capable, Sentry test artifact removal, GH Actions Node 24 bump
- **Pre-launch sweep is shorter** (5 removed, 2 added)
- **Next:** declare Epic 1 closed and start Epic 2 (clients/staff/services schema + admin CRUD)
- **GitHub state:** clean — 0 open PRs, 0 open issues, all CI green, branch auto-delete + squash-only enforced at repo level
