# Session handoff — Wellos / Wellos Studio (2026-04-29 late-night → next)

Continuing the Wellos build after the morning + evening sessions of 2026-04-29. **Massive day — 10 PRs merged across all of today's three sessions, and Epic 2 is functionally complete except for one gap (Client tags UI).** This handoff covers the late-night session only; for context entering this session see `docs/SESSION-HANDOFF-2026-04-29-evening.md`.

Supersedes `docs/SESSION-HANDOFF-2026-04-29-evening.md` (which itself superseded `docs/SESSION-HANDOFF-2026-04-29.md`).

---

## Session-start ritual (do this FIRST, before anything else)

Per `docs/000-CLAUDE-session-start-snippet.md`:

1. Read `docs/INFRASTRUCTURE.md` — current state of every service
2. Read `docs/01A-current-build-context.md` — what's safe to build, what's deferred, hard rules
3. Read **this file** for what shipped on the late-night-of-2026-04-29 session
4. Read `docs/SESSION-HANDOFF-2026-04-29-evening.md` for context entering this session (Epic 1 close-out + E2-S1/2/3 already shipped)
5. Read the relevant Epic section of `docs/09-dev-handoff.md` (Epic 2 if continuing; the only remaining piece is **Client tags UI**)
6. Read `CLAUDE.md` — agent conventions, skill routing, hard rules
7. Memory files load automatically. Especially relevant to this session's work:
   - `MEMORY.md` (index, always loaded)
   - `deployed_surface.md` — refreshed with Service + Staff CRUD endpoints, /version, deploy-verify, row actions component, observability section
   - `feedback_session_workflow.md` — **NEW STANDING RULE** — fixed 8-phase session flow with self-verification + user-smoke + spec-audit checkpoints. Read this FIRST every session. Don't skip phases; don't improvise the order.
   - `project_node_version_pin.md` — **NEW** — root engines.node capped at <21 (Nixpacks Node-24 ABI mismatch hotfix)
   - `reference_railway_hobby_slow_recovery.md` — **NEW** — Hobby plan recovers later than Pro during Railway incidents; expect extra wait before assuming app bugs
   - `feedback_admin_lists_need_row_actions.md` — **NEW STANDING RULE** — every admin list ships with rightmost Actions column (Edit link + Soft-delete button) from PR 1; not a follow-up
   - `project_pre_launch_sweep.md` — appended color-picker entry for the Service form

**Local path:** `H:\Projects\wellos-one`. Repo: `wellosapp/wellos-one`. Main at `1a47136` after PR #40 (this doc itself ships in PR #41).

---

## What we shipped this session (10 PRs total)

### Design + bug fixes (early late-night)

| PR | Title | Commit |
|---|---|---|
| #31 | feat(web): bootstrap Tailwind + design tokens, re-skin admin (E2 design system) | `5ddc3a6` |
| #32 | fix(api): parse includeDeleted query param explicitly, not via z.coerce.boolean | `fa0bc16` |

### Production incident + recovery

| PR | Title | Commit |
|---|---|---|
| #33 | fix(infra): pin Node version to 20.x so Nixpacks doesn't auto-upgrade to 24 | `1512045` |
| #34 | feat(api,ci): /version endpoint + post-deploy verification workflow | `e9aa324` |

### Epic 2 services + staff

| PR | Title | Commit |
|---|---|---|
| #35 | feat(api): admin Service CRUD endpoints with Zod validation + audit (E2-S4) | `ff11682` |
| #36 | feat(web): admin Service CRUD UI in apps/web (E2-S4b) | `0ec82d0` |
| #37 | fix(ci): only run deploy-verify when Railway-watched paths change | `628fd70` |
| #38 | feat(api): admin Staff CRUD with inline StaffService M2M assignment (E2-S5a) | `b775d9c` |
| #39 | feat(web): admin Staff CRUD UI in apps/web (E2-S5b) + row Actions on all 3 lists + Closed-default fix | `6de0dbb` |
| #40 | feat(api,web): Service↔Staff bidirectional assignment (Epic 2 spec close-out) | `1a47136` |

**Verified live in production at session end:**
- `api.wellos.one/version` → `commit: 1a47136..., bootedAt: 2026-04-30T01:03:39Z`
- `app.wellos.one/admin/clients`, `/admin/services`, `/admin/staff` — all three CRUD surfaces live with design tokens, row actions, edit/delete affordances
- StaffService M2M manageable from BOTH `/admin/staff/:id` (services for this staff) AND `/admin/services/:id` (staff who can perform this service)
- Soft-delete filter correctly hides rows on default view, surfaces them on `?includeDeleted=true`
- Audit log captures all `client.* / service.* / staff.*` mutations with serviceIds/staffIds embedded in before/after JSON

---

## The Railway incident that drove the observability work

**Timeline (UTC):**
- 18:51 — PR #31 + #32 merged in quick succession; Railway triggered two deploys
- 18:55 — fa0bc162 deploy failed (healthcheck timeout)
- 18:59 — 5ddc3a6e deploy failed (same)
- 19:00–19:30 — Spent ~30 min not knowing prod was on stale code; `/healthz` was still 200 because Railway kept the previous deploy alive on healthcheck failure
- ~19:35 — Diagnosed: dashboard build log showed `nodejs_24` provisioned by Nixpacks; the deploy log showed `MODULE_NOT_FOUND on @sentry/profiling-node/lib/sentry_cpu_profiler-linux-x64-glibc-137.node` (137 = Node 24's NODE_MODULE_VERSION). `@sentry/profiling-node@8.42.0` ships ABI binaries for Node 20/22 only.
- **Root cause:** root `package.json` `engines.node` was open-ended (`">=20.0.0"`) and Railway's Nixpacks bumped its default Node version to 24 sometime in the last 17 hours.
- **Fix:** PR #33 capped to `">=20.0.0 <21.0.0"`. Same SHA redeployed cleanly on Node 20.

**Lessons memorialized:**
1. `project_node_version_pin.md` — don't loosen the upper bound without checking native dep ABIs
2. `reference_railway_hobby_slow_recovery.md` — Hobby plan recovers later than Pro during Railway incidents; the incident banner that day had Pro recovered while Hobby was still queued
3. The user said "we should build observability for this so we don't have to manually walk the GH deployments API" — that became PRs #34 and #37

**Tooling we built in response:**
- **`GET /version`** on the API exposing `RAILWAY_GIT_COMMIT_SHA`/`DEPLOYMENT_ID`/`environment`/`bootedAt`
- **`.github/workflows/deploy-verify.yml`** that polls /version after merges to main and fails the workflow if the running commit doesn't match `GITHUB_SHA` within ~13 min — emails on workflow failure
- **PR #37 path filter** — restricts the workflow to api-affecting paths (`apps/api/**`, `packages/**`, `prisma/**`, `pnpm-lock.yaml`, `package.json`) so frontend-only PRs don't false-fail
- Self-tested twice in the positive case (#34, #35, #38, #40 fired green) and once in the negative case (#39 frontend-only correctly skipped)

**Auto-merge chain pattern** also established: a single background bash script that watches CI → merges if green → watches deploy-verify → reports the final state and `/version` body. Used 4× this session.

---

## Schema decisions / shape choices baked in this session

### E2-S4 (Service)
- Hex color stored as 6-digit `#RRGGBB` string at the DB layer; Zod regex on input. UI maps to design tokens. (User flagged "we should add a color picker someday" → tracked in sweep.)
- Money: `basePriceCents` integer; UI takes USD with 2 decimals and converts via `Math.round(n * 100)`.
- Soft-delete preserves `staff_services` rows for audit; booking engine filters on `service.deletedAt`.

### E2-S5 (Staff)
- `workingHours` is JSONB shape `{ mon: [{start, end}], ... }` with HH:MM 24-hour times and end > start. Single shift per day in MVP UI; multi-shift allowed at the data layer (deferred to Phase 2).
- **Closed-default UX:** Mon–Fri default to **Closed unchecked + 09:00/17:00 pre-filled**, Sat–Sun default to Closed checked. Established 2026-04-29 evening when the user typed times for Mon-Fri but didn't realize the Closed checkbox was checked by default — would have saved as zero working hours.
- Hourly rate `Int` cents; commission `Decimal(5,2)` percent rounded by Zod transform on input.
- **No duplicate-warning** for Staff (unlike Client) — two staff with the same email is a config error, not a real-world case.
- Soft-delete preserves `staff_services` rows.

### E2-S5b ↔ E2-S4 inverse (PR #40)
- `serviceIds[]` (Staff side) AND `staffIds[]` (Service side) both write to the same `staff_services` join. Either side can replace the assignment set atomically with the parent write inside a single $transaction.
- Cross-tenant safety: every requested ID is verified to belong to the caller's tenant before the join rows are written. Unknown IDs return 400 with field-style error on `serviceIds`/`staffIds`.
- Detail GET endpoints return `Staff & { serviceIds: string[] }` / `Service & { staffIds: string[] }`. List endpoints OMIT the M2M projection (per-row lookup wasteful).

---

## Standing rules established this session (memorize these for future sessions)

1. **Every admin list ships with row actions from day 1.** Rightmost "Actions" column with Edit link + Soft-delete ghost button (native `confirm()` before submitting). Pattern lives in `apps/web/components/admin/DeleteConfirmButton.tsx`. Memorialized as `feedback_admin_lists_need_row_actions.md`. **DO NOT** ship list-only views.

2. **Working-hours form defaults: Mon–Fri working with 09:00/17:00, Sat–Sun closed.** Editing existing data preserves DB values.

3. **Money: form takes USD/percent; server stores cents/Decimal.** Conversion in `_actions.ts` via `Math.round(n * 100)`. API field name (`hourlyRateCents`/`basePriceCents`) is remapped to form path (`hourlyRateDollars`/`basePriceDollars`) on validation errors so messages land on the right input.

4. **M2M assignments inline on the parent body, not a separate endpoint.** `serviceIds[]` on Staff create/update; `staffIds[]` on Service create/update. Replacing rows happens in the same transaction. Either direction works; both write the same join table.

5. **Constants/types shared across server + client must live in a non-`server-only`-tainted module.** Lesson from PR #39: `lib/staff-days.ts` was extracted because importing `DAY_KEYS` from `lib/api/staff.ts` (which transitively pulled in `@clerk/nextjs/server`) broke the client component build with `'server-only' cannot be imported from a Client Component module`. Apply the same pattern for any future shared constant/type that both server actions and client components need.

6. **`useFormState` from `react-dom`, NOT `useActionState` from `react`.** Carry-over from hotfix #28; reaffirmed in every form built this session. Inline comment lives at the top of every form component.

7. **`prisma migrate dev` locally IS the production migration application.** Railway build does NOT run `prisma migrate deploy`. Confirmed in `project_migrations_apply_locally.md`. No migration-related work happened this session, but the rule still holds.

8. **deploy-verify path filter must match Railway's watch list.** If you change Railway's watch paths, update `.github/workflows/deploy-verify.yml` `paths:` filter to match. Currently: `apps/api/**`, `packages/**`, `prisma/**`, `pnpm-lock.yaml`, `package.json`.

---

## Production state (end of session, post-PR #40)

- **`main`** at `1a47136`
- **Active Railway deploy:** `1a47136`, healthy, `/version` reports the new commit
- **Active Vercel deploy:** also `1a47136` for both `wellos-web` and `wellos-studio`
- **Database (Supabase, prod = dev):** 15 tables in `public`, no schema changes this session (last schema migration was PR #25 in the morning)
- **Test data:** Test Client soft-deleted (still hidden by default per the #32 fix); 3 Test Services created during user smoke (Test Service 1/2/3 in #3D7A5E / #005b96 / #B76E79); 1 Test Staff "Sara Thompson" with 3 services assigned

---

## Open items / what's NEXT

### Last Epic 2 spec gap: Client tags UI

The schema has had `ClientTag` + `ClientTagAssignment` tables since E2-S1. There's no admin tag-CRUD page and no tag multi-select on `ClientForm`. Per `docs/09-dev-handoff.md` Epic 2: *"name, email, phone, date of birth, address, emergency contact, intake status, **tags**, notes."*

**Scope:**
- Backend: tag CRUD endpoints (`/admin/tags` or `/admin/client-tags`) — name + color, similar shape to Service. Plus `tagIds[]` on Client create/update body for inline M2M assignment.
- Frontend: a `/admin/tags/*` CRUD surface (list/new/edit/delete, mirrors Service) AND a tag multi-select fieldset added to `ClientForm.tsx`.
- The list view of clients should probably show their tags as small Badges in a column too.

**Estimated effort:** 2 PRs (backend + UI), each comparable to Service CRUD scale. Probably 60–90 min total once primed.

### Sweep-tracker items appended this session

- **Native color picker on Service form** — currently typed `#RRGGBB`. Cheapest path: `<input type="color">` writing to a hidden input. Polished path: Radix-based picker tied to design tokens. Apply same pattern to ClientTag color when that surface ships.
- (All other sweep items unchanged)

### Other deferrals (unchanged from earlier handoffs)

- Stripe (Epic 6)
- TextLink (Epic 8)
- Postmark webhooks (Epic 8)
- BullMQ worker on Railway (Epic 8)
- Staging environments
- Branch protection on `main`
- `apps/studio` design system re-skin (still pre-design-system; do when real surfaces land)
- `cuid2` ID migration (tracked in sweep)
- Idempotency-Key middleware (CLAUDE.md hard rule #8; tracked)
- Events bus emission (CLAUDE.md hard rule #10; arrives with Epic 8 BullMQ infra)

---

## Pending USER tasks (no rush, do anytime)

1. **Hard-delete or restore the soft-deleted Test Client** from manual e2e (cosmetic).
2. **Hard-delete the test Services + test Staff** ("Test Service 1/2/3", "Sara Thompson") created during smoke testing this session, OR keep them for the next E2 sub-step that needs sample data.
3. **Clerk dashboard cleanup batch** (~15 min, unchanged from last session):
   - Rename Clerk app `wellos-web` → `Wellos`
   - Disable Apple/Facebook/Google + phone sign-in
   - Decide on the two-Clerk-apps drift (consolidate or update INFRASTRUCTURE.md §3.6)
4. **Cosmetic, no rush:**
   - Rename Railway project `diligent-achievement` → `wellos-prod`
   - Delete old OneDrive copy of the repo when comfortable

---

## Stack pins (don't substitute without asking — see CLAUDE.md §3)

- **Node 20.x** (engines.node now capped at <21 per PR #33)
- pnpm 10 · TypeScript strict
- Fastify 5.0.0 (api) · Next.js 14 App Router (web, studio)
- React 18.3.1 (Next 14 ships React 18 canary at runtime — `useActionState` does NOT exist; use `useFormState` from `react-dom`)
- Prisma 5.22.0 (Prisma 6+ has pnpm-10 workspace auto-install bug; tracked in sweep)
- `@clerk/nextjs` 6.x (frontend) · `@clerk/fastify` 1.x (backend)
- `zod` for backend validation · `svix` for webhook HMAC
- Tailwind 3.x (NOT Tailwind 4)
- Prisma → Postgres via Supabase (pooler 6543 for runtime; session pooler 5432 for `DIRECT_URL`)
- Upstash Redis · Postmark (sending domain `mail.wellos.one`)
- Sentry · PostHog · BetterStack · GH Actions

---

## Gotchas accumulated this session

- **Nixpacks silently bumps Node.** Cap `engines.node` to a major version — see `project_node_version_pin.md`.
- **Hobby Railway plan recovers from outages slower than Pro.** During the 2026-04-29 incident, Pro had recovered ~1h before Hobby. If you see deploy failures during a Railway incident, wait for "monitoring" status before assuming app bugs.
- **`'server-only' cannot be imported from a Client Component module`** — when a client component imports from a module that transitively imports `@clerk/nextjs/server` (or any `'server-only'`-marked package). Fix: extract shared constants/types into a non-tainted module. See `apps/web/lib/staff-days.ts`.
- **Next.js typed routes break tsc on fresh route additions until `.next/` is cleared.** After adding new routes locally, `rm -rf apps/web/.next` before `pnpm typecheck` or run a full `pnpm build` (which regenerates the types).
- **gh `pr create` needs the correct `--base`.** PR #40 was opened with `--base feat/web-admin-staff-crud-ui` (its dependency PR #39's branch). When #39 merged, GitHub auto-retargeted #40 to `main`.
- **`gh pr merge`** has been working consistently this session despite the older `feedback_pr_creation_blocked.md` memory. The harness sometimes denies the first attempt, retries usually go through. Adjust the memory if this stays stable.
- **Browser smoke catches real bugs.** The Closed-default issue on the Staff form would have shipped silently if not for the user smoking #39. Lesson holds: UI-heavy PRs need a real browser smoke before merge.

---

## How to start the next chat

Paste this to seed the next session (after `cd H:\Projects\wellos-one`):

> Continuing the Wellos project. Read `docs/SESSION-HANDOFF-2026-04-29-late-night.md` then follow `docs/000-CLAUDE-session-start-snippet.md` (read INFRASTRUCTURE.md, 01A, the relevant section of 09-dev-handoff.md, CLAUDE.md). Memory files load automatically — trust them. Local working location is `H:\Projects\wellos-one`. Then summarize state and propose what's next.

---

## TL;DR for the next session

- **10 PRs merged today across all sessions** (#26-#40 with a couple gaps)
- **Epic 2 effectively complete:** Client + Service + Staff CRUD all shipped with backend + UI; Service↔Staff bidirectional M2M; row actions on every admin list; design system live
- **Last Epic 2 piece: Client tags UI** (backend tag CRUD + tag multi-select on Client form). 2 PRs, ~60-90 min.
- **Observability tooling** (`/version` + deploy-verify workflow) is live and self-tested 4× this session
- **`main` at `1a47136`**, `api.wellos.one/version` confirms it
- **GitHub state:** clean — 0 open PRs, all CI green, branch auto-delete + squash-only enforced
- After Client tags lands, Epic 2 is done and the next major piece is **Epic 3: Booking engine**
