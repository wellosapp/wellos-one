# Session handoff — Wellos / Wellos Studio (2026-04-30 → next)

Continuing the Wellos build the morning after the 2026-04-29 marathon (10 PRs). **This session closed Epic 2 entirely** by shipping the last spec gap: Client tags UI (backend + UI in 2 PRs).

Supersedes `docs/SESSION-HANDOFF-2026-04-29-late-night.md`.

---

## Session-start ritual (do this FIRST, before anything else)

Per `docs/000-CLAUDE-session-start-snippet.md`:

1. Read `docs/INFRASTRUCTURE.md` — current state of every service
2. Read `docs/01A-current-build-context.md` — what's safe to build, what's deferred, hard rules
3. Read **this file** for what shipped on 2026-04-30
4. Read `docs/SESSION-HANDOFF-2026-04-29-late-night.md` for context entering this session (Epic 2 was 90% complete)
5. Read the relevant Epic section of `docs/09-dev-handoff.md` — **Epic 2 is now closed**, so the next pickup is **Epic 3 (booking engine)**
6. Read `CLAUDE.md` — agent conventions, skill routing, hard rules
7. Memory files load automatically. Especially relevant entering Epic 3:
   - `MEMORY.md` (index, always loaded)
   - `deployed_surface.md` — refreshed with `/admin/client-tags` endpoints, tags column on `/admin/clients`, Epic 2 marked closed, Railway project renamed to `wellos-prod`
   - `feedback_session_workflow.md` — fixed 8-phase session flow with self-verification + user-smoke + spec-audit checkpoints
   - `feedback_admin_lists_need_row_actions.md` — every admin list ships with row actions from PR 1
   - **NEW** `feedback_daily_sweep_review.md` — at session start, scan `project_pre_launch_sweep.md` end-to-end; surface cheap knock-offs related to current work as "while we're here..." offers. Daily review, not Epic 11 single sweep.
   - `project_pre_launch_sweep.md` — Railway rename struck through as DONE; cadence updated to daily review

**Local path:** `H:\Projects\wellos-one`. Repo: `wellosapp/wellos-one`. Main at `0bb8cd0` after PR #43 (this doc itself ships in PR #44).

---

## What we shipped this session (2 PRs)

| PR | Title | Commit |
|---|---|---|
| #42 | feat(api): admin ClientTag CRUD with inline tagIds on Client (E2-S6a) | `5c01d36` |
| #43 | feat(web): admin Client tag CRUD UI + tag picker on ClientForm (E2-S6b) | `0bb8cd0` |

**Verified live in production at session end:**
- `api.wellos.one/version` → `commit: 5c01d36..., bootedAt: 2026-04-30T14:12:43Z` (deploy-verify workflow confirmed in 3m20s)
- `app.wellos.one/admin/client-tags` — full CRUD surface live, smoked end-to-end in the user's browser before merge (3 tags created, edit round-trip, soft-delete with `?includeDeleted=true` toggle)
- `app.wellos.one/admin/clients` — Tags column rendering colored pills with "+N more" overflow text; tag picker on Client form round-trips checked tags through save + reload

---

## What this session closed: Epic 2 spec audit

Per `docs/09-dev-handoff.md` Epic 2 "Done looks like" (lines 283-288):

| Criterion | Status |
|---|---|
| Admin can create a client with all fields, edit, soft-delete | ✅ E2-S3 + #42/#43 (tags) |
| Admin can create a staff member, assign services, set working hours, toggle active | ✅ E2-S5 + #40 bidirectional |
| Admin can create a service, set duration + price, assign eligible staff | ✅ E2-S4 + #40 bidirectional |
| Soft-deleted records hidden from lists but queryable for reports | ✅ Soft-delete extension + `?includeDeleted=true` |
| Save client with no name → validation error with clear message | ✅ Zod `firstName` required + field-error mapping |

The "tags" bullet in the Epic 2 spec body (line 271) is now satisfied. **Epic 2 is fully closed.**

---

## Schema decisions / shape choices baked in this session

### E2-S6 (ClientTag)
- Table + assignment join already existed since E2-S1 (`prisma/schema.prisma:343-374`). No migration needed this PR.
- Per-tenant unique on `(tenantId, name)` enforced at the DB level. Prisma's P2002 unique-violation is mapped to `DuplicateClientTagNameError` in the service layer and surfaced as 400 with `path: 'name'` field error — clean UX for the form, not a generic 500.
- Soft-delete preserves `client_tag_assignments` rows for audit/reporting. Soft-deleted tags are filtered out of the joined `tags[]` projection on Client list/detail responses (via `where: { tag: { deletedAt: null } }` on the relation) so pickers + badges don't render orphans.
- **List endpoint diverges from Service convention:** `/admin/clients` list now returns `tags: { id, name, color }[]` per row for badge rendering. Service list still omits `staffIds[]` for cost reasons. Decision: tags are display-affecting (admin needs to triage at a glance), staff assignments are editor-only. Worth the slight extra query cost.
- Detail endpoint returns BOTH `tagIds[]` (for form pre-fill) AND `tags[]` (for display).

### Inline `tagIds[]` on Client body (mirrors `staffIds[]` on Service body, PR #40)
- Validates every requested ID belongs to the caller's tenant. Unknown IDs throw `INVALID_TAG_IDS` → route returns 400 with `path: 'tagIds'`.
- Replaces `client_tag_assignments` rows inside the same `$transaction` as the Client write. Atomic.
- Audit log: existing `client.created/updated` actions automatically capture `tagIds` in `before`/`after` JSON (since the audit payload is the full `ClientWithTags` object).
- New audit actions for tag CRUD: `client_tag.created`, `client_tag.updated`, `client_tag.deleted`.

### Tags column on `/admin/clients` list
- Up to 3 colored pills inline; overflow shown as `+N more` text. Pill renders `<span>` with inline `style={{ backgroundColor: tag.color }}` — same accepted token-guard exception as the Service color swatch (rendering tenant-supplied data, not styling).
- Soft-deleted tags filtered server-side; no client-side filtering needed.

---

## Standing rules — no new ones this session

All rules from the late-night 2026-04-29 session still hold. This session was a clean execution of the established Service↔Staff pattern applied to Client↔Tag. Re-affirmed (without re-memorializing):

1. Inline M2M on parent body (not separate endpoint) — `tagIds[]` followed `staffIds[]`/`serviceIds[]` to the letter.
2. `useFormState` from `react-dom`, not `useActionState` — preserved in the new `ClientTagForm`.
3. Row Actions on every admin list — included in `/admin/client-tags/page.tsx` from PR 1.
4. Constants/types shared across server + client live in non-`server-only`-tainted modules — no shared-module problems hit this session because the tag picker uses primitive `{id, name, color}` shapes from the API wrapper.
5. Money fields take USD/percent in the form, store cents/Decimal server-side — N/A here (tags have no money fields).
6. `prisma migrate dev` locally IS the production migration application — N/A here (no schema change).

---

## Production state (end of session, post-PR #43)

- **`main`** at `0bb8cd0`
- **Active Railway deploy:** `5c01d36` (PR #42 backend; PR #43 was frontend-only, deploy-verify correctly skipped per the path filter from PR #37). `/version` confirms backend on `5c01d36`.
- **Active Vercel deploy:** `0bb8cd0` for `wellos-web`. `wellos-studio` unchanged (no studio-side surface this session).
- **Database (Supabase, prod = dev):** 15 tables, no schema changes this session. Tag tables existed since E2-S1.
- **Test data:** 3 client tags created during smoke ("VIP" `#3D7A5E`, "First-time" `#005b96`, "Allergies Women" `#B76E79`); one of those soft-deleted ("Allergies Women") to verify the toggle. 1 client ("Test Frist Test Last") has the "First-time" tag assigned. Stale Test Client + 3 Test Services + 1 Test Staff from prior sessions still around.

---

## Open items / what's NEXT

### Epic 3 (booking engine) — the hardest module per the spec

Per `docs/09-dev-handoff.md` Epic 3 "Done looks like" (lines 315-321):
- Availability query for a staff member returns slots respecting working hours, existing appointments, buffers
- Race-safe booking (parallel-create same slot → exactly one success, one clear error)
- DST-correct local times across the transition
- Cancelling frees the slot immediately in availability
- No-show does NOT free the slot (reporting distinction, not availability)

**Why it's hard:** time math (DST, timezones, working hours intersected with existing appointments), concurrency (slot-locking in a multi-tenant Postgres without N+1 issues), and a public booking surface that doesn't authenticate.

**Required reading before any code (4 specs, dispatch parallel Explore agents):**
- `docs/04-booking-flow.md` — base spec (legacy "Velura" naming; mentally substitute Wellos)
- `docs/04-booking-flow-context.md` — context / decisions log
- `docs/05-booking-enhancements.md` — additions to the base spec
- `docs/006-booking-design-refresh.md` — design refresh (legacy "Velura" naming; warm-professional design tokens already shipped, so this is direction not implementation)

**Recommended Phase 1 of next session:** dispatch 3-4 Explore subagents in parallel — one per doc — to extract: data shape, API surface, race-condition strategy, DST handling, public-vs-admin split. Plus one Plan agent on top to reconcile the four into a single E3-S1 schema-and-route plan. **Do NOT start writing code until that plan is approved.** This is the module where premature schema choices are the most expensive.

**Suggested first sub-step (E3-S1):** Schema additions for `Appointment` + `AppointmentSlot` (or whatever shape the synthesis lands on). Migration via `prisma migrate dev` per the standing rule.

### Tweaks tracked in `project_pre_launch_sweep.md`

- **Native color picker** — extended this session to cover ClientTag form too. Single follow-up PR replaces `<Input type="text">` for both Service and ClientTag color with `<input type="color">` (or a Radix-based picker).
- (All other sweep items unchanged from late-night handoff.)

### Other deferrals (unchanged)

- Stripe (Epic 6), TextLink (Epic 8), Postmark webhooks (Epic 8), BullMQ worker (Epic 8), Staging environments, Branch protection, `apps/studio` design system re-skin, `cuid2` ID migration, Idempotency-Key middleware, Events bus emission.

---

## Pending USER tasks (no rush, do anytime)

Carried over from late-night handoff plus this session's smoke artifacts:

1. **Hard-delete or restore the soft-deleted Test Client** from prior smoke (cosmetic).
2. **Hard-delete the test Services + test Staff** ("Test Service 1/2/3", "Sara Thompson") from late-night smoke, OR keep for the next sub-step that needs sample data.
3. **Hard-delete or restore the 3 test client tags + the "Allergies Women" soft-deleted tag** from this session's smoke, OR keep them — they're realistic tags any boutique business would actually use.
4. **Clerk dashboard cleanup batch** (~15 min):
   - Rename Clerk app `wellos-web` → `Wellos`
   - Disable Apple/Facebook/Google + phone sign-in
   - Decide on the two-Clerk-apps drift (consolidate or update INFRASTRUCTURE.md §3.6)
5. **Cosmetic, no rush:**
   - ~~Rename Railway project `diligent-achievement` → `wellos-prod`~~ — **DONE 2026-04-30** (project ID `f1a3acd7-b916-44cd-93ec-f54ecf369e0b`; recorded in `INFRASTRUCTURE.md` §3.2 + `memory/deployed_surface.md`)
   - Delete old OneDrive copy of the repo when comfortable

---

## Stack pins (don't substitute without asking — see CLAUDE.md §3)

Unchanged from late-night handoff. Restated:
- **Node 20.x** (engines.node capped at <21 per PR #33)
- pnpm 10 · TypeScript strict · Fastify 5.0.0 · Next.js 14 App Router · React 18.3.1
- Prisma 5.22.0 · `@clerk/nextjs` 6.x · `@clerk/fastify` 1.x · `zod` · `svix`
- Tailwind 3.x · Postgres via Supabase pooler 6543 (runtime) / session pooler 5432 (`DIRECT_URL`)
- Upstash Redis · Postmark (sending domain `mail.wellos.one`)
- Sentry · PostHog · BetterStack · GH Actions

---

## Gotchas accumulated this session

- **Anon curl returns 404 on protected routes.** The Vercel deploy poll for `/admin/client-tags` returned 404 from curl, which initially looked like the deploy hadn't picked up the new route — but it's the documented Clerk dev-key behavior (`Clerk dev keys ... protected routes return 404 to non-bootstrapped clients`). Verify route presence in an authenticated browser, or check root domain 200 to confirm Vercel deploy succeeded.
- **`gh pr checks --watch --fail-fast` exits on Vercel preview failures even though CI is still pending.** The Vercel preview deploys are expected-fail (git identity issue, INFRASTRUCTURE.md §5.3), but `--fail-fast` treats any failed check as terminal and exits early. Use `gh run watch <run-id> --exit-status` to follow the actual CI workflow run instead.
- **`jq` is not installed in this Windows bash.** `gh ... --jq '...'` works (jq is bundled into gh), but standalone `jq` in a pipe does not. Use `--jq` on `gh` commands instead of piping into a separate `jq` process. Two background polls failed this session for that reason; both were trivially retried with the right form.

---

## How to start the next chat

Paste this to seed the next session (after `cd H:\Projects\wellos-one`):

> Continuing the Wellos project. Read `docs/SESSION-HANDOFF-2026-04-30.md` then follow `docs/000-CLAUDE-session-start-snippet.md` (read INFRASTRUCTURE.md, 01A, the relevant section of 09-dev-handoff.md, CLAUDE.md). Memory files load automatically — trust them, especially `feedback_session_workflow.md` which is the standard 8-phase flow you must follow. Local working location is `H:\Projects\wellos-one`. Then summarize state and propose what's next. **Epic 2 is closed; the next major piece is Epic 3 (booking engine).**

---

## TL;DR for the next session

- **2 PRs merged this session** (#42 backend + #43 frontend). Total since project start: 43.
- **Epic 2 is fully closed.** All five "Done looks like" criteria pass. The "tags" spec bullet is satisfied with backend tag CRUD + UI tag picker on ClientForm + tag pills column on `/admin/clients`.
- **Next major piece: Epic 3 (booking engine).** Hardest module per the spec — time math, concurrency, public surface. Read Epic 3 of `09-dev-handoff.md` before writing code.
- **`main` at `0bb8cd0`**, `api.wellos.one/version` confirms backend at `5c01d36` (frontend-only PR #43 doesn't trigger deploy-verify by design).
- **GitHub state:** clean — 0 open PRs, all CI green, branch auto-delete + squash-only enforced.
