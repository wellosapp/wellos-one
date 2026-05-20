# Session handoff — Wellos (2026-05-20)

Session focus: pick up `feature/calendar-sync-phase5` mid-WIP, build the missing frontend layer, ship the whole feature as one PR. Discovered and contained a significant **migration-drift** problem along the way.

Supersedes `docs/SESSION-HANDOFF-2026-04-30-evening.md` for live state.

---

## Session-start ritual (do this FIRST, before anything else)

Same as the 2026-04-30-evening handoff §"Session-start ritual" — read `docs/INFRASTRUCTURE.md`, `docs/01A-current-build-context.md`, the most recent handoff (now this file), the relevant `docs/09-dev-handoff.md` Epic, and `CLAUDE.md`. Memory files load automatically — the freshly-added `project_migration_drift_2026_05.md` is critical for the next session if any new migration is touched.

---

## What we shipped this session (1 PR)

| PR | Branch | Title | Commit |
|---|---|---|---|
| (TBD — PR not yet opened due to gh command failure; branch pushed) | `feature/calendar-sync-phase5` | feat(api,web): staff calendar sync — read-only ICS feed (E7-P5) | `a958bdd` |

Single commit bundling DB + API + frontend per `feedback_db_api_frontend_order.md`. 13 files, 629 insertions.

**Verified live before commit:**
- Both typechecks (web + api) green
- Web ESLint green
- 4 of 7 browser smoke steps passed (Generate, valid ICS download, regenerate invalidates old URL, soft-delete hides card). OAuth-stub 501 step not yet exercised.

---

## What's now in production code (after this branch merges)

### DB

New table `staff_calendar_feed_tokens`:
- `id` (cuid PK), `tenant_id` (FK Tenant ON DELETE RESTRICT), `staff_id` (FK Staff ON DELETE CASCADE, UNIQUE — one active token per staff)
- `token_hash` (UNIQUE — SHA-256 of the raw token; raw token never persisted)
- `created_at`
- Indexes: unique on `staff_id`, unique on `token_hash`, regular on `tenant_id`

Migration `prisma/migrations/20260505130100_staff_calendar_feed_token/migration.sql` already applied to live Supabase via `prisma db execute` + `prisma migrate resolve --applied`. Recorded in `_prisma_migrations`. The migration was applied **out-of-band** (not via `prisma migrate dev`) because of the broader drift documented below — `migrate dev` would have prompted to reset the DB.

### API (Fastify)

| Verb | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/admin/staff/:id/calendar-feed/regenerate` | `requireRole.admin` | Returns `{ subscribeUrl, token, message }`. Delete + create in one `$transaction`. Raw token shown once. |
| `POST` | `/admin/staff/:id/calendar-sync/oauth` | `requireRole.staff` | Returns 501 with a friendly message — OAuth queued for later phase. |
| `GET` | `/public/calendar/staff.ics?token=…` | **anonymous (no Clerk)** | Looks up `tokenHash`, loads appointments in [-30d, +365d] window, excludes `cancelled` and `no_show`, emits RFC 5545 calendar. `Cache-Control: no-store`, `Content-Type: text/calendar; charset=utf-8`. |

New files:
- `apps/api/src/lib/rfc5545.ts` — TEXT escaping (§3.3.11), UTC basic date-time, 75-octet line folding with single-SPACE continuation (§3.1).
- `apps/api/src/services/staffCalendarFeedService.ts` — token mint, ICS builder, appointment loader.
- `apps/api/src/routes/admin/staff-calendar-sync.ts`
- `apps/api/src/routes/public/calendar-feed.ts`
- `apps/api/src/routes/public/index.ts` — first file in the new public route group.
- `apps/api/src/index.ts` — registers `publicRoutes` between `adminRoutes` and `webhookRoutes` (per the load-order rule webhooks last).

### Frontend (Next.js / web)

Calendar Feed card on the staff detail page (`/admin/staff/:id`). Admin only. Hidden when staff is soft-deleted.

- `apps/web/lib/api/staff-calendar-sync.ts` — typed wrapper.
- `apps/web/app/admin/staff/_calendar-feed-actions.ts` — server action `regenerateCalendarFeedAction(id, prev, formData)`.
- `apps/web/app/admin/staff/[id]/CalendarFeedCard.tsx` — `useFormState` + `useFormStatus`, copy-to-clipboard buttons, one-time-token warning, disabled Google + Outlook OAuth affordances tagged "Coming soon".
- `apps/web/app/admin/staff/[id]/page.tsx` — slots `<CalendarFeedCard />` between StaffForm and the soft-delete card.

---

## Migration drift — current state of the live DB vs `main`

**This is the most important context for the next session.**

Live Supabase DB has **15 migrations** applied in `_prisma_migrations`. Local `main` has **6** migration directories. The 9-migration gap breaks down as:

| Applied to DB | In `main`? | Source branch | Notes |
|---|---|---|---|
| 6 baseline migrations | ✅ | `main` | init, users_tenant, clients_staff_services, appointments, tier_a_client_memory, tier_a_revise_media |
| `20260502083853_add_client_number` | ❌ | **nowhere** | **Orphaned — file does not exist in any branch.** Applied via `prisma db push` or hand-rolled SQL. The shape needs to be recovered via `pg_dump` of the `clients` table before a placeholder migration file can be scaffolded. |
| `20260502103000_service_catalog_mvp` | ❌ | `feature/intake-forms-phase2c-dashboard` (+ `feature/intake-forms-phase2`, `feature/public-booking-mvp-phase1`, `prisma/catalog-schedule-notes`) | |
| `20260502140000_appointment_booked_base_price_cents` | ❌ | same set | |
| `20260502180000_client_preferred_name` | ❌ | same set | |
| `20260502200000_client_note_source_quick_book` | ❌ | same set | |
| `20260503143000_staff_schedule_blocks` | ❌ | same set | |
| `20260503180000_intake_forms_mvp` | ❌ | **only `feature/intake-forms-phase2c-dashboard`** | |
| `20260504120000_appointment_source_calendar_drag` | ❌ | same set as service_catalog_mvp | |
| `20260505130100_staff_calendar_feed_token` | ✅ on disk | **`feature/calendar-sync-phase5` (ours)** | Applied this session via `db execute` + `migrate resolve --applied`. |

### Why this happened

Several open PRs (#60-#67) each apply their own migrations via `prisma migrate dev` against the **shared** dev=prod Supabase instance (per `project_single_db_dev_eq_prod.md`). Because none of them have merged, the DB has all the schema, but `main` has none of the files.

### Why it matters

Any future `prisma migrate dev` from a branch built off `main` will see the drift and offer to **reset the database** (destructive). The mitigation used this session — apply raw SQL via `prisma db execute`, then `prisma migrate resolve --applied` — works for one migration at a time but doesn't fix the underlying state.

### How to fix (queued, not started this session)

1. Pick a reconciliation branch (probably new, off `main`).
2. Cherry-pick the 7 known migration directories from `feature/intake-forms-phase2c-dashboard` (it's the superset).
3. Scaffold a placeholder migration file for `20260502083853_add_client_number` by `pg_dump`-ing the current `clients` table shape, diffing against the pre-drift schema, and authoring SQL that matches what was actually applied.
4. Confirm `prisma migrate status` against the live DB reports "schema is up to date".
5. Merge the reconciliation PR first, then unblock the 7 stacked PRs (#60-#67) to merge in chronological order.

Memorialized in the new memory file `project_migration_drift_2026_05.md`.

---

## Other open PRs on the repo (unrelated to this session)

| PR | Branch | Title |
|---|---|---|
| #67 | `feature/intake-forms-phase2c-dashboard` | feat: intake forms, public booking, staff compliance, dashboard 2c |
| #66 | `feat/web-calendar-crm-client-ui` | feat(web): calendar views, Quick Book CRM, client profile, staff schedule |
| #65 | `feat/api-staff-booking-onboarding-schedule` | feat(api): staff booking CRM context, schedule blocks, service categories |
| #64 | `prisma/catalog-schedule-notes` | chore(db): Prisma migrations for catalog, booking, schedule blocks |
| #63 | `pr/docs-specs-parity` | docs: staff booking, calendar, services catalog, onboarding/forms specs |
| #62 | `feat/web-calendar-week-month-views` | feat(api,web): Month / Week / Day calendar views + staff schedule + client book scaffold |
| #61 | `feat/web-client-profile-revamp-e3-s7` | feat(api,web): client member number + stats + media endpoints (E3-S7 backend) |
| #60 | `feat/api-appointment-media-list-e3-s6` | feat(api,web): wire calendar Files tab via GET /admin/appointments/:id/media (E3-S6) |

These are not touched by this session and likely depend on each other. They'll need to be merged in chronological order **after** the migration-drift reconciliation lands.

---

## Epic 8 notifications WIP still sitting unstaged on this branch

The working tree of `feature/calendar-sync-phase5` still contains a half-built Epic 8 notifications + webhooks pile that drifted onto this branch. Not touched this session. To handle:

```powershell
# Move it to its own branch when ready (NOT this session):
git stash push -u -m "epic8-notifications-wip" -- `
  .env.example `
  apps/api/package.json `
  apps/api/src/index.ts `
  apps/api/src/routes/webhooks/index.ts `
  apps/api/src/routes/webhooks/postmark.ts `
  apps/api/src/routes/webhooks/textlink.ts `
  apps/api/src/routes/webhooks/webhook-auth.ts `
  apps/api/tsconfig.json `
  apps/web/app/admin/layout.tsx `
  apps/web/app/global-error.tsx `
  apps/web/next.config.mjs `
  apps/web/package.json `
  pnpm-lock.yaml `
  packages/notifications/ `
  .npmrc
```

The pile includes the provider-abstraction package per master spec §10.3, postmark/textlink webhook handlers, BullMQ + ioredis deps, and small web-app changes (next.config, layout, global-error). It's roughly 60% of Epic 8 Phase 1 — the actual queues / workers / job dispatch logic is still missing.

---

## Workflow lessons baked in this session

1. **`prisma db execute` + `prisma migrate resolve --applied`** is the safe pattern when a single migration needs to land on a DB that has drifted from the local migration history. It does NOT fix the drift, but it lets one migration through without resetting the DB. Documented in `project_migration_drift_2026_05.md`.

2. **`gh pr create` with em-dashes in the title can fail silently** in Windows PowerShell 5.1 (encoding). Use ASCII-only titles in PowerShell heredocs. Bodies are fine because they're literal here-string content, but the `--title` argument goes through PS's argument parser.

3. **Don't let unrelated WIP ride along** — Epic 8 work landed unstaged on the calendar-sync branch and complicated the commit. Should have been its own branch from the start. Reinforces `feedback_db_api_frontend_order.md` (per-feature) and `feedback_local_build_then_push.md` (commit only what relates to the current feature).

---

## Stack pins (unchanged)

Same as 2026-04-30-evening handoff §"Stack pins". Node 20, pnpm 10, Fastify 5, Next.js 14, Prisma 5.22.0, Postgres via Supabase pooler 6543 / direct 5432, Upstash Redis (TCP for BullMQ), Postmark, TextLink, Cloudflare R2.

---

## Open items / what's NEXT

In priority order:

1. **Open the calendar-sync PR for real** — `gh pr create` command in `feedback_pr_creation_blocked.md`-friendly form (ASCII-only title). Branch `feature/calendar-sync-phase5` is pushed and ready.
2. **Migration-drift reconciliation** (see "How to fix" above) — must land before any new migration is safe.
3. **Merge the 7 stacked open PRs in order** (#60 → #67 plus #63 docs). Note these may have inter-PR conflicts that need resolving.
4. **Move the Epic 8 WIP off this branch** via the `git stash` recipe above. Then resume Epic 8 properly on its own branch (queues + workers + dispatch + job scheduling per master spec §10).
5. **OAuth Phase 6 of Epic 7** — Google Calendar + Microsoft Graph two-way sync. Currently the `/admin/staff/:id/calendar-sync/oauth` returns 501. Real implementation needs OAuth callback URLs, token storage table, pull-poll worker, and push-on-mutation hooks. Probably 2-3 PRs.
6. **NEW — Super-admin "login as" / impersonation** (requested 2026-05-20). Surface that lets a super-admin sign in as any customer or staff member to debug, support, or recover an account. Notes for whoever picks this up:
   - **Precondition:** a `super_admin` role above `admin` (the current top of the hierarchy is `admin`). Adds a new value to the role enum + extends `requireRole`.
   - **Mechanism:** Clerk supports session impersonation via its [actor token](https://clerk.com/docs/users/user-impersonation) flow. The super-admin clicks "Sign in as <user>" on an admin page; the API mints an actor token for the target user; the web app exchanges it client-side and the session swaps. Every action under impersonation logs both `actor` (super-admin) and `subject` (the user being impersonated).
   - **Surfaces:** "Sign in as" button on `/admin/clients/:id` and `/admin/staff/:id`. Plus a persistent "Acting as <name> — exit" banner across the app while impersonating.
   - **Audit trail:** every audit-log row written under impersonation needs `actor_id` (super-admin) + `subject_id` (impersonated user) so the trail can't be tampered with after the fact.
   - **Customer accounts:** in MVP, clients authenticate via magic links per Epic 4, not Clerk. Impersonation of a client account therefore goes through a separate "issue magic link → assume session" path, NOT Clerk actor tokens. Will need a dedicated audit-logged endpoint.
   - **Hard gates:** super-admin role is provisioned manually via `scripts/bootstrap-admin.ts` (extended), never self-granted via the admin UI. Impersonation cannot be used on another super-admin.
   - Probably a 3-PR slice: (1) role + audit-log schema + bootstrap script update, (2) API endpoints + actor-token flow + magic-link impersonation for clients, (3) UI buttons + banner + visual treatment.

---

## Pending USER tasks

Same as 2026-04-30-evening handoff §"USER tasks pending" — Cloudflare R2 setup (now consumed by E3-S4c which merged), test data cleanup, Clerk dashboard cleanup. New ones from this session:

- **Re-open the calendar-sync PR** with the ASCII-only `gh pr create` command from the assistant's transcript at the end of this session.
- **Schedule the migration-drift reconciliation** — set aside ~1 hour and decide who drives.

---

## Gotchas accumulated this session

- **`prisma migrate dev` will offer to reset the DB** when migrations applied to the DB don't have files locally. Always run `prisma migrate status` first to spot drift.
- **`gh pr create` em-dash bug** (above).
- **`tsx watch` and `next dev` don't auto-exit** — background-task IDs need explicit `TaskStop` (or process kill) to free ports 3001 / 3002 after a smoke session.
- **`prisma generate` is wired via `apps/api`'s `postinstall` + `build`** — touching `schema.prisma` does NOT auto-regenerate the client during `tsx watch`. If TypeScript can't find a new model after a schema edit, run `pnpm --filter @wellos/api exec prisma generate --schema=../../prisma/schema.prisma`.

---

## How to start the next chat

> Continuing the Wellos project. Read `docs/SESSION-HANDOFF-2026-05-20.md` then follow `docs/000-CLAUDE-session-start-snippet.md`. Memory files load automatically — `project_migration_drift_2026_05.md` is the new one to trust on schema work. Local working location is `H:\Projects\wellos-one`. Then summarize state and propose what's next. **Highest-priority items: confirm the calendar-sync PR was opened (branch `feature/calendar-sync-phase5`, commit `a958bdd`), and start the migration-drift reconciliation.**

---

## TL;DR

- **Shipped:** Epic 7 Phase 5 — read-only staff ICS calendar feed. DB + API + frontend in one commit (`a958bdd`, 13 files, +629 lines) on `feature/calendar-sync-phase5`. Pushed. PR command failed silently on first try; ASCII-title rerun queued.
- **Discovered:** the live Supabase DB has 9 migrations not present in `main`, including one (`add_client_number`) with no file in any branch. Documented as `project_migration_drift_2026_05.md`.
- **Held:** Epic 8 notifications WIP still sitting unstaged on this branch — needs to be moved to its own branch.
- **Verified live:** 4 of 7 browser smoke steps for calendar sync passed (generate, ICS download, regenerate invalidates old, soft-delete hides card). API and Web typecheck + Web ESLint all green.
- **New ask (2026-05-20):** super-admin "Sign in as" / impersonation for customers and staff — added to open items §6 for next session to plan.
- **Next chat:** open the PR, reconcile the drift, then unblock the 7 stacked PRs.
