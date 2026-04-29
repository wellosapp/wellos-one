# Session handoff — Wellos / Wellos Studio (2026-04-29 evening → next)

Continuing the Wellos build. **Big session — 7 PRs merged.** Epic 1 declared closed. Epic 2 sub-steps 1, 2, 3a, and 3b all shipped end-to-end with the admin Client CRUD validated against real production data + audit log. **Two hotfixes** caught after first browser test (the price of an auto-mode session that didn't exercise the UI in a browser before merging).

Supersedes `docs/SESSION-HANDOFF-2026-04-29.md` (which was written at the start of this session, before any code).

---

## Session-start ritual (do this FIRST, before anything else)

Per `docs/000-CLAUDE-session-start-snippet.md`:

1. Read `docs/INFRASTRUCTURE.md` — current state of every service
2. Read `docs/01A-current-build-context.md` — what's safe to build, what's deferred, hard rules
3. Read **this file** for what shipped 2026-04-29
4. Read `docs/SESSION-HANDOFF-2026-04-29.md` (start-of-day) for context entering this session
5. Read the relevant Epic section of `docs/09-dev-handoff.md` (Epic 2 if continuing CRUD work)
6. Read `CLAUDE.md` — agent conventions, skill routing, hard rules
7. Memory files load automatically. Especially:
   - `MEMORY.md` (index, always loaded)
   - `deployed_surface.md` — current production state including E2-S1 schema + E2-S3a endpoints
   - `project_pre_launch_sweep.md` — pre-launch tracker
   - **`feedback_powershell_cd_prefix.md`** — always lead PowerShell snippets with `cd H:\Projects\wellos-one`
   - **`feedback_pr_creation_blocked.md`** — `gh pr create` is harness-blocked despite user approval (status as of mid-session — actually got allowed later in the day after the user kept saying yes; treat per-PR auth as needed)
   - **`project_migrations_apply_locally.md`** — `prisma migrate dev` IS the production migration application
   - **`project_single_db_dev_eq_prod.md`** — staging deferred, dev = prod
   - `feedback_offer_to_push.md`, `feedback_secrets_rotation_pre_launch.md`

**Local path: `H:\Projects\wellos-one`**. Repo: `wellosapp/wellos-one`. Main at `729a3c4` after PR #29.

---

## What we shipped this session

| PR | Sub-step / fix | Title | Commit |
|---|---|---|---|
| #24 | E2-S1 | feat(schema): clients/staff/services foundation | `6b726f7` |
| #25 | E2-S2 | feat(api): Prisma soft-delete client extension | `46f96e5` |
| #26 | E2-S3a | feat(api): admin Client CRUD endpoints + Zod + audit | `7fb25d1` |
| #27 | E2-S3b | feat(web): admin Client CRUD UI (forms + server actions) | `d5eed1c` |
| #28 | hotfix | fix(web): use react-dom useFormState (React 18) not useActionState (React 19) | `9592381` |
| #29 | hotfix | fix(web): wire includeDeleted searchParam through to listClients | `729a3c4` |

Plus: deleted accidental Railway project `scintillating-smile` (auto-created when GitHub App was installed; never deployed anything).

**Verified live in production 2026-04-29:**
- `api.wellos.one/admin/clients` — POST/GET/PATCH/DELETE all return 401 unauthenticated (route chain intact)
- `app.wellos.one/admin/clients` — full UI renders for admin, list / detail / new / edit / soft-delete all work
- Real test client created, edited, soft-deleted via the UI
- `audit_log` table has `client.created` and `client.deleted` rows with correct `actor_user_id` (Johnathan Carlson)
- `?includeDeleted=true` surfaces soft-deleted rows in the list with amber "Including soft-deleted" banner

---

## Schema decisions baked in by E2-S1

Per `docs/09-dev-handoff.md` "Epic 2", with user-confirmed choices:

| Choice | Decision |
|---|---|
| `Client.address` | Structured columns (`addressLine1`, `addressLine2`, `city`, `state`, `postalCode`, `country`) |
| Emergency contact | Two flat columns (`emergencyContactName`, `emergencyContactPhone`) |
| `Client.intakeStatus` | New `ClientIntakeStatus` enum: `pending` / `sent` / `completed` / `expired` |
| `StaffService` (M2M) | Pure join, no override columns |
| Money on Staff | Integer cents (`hourly_rate_cents`); commission as `Decimal(5,2)` percentage |
| Money on Service | Integer cents (`base_price_cents`) |
| Color (Service / ClientTag) | Hex string at the DB layer; UI maps to design tokens |
| Working hours on Staff | JSONB for MVP; normalized table is Phase 2 |

6 new tables (`clients`, `staff`, `services`, `staff_services`, `client_tags`, `client_tag_assignments`) + 1 enum (`ClientIntakeStatus`). Total tables now 15 + `_prisma_migrations` = 16 in `public` schema.

---

## Soft-delete extension (E2-S2)

`apps/api/src/db/softDelete.ts` is a Prisma client extension that auto-injects `deletedAt: null` into the top-level `where` of read queries on any model with a `deletedAt` column.

**Read ops intercepted:** `findMany`, `findFirst`, `findFirstOrThrow`, `count`, `aggregate`, `groupBy`.

**NOT intercepted (intentional):**
- `findUnique` / `findUniqueOrThrow` — they require unique-where; webhook flows (Clerk re-signup undelete) intentionally use `findUnique` to see soft-deleted rows
- `update`, `delete`, `*Many` mutations — narrow surface; revisit when needed

**Opt-out:** include any `deletedAt` clause in `where`. Examples:
```ts
prisma.client.findMany({ where: { deletedAt: { not: null } } }) // only soft-deleted
prisma.client.findMany({ where: { deletedAt: undefined } })     // live + deleted (audit / reports)
prisma.client.findMany()                                        // default — only live rows
```

Models covered: `Tenant`, `Location`, `User`, `Role`, `TenantFeatureFlag`, `Client`, `Staff`, `Service`, `ClientTag`.

Type aliases exported from `apps/api/src/db/client.ts`:
- `ExtendedPrismaClient` — the extended client itself
- `ExtendedTransactionClient` — the tx callback param. Bare `Prisma.TransactionClient` no longer matches once the client is extended; use this for any helper that takes a tx (e.g. audit-log writers).

---

## Admin Client CRUD (E2-S3a + E2-S3b)

### Backend (E2-S3a)

`apps/api/src/routes/admin/clients.ts` — 5 endpoints under `/admin/clients`, all gated by `requireRole.admin`:

| Method | Path | Returns |
|---|---|---|
| `POST` | `/admin/clients` | 201 `{ client, duplicateWarning }` |
| `GET` | `/admin/clients` | 200 `{ clients, total }` with `q`, `intakeStatus`, `take`, `skip`, `includeDeleted` |
| `GET` | `/admin/clients/:id` | 200 `{ client }` or 404 |
| `PATCH` | `/admin/clients/:id` | 200 `{ client, duplicateWarning }` or 404 |
| `DELETE` | `/admin/clients/:id` | 204 (soft delete) or 404 |

Validation: Zod (`apps/api/src/schemas/client.ts`). Service layer: `apps/api/src/services/clientService.ts` — pure DB + audit log writes inside `$transaction`. Tenant scoping happens at the service layer (every query passes `tenantId` from `request.currentUser.tenantId`).

Duplicate detection: on create + on email/phone change via update. Returns `duplicateWarning` field; never blocks. UI gates user via "save again to confirm".

Audit log: `client.created` / `client.updated` / `client.deleted` rows written with `actorType=user`, `actorUserId=request.currentUser.id`. Writes happen in the same `$transaction` as the mutation.

### Frontend (E2-S3b)

| Path | Component |
|---|---|
| `/admin` | Landing page (links to clients) |
| `/admin/clients` | List with `q` search, `intakeStatus` filter, offset pagination, `includeDeleted` flag |
| `/admin/clients/new` | Create form |
| `/admin/clients/:id` | View + edit form, soft-delete button |

**Architecture:** Server components fetch from our own Fastify API at `api.wellos.one` using the user's Clerk session token. Server actions handle form submission (`createClientAction`, `updateClientAction`, `deleteClientAction`). Single source of truth (api enforces validation, audit, tenant scoping); UI is dumb.

**Files:**
- `apps/web/lib/api/client.ts` — server-side `apiFetch()` wrapper using `auth().getToken()`
- `apps/web/lib/api/clients.ts` — type-safe wrappers per endpoint
- `apps/web/app/admin/clients/_actions.ts` — server actions
- `apps/web/app/admin/clients/ClientForm.tsx` — shared client component for new + edit (`useFormState` from `react-dom`, NOT `useActionState` from `react`)
- `apps/web/app/admin/clients/{page,new/page,[id]/page}.tsx` — server components

**Styling:** intentionally minimal inline styles, mirroring `apps/web/app/dashboard/page.tsx`. Design system bootstrap (Tailwind + tokens from `10-design-system-buildout.md`) is its own focused PR — admin UI gets re-skinned then.

---

## Hotfix lessons learned

**Lesson #1: useActionState is React 19 only.** Next.js 14 ships a React 18 canary. `useActionState` from `'react'` doesn't exist there; `useFormState` from `'react-dom'` is the equivalent. tsc accepted the bad import because canary types declare `useActionState`, but runtime crashed with "Something went wrong" via `error.tsx`. PR #28.

**Lesson #2: Auto-mode shipping without a browser test catches 1-2 bugs.** Both hotfixes (#28, #29) were found within minutes of the first manual click. For UI-heavy PRs in future sessions, do the manual smoke BEFORE asking for merge — or accept that a follow-up hotfix is part of the cost. Worth adding `pnpm dev` smoke to the verification checklist, even if Clerk auth makes local testing awkward.

**Lesson #3: The harness blocks `gh pr merge` per-PR.** Even after explicit user authorization to merge several PRs in a row, each subsequent merge needs fresh authorization. The pattern: ask, wait, merge.

---

## Production DB state (end of session 2026-04-29 evening)

- 1 Tenant: `Wellos` (slug `wellos`)
- 1 Location: `Wellos`
- 2 Users: `johnathan.carlson@me.com` (admin) + `johnathan.mericamarketing@gmail.com` (orphan, scheduled for deletion)
- 1 RoleAssignment: johnathan.carlson@me.com → admin → wellos tenant
- 19 FeatureFlags seeded, 3 Roles seeded
- 1 Client: `Test Client` (`cmoji5ee80002nywwysnuot8r`) — soft-deleted (`deleted_at` populated)
- AuditLog: 2 client.* rows (one create, one delete) + the original Epic 1 user/tenant/role rows

---

## What's still deferred (do NOT assume wired)

Hard rules from `docs/01A-current-build-context.md` §4 — unchanged:
- Stripe (Epic 6)
- TextLink (Epic 8)
- Postmark webhooks (Epic 8)
- BullMQ worker on Railway (Epic 8)
- Staging environments
- Branch protection on `main`
- Tailwind / shadcn / design system bootstrap
- Vitest setup (test scripts are placeholders)

Active items in `project_pre_launch_sweep.md` — same as start of day, plus:
- **`Test Client` row in production** (soft-deleted from manual e2e test). Hard-delete or restore + reuse during E2-S4 testing. Cosmetic.

---

## What's NEXT

### Option A — E2-S4 backend Service CRUD
Smaller than E2-S3 since the playbook is set. Mirror E2-S3a:
- Zod schemas for `create`/`update`/`list query`
- Service layer with audit log
- 5 endpoints under `/admin/services`
- No duplicate-warning needed (services don't have email/phone)

### Option B — E2-S5 backend Staff CRUD
Slightly larger because of the working-hours JSON editor. Would also need a way to manage `StaffService` M2M assignments — could be inline on staff edit, or separate page.

### Option C — Wire admin UI with design system bootstrap
Stop adding admin surfaces in inline styles; install Tailwind + shadcn/ui per `docs/10-design-system-buildout.md`, re-skin `/admin/*` once. Then E2-S4 + E2-S5 ship pretty.

### Option D — Catch up on observability + sweep items
Some accumulated debt:
- 3 misrouted Sentry events in `wellos-api` to clear
- Railway project still named `diligent-achievement` (rename to `wellos-prod`)
- Two-Clerk-app drift to consolidate
- Clerk widget needs design pass + custom email sender via Postmark
- Local-dev `apps/api/.env` Clerk dev key gap
- Prisma 6+ install path investigation (currently blocking cuid2 migration)

**Recommendation:** Option A or B if pushing forward on Epic 2 features. Option C if you want the next admin surface to look right out of the gate. Option D if a "rest day" of polish feels right after a marathon session.

---

## Pending USER tasks (no rush, do anytime)

1. **Edit Johnathan in Clerk dashboard → save** — re-fires `user.updated` webhook to fix stale `first_name = "John"` in DB (Clerk source of truth says "Johnathan").
2. **Delete John Carson from Clerk** (the second test user with Erica's number) — safe per sub-step 6 verification.
3. **Hard-delete or restore the Test Client** soft-deleted row from manual e2e (cosmetic).
4. **Clerk dashboard cleanup batch** (~15 min):
   - Rename Clerk app `wellos-web` → `Wellos`
   - Disable Apple/Facebook/Google + phone sign-in (drift from §3.6)
   - Decide on the two-Clerk-apps drift (consolidate or update §3.6)
5. **Cosmetic, no rush:**
   - Rename Railway project `diligent-achievement` → `wellos-prod`
   - Delete old OneDrive copy of the repo when comfortable

---

## Stack pins (don't substitute without asking — see CLAUDE.md §3)

- Node 20 LTS · pnpm 10 · TypeScript strict
- Fastify 5.0.0 (api) · Next.js 14 App Router (web, studio)
- **React 18.3.1** (Next 14 ships React 18 canary at runtime — `useActionState` does NOT exist; use `useFormState` from `react-dom`)
- **Prisma 5.22.0** (Prisma 6 has pnpm-10 workspace auto-install bug; 7 broke schema-based datasource)
- **`@clerk/nextjs` 6.x** (frontend) · **`@clerk/fastify` 1.x** (backend)
- **`zod`** for backend validation (added this session) · **`svix`** for webhook HMAC
- Prisma → Postgres via Supabase (pooler 6543 for runtime; session pooler 5432 for `DIRECT_URL`)
- Upstash Redis (TCP URL for BullMQ when added)
- Postmark (sending domain `mail.wellos.one`)
- Sentry · PostHog · BetterStack
- GitHub Actions: `actions/checkout@v6`, `actions/setup-node@v6`, `pnpm/action-setup@v5`

---

## Gotchas accumulated this session

- **Next.js typed routes break tsc on fresh route additions until `.next/` is cleared.** `apps/web/.next/types/` is generated by `next dev` / `next build`; tsc reads it. After adding new routes, either `rm -rf apps/web/.next` before `pnpm typecheck` locally, or accept that CI (which always starts clean) will be the first place typecheck passes.
- **Server actions calling our API need the user's Clerk session token explicitly.** `apps/web/lib/api/client.ts` uses `auth().getToken()` to attach a Bearer header. Don't accidentally call `apiFetch` from a route handler that doesn't have the request context.
- **`auth.protect()` on Clerk dev keys can return 404 instead of redirect on direct deep-link in browser.** Per `INFRASTRUCTURE.md` §9.10. Bootstrap by visiting `/` first to drop the dev-browser cookie, then navigate to protected route. Goes away when we flip to `pk_live_*` at Epic 11.
- **`prisma format` reformats existing whitespace** — schema PR diffs may include trivial cosmetic changes alongside the actual additions. Acceptable; the formatter is canonical.
- **Pino logs swallowed under `pnpm -r --parallel dev`** — already known; run `pnpm --filter @wellos/api dev` in its own terminal to see api logs.
- **Two orphan node processes hogged port 3001 during smoke testing** — `pkill -f "tsx watch"` doesn't kill Windows node processes; use `taskkill //PID <pid> //F` after `netstat -ano | grep "3001"`.

---

## How to start the next chat

Paste this to seed the next session (after `cd H:\Projects\wellos-one`):

> Continuing the Wellos project. Read `docs/SESSION-HANDOFF-2026-04-29-evening.md` then follow `docs/000-CLAUDE-session-start-snippet.md` (read INFRASTRUCTURE.md, 01A, the relevant section of 09-dev-handoff.md, CLAUDE.md). Memory files load automatically — trust them. Local working location is `H:\Projects\wellos-one`. Then summarize state and propose what's next.

---

## TL;DR for the next session

- **7 PRs merged** this session (#24-#29 plus #23 docs from morning)
- Epic 1 declared closed; Epic 2 sub-steps 1, 2, 3a, 3b shipped
- Admin Client CRUD live + validated end-to-end at `app.wellos.one/admin/clients`
- 6 new DB tables, soft-delete extension, audit log all proven in production
- 2 hotfixes shipped same session for issues caught on first manual click — auto-mode without a browser smoke costs ~1 follow-up PR per UI-heavy slice
- **Next:** E2-S4 (Service CRUD) or E2-S5 (Staff CRUD), OR design system bootstrap before more admin surfaces, OR catch up on sweep items
- **GitHub state:** clean — 0 open PRs, all CI green, branch auto-delete + squash-only enforced
