# Session handoff — Wellos / Wellos Studio (2026-04-30 evening → next)

Big-pivot session. Started as a continuation of Epic 3 (booking engine UI work) and ended with the project on a fundamentally different workflow + a much larger schema landed in production.

Supersedes `docs/SESSION-HANDOFF-2026-04-30.md` (morning handoff covering Epic 2 close-out via Client tags).

---

## Session-start ritual (do this FIRST, before anything else)

Per `docs/000-CLAUDE-session-start-snippet.md`:

1. Read `docs/INFRASTRUCTURE.md` — current state of every service
2. Read `docs/01A-current-build-context.md` — what's safe to build, what's deferred
3. Read **this file** for what shipped 2026-04-30 evening
4. Read `docs/SESSION-HANDOFF-2026-04-30.md` for morning context (Epic 2 close-out)
5. Read the relevant Epic 3 sections: `docs/09-dev-handoff.md` Epic 3 + the four booking spec docs (`04-booking-flow.md`, `04-booking-flow-context.md`, `05-booking-enhancements.md`, `006-booking-design-refresh.md`) + the **canonical UI/UX walkthroughs**:
   - `docs/04-booking UI UX Update/wellos-booking-ui-walkthrough-package/wellos-booking-ui-walkthrough.md` (v1)
   - `docs/04-booking UI UX Update/wellos-booking-ui-walkthrough-v2-notes-package/wellos-booking-ui-walkthrough-v2-notes.md` (v2)
   - `docs/04-booking UI UX Update/wellos_booking_r2_uiux_package/wellos_calendar_booking_r2_uiux_buildout.md` (R2 / media buildout)
6. Read `docs/04-booking UI UX Update/wellos_booking_coverage_matrix.md` — tier mapping for every MVP feature
7. Read `docs/04-booking UI UX Update/wellos_calendar_booking_appointments_features.md` — focused booking/calendar feature inventory
8. Read `CLAUDE.md` — agent conventions, skill routing, hard rules
9. Memory files load automatically. Especially relevant entering E3-S4:
   - `MEMORY.md` (index, always loaded)
   - **NEW** `feedback_db_api_frontend_order.md` — **standing rule** for every feature from now on: ship database → API → frontend, in that order, per feature. Don't ship a frontend slice that needs schema rework later. Established 2026-04-30 evening after the E3-S2 frontend pivot.
   - `feedback_session_workflow.md` — fixed 8-phase session flow
   - `feedback_admin_lists_need_row_actions.md` — every admin list ships with row actions from PR 1
   - `feedback_daily_sweep_review.md` — scan sweep tracker at session start; surface cheap knock-offs
   - `deployed_surface.md` — refreshed with Tier-A schema additions (11 new tables + 14 enums, R2 media model, comm prefs + banned + Appointment.source on existing tables)
   - `project_pre_launch_sweep.md` — new R2 entry: bucket creation + custom domain + env vars are USER tasks
   - `cloudflare_and_storage.md` — R2 is the canonical media backend (existing entry; reaffirmed)

**Local path:** `H:\Projects\wellos-one`. Repo: `wellosapp/wellos-one`. Main at `04849d8` after PR #47.

---

## What we shipped this session (5 PRs total)

| PR | Title | Commit |
|---|---|---|
| #43 | feat(web): admin Client tag CRUD UI + tag picker on ClientForm (E2-S6b) | morning, see prior handoff |
| #44 | docs: session handoff 2026-04-30 + Railway rename + Epic 3 prep | morning |
| #45 | feat(api): admin booking engine — Appointment CRUD + EXCLUDE + availability (E3-S1) | morning, `a142f80` |
| #46 | docs: add booking UI walkthrough spec (v1 + v2-notes packages) | evening, `294c82d` |
| #47 | feat(api): Tier-A schema — client memory + triage + universal R2 media (E3-S3) | evening, `04849d8` |

**Verified live in production at session end:**
- `api.wellos.one/version` → `commit: 04849d8`, booted 2026-05-01T01:25:13Z
- `prisma migrate status` → "6 migrations found, Database schema is up to date!"
- 11 new tables + 14 enums in production Supabase

---

## The pivot — what changed mid-session and why

**Morning:** Started E3-S2 (frontend admin appointment UI) following the standard "incremental shipping" pattern. Built all 4 routes (list, new, detail, week calendar) on `feat/web-appointments-ui`. Smoked end-to-end in browser; appointment created, state machine walked, calendar rendered correctly, EXCLUDE conflict surfaced as expected.

**Then user shared three documents** (`docs/04-booking UI UX Update/`):
1. `wellos-booking-ui-walkthrough-package/` — v1 walkthrough for booking UI (admin/staff/customer detail variants, admin/staff calendar variants, customer time selection, magic-link manage, 8 mockups)
2. `wellos-booking-ui-walkthrough-v2-notes-package/` — v2 addendum focused on the **client-memory note system** (notes from staff/admin/customer must save in client account + link back to appointment + service + author + visibility)
3. `wellos_booking_r2_uiux_package/` — R2 / media spec describing universal `media_assets` table with polymorphic owner, per-tenant R2 buckets, content-as-R2-objects philosophy
4. `wellos_calendar_booking_appointments_features.md` — focused MVP feature inventory for booking/calendar (~150 features across 14 sections)

**Plus a focused features spreadsheet** (`C:\Users\johnn\Downloads\wellos_features_and_benefits_sectioned.xlsx`, 304 rows × 14 sections) covering the entire product, not just booking.

**User's verdict on E3-S2 frontend:** *"redo E3-S2 to match the walkthrough's mockups before any merge"* — the smoked frontend was abandoned. Saved as a snapshot commit (`861fb36`) on `feat/web-appointments-ui` for reference; **never merge that branch**.

**User's standing rule** (memorialized in `feedback_db_api_frontend_order.md`):

> "We need to update the database then API then frontend. This always goes this way. But we need these features because I have to do this because you are missing things as we are going along."

Translation: every feature ships in three sequential PRs (schema → API → frontend), per-feature, no more "ship the foundation now and refactor later."

---

## Schema decisions baked into Tier-A (PR #47)

### What's in Tier A (the memory + triage + universal media layer)

**11 tables:**
- `ClientNote` — 12 categories, alert triggers as Postgres enum array, 5-value visibility, 7 source surfaces, author tri-type (customer/staff/admin/system) with 3 nullable FKs
- `SoapNote` + `SoapNoteRevision` — clinical SOAP with append-only revision history; multiple SOAP per appointment allowed (Q2 decision)
- `ClientNoteAcknowledgment` — append-only alert ack trail
- `ServiceBookingQuestion` + `AppointmentBookingAnswer` — triage with denormalized question snapshot
- `ServiceContentDelivery` — prep/aftercare scheduled deliveries
- **`MediaAsset`** — universal polymorphic owner per the R2 spec §2.6. Owns ALL media (tenant brand, location photos, service docs, staff avatars/videos, client files, appointment uploads, campaign QR codes) in one table with `owner_type` discriminator. `access_class` drives bucket selection.
- `TenantMediaRoot` — per-tenant R2 bucket config (one row per tenant)
- `MediaFolderTemplate` — onboarding seed for folder structure per owner type

**14 enums:** ClientNoteCategory (12), ClientNotePriority, ClientNoteAuthorType (4), ClientNoteSourceSurface (7), ClientNoteVisibility (5), ClientNoteAlertTrigger, ClientNoteAckTriggerContext (4), ServiceBookingQuestionType (7), ServiceContentDeliveryType, ServiceContentDeliveryChannel, AppointmentSource (8), MediaAssetVisibility (3), MediaAccessClass (5), MediaOwnerType (7).

**Existing-table extensions:**
- `Client` gets `smsOptedOut`, `emailOptedOut`, `preferredChannel`, `banned`, `bannedReason`, `bannedAt`
- `Appointment` gets `source` enum + `(tenantId, source, scheduledStartAt)` reporting index

### What's NOT in Tier A (intentional, queued)

| Tier | What |
|---|---|
| Tier B (next schema PR) | BookingHold, WaitlistEntry, Block, AppointmentSeries, BlackoutDate, MagicLinkToken, booking-policy, request-approval state machine extension, location operating hours, settings infrastructure, Consent table |
| Tier C (storefront schema PR) | BookingPageContent, BookingPageTestimonial, BookingLinkCampaign, ProviderAssignmentLog + Tenant.assignmentStrategy, Service/Staff storefront extensions (gallery / slug / long_bio / specialties / etc.) |
| Epic 6 | Stripe — deposits, fees, card-on-file, refunds, ledger, no-show fee engine |
| Epic 8 | BullMQ + TextLink + Postmark — scheduled jobs, SMS/email dispatch, reminders, waitlist auto-promote, aftercare delivery |
| Forms epic | Intake form builder, versioned forms, magic-link form distribution |
| Phase 2 | Multi-service / multi-provider, classes, resource/room allocation, real-time external calendar sync, travel time, auto-waitlist, multi-language |

### Locked Q&A from this session (don't re-debate)

- Q1: `alert_triggers` as Postgres enum array (`ClientNoteAlertTrigger[]`)
- Q2: multiple SOAP notes per appointment (no 1:1 unique on `appointmentId`)
- Q3: separate 3-value `MediaAssetVisibility` (location/provider_only/admin_only) — was `ClientFileVisibility`, renamed during R2 pivot
- Q4: drop `expires_at > NOW()` from partial-index predicate (Postgres rejects volatile functions)
- Q5: keep both `ClientNoteAuthorType` enum + 3 nullable author FKs
- Q6: ship 12 `ClientNoteCategory` values incl. `session` + `customer_request`
- Q7: Zod-only bounds on `ServiceContentDelivery.scheduleOffsetMinutes`
- Q8: append-only customer notes; files attach via `noteId` FK on MediaAsset
- Q11: one audit row per appointment for booking-answer creation
- **R2 pivot:** `ClientFile` → universal `MediaAsset` polymorphic owner per `wellos_calendar_booking_r2_uiux_buildout.md` §2.6
- **Service docs pivot:** drop `prep_instructions_markdown` / `aftercare_markdown` / `what_to_expect_markdown` columns; content lives in R2 markdown files at `services/{id}/docs/`

### Migration mechanics

- Two migrations applied this session:
  1. `20260430221638_tier_a_client_memory_and_triage` — initial Tier-A with narrow `client_files` + Service markdown columns
  2. `20260430225022_tier_a_revise_to_universal_media_assets` — drops both, creates universal `media_assets` + `tenant_media_roots` + `media_folder_templates`
- Hand-edits applied: `alert_triggers` `NOT NULL DEFAULT ARRAY[]::"ClientNoteAlertTrigger"[]`, two partial indexes on `client_notes` (active-not-archived, alert-priority); on revision migration, removed Prisma's `DROP DEFAULT` on `alert_triggers` and duplicate `CREATE INDEX` statements (schema now declares `@default([])` so future migrations don't regress)
- **Process gotcha hit:** stale Prisma node processes from interrupted migrations held the Postgres advisory lock. Symptom: `Error: P1002 Timed out trying to acquire a postgres advisory lock`. Fix: kill all node processes started around the time of the stuck migration (PowerShell `Stop-Process -Id <pid>`), wait ~10s, retry.

### Soft-delete + audit-log integration

- Added to `SOFT_DELETE_MODELS`: `ClientNote`, `MediaAsset`, `SoapNote`, `ServiceBookingQuestion`, `ServiceContentDelivery`
- NOT added (append-only / config): `SoapNoteRevision`, `ClientNoteAcknowledgment`, `AppointmentBookingAnswer`, `TenantMediaRoot`, `MediaFolderTemplate`

---

## Standing rules established this session (memorize)

1. **`feedback_db_api_frontend_order.md`** — every feature ships database → API → frontend, in that order, per feature. Don't combine layers in one PR for non-trivial features. Don't ship a frontend slice that needs schema rework later.

2. **Walkthrough docs are the destination.** When implementing UI for booking/calendar work, the role-aware variants and component breakdown in v1+v2 walkthroughs are the spec. The 12-ticket build order in v1 §10 + v2 §10 is the planned sequencing.

3. **R2 is the canonical media backend.** Every image / video / doc surface uses `media_assets` rows pointing at R2 object keys. Public booking screens never list R2 directly — they call API endpoints that return resolved URLs. Private/protected assets use signed URLs with short TTL after RBAC check.

4. **Service prep / aftercare / what-to-expect content lives in R2 markdown docs**, not DB columns. The doc paths under `services/{serviceId}/docs/` are canonical; the worker `media.renderMarkdownDoc` produces SMS-safe text + email HTML partials from them.

---

## Production state (end of session, post-PR #47)

- **`main`** at `04849d8`
- **Active Railway deploy:** `04849d8`, healthy, `/version` reports the new commit
- **Active Vercel deploy:** `0bb8cd0` for `wellos-web` (last UI PR was #43 on morning); `wellos-studio` unchanged
- **Database (Supabase, prod = dev):** **27 tables** in `public` (was 16 before this evening). 6 Prisma migrations applied total. Schema in sync with `schema.prisma`.
- **Test data:** unchanged from morning session — 1 test client with First-time tag, 3 test client tags, 0 appointments yet (the appointment created during morning E3-S2 smoke was on a separate Vercel preview tied to local dev only)

---

## Open items / what's NEXT

### E3-S4 — Tier-A API surface (next PRs in this sequence)

Now that the schema is in production, the next slice is the typed API. Suggested batching (~6-8 endpoints per PR):

| PR | Endpoints | Notes |
|---|---|---|
| **E3-S4a** ClientNote API | `POST /admin/clients/:id/notes`, `GET /admin/clients/:id/notes` (filter by category/priority/pinned), `PATCH /admin/notes/:id`, `DELETE /admin/notes/:id`, `POST /admin/notes/:id/pin`/`unpin`/`archive`/`unarchive`, `POST /admin/notes/:id/acknowledge` | Mirrors Service/Client CRUD shape; alert triggers + author tri-type need careful Zod handling |
| **E3-S4b** Appointment-linked aggregator | `GET /admin/appointments/:id/linked-records` (notes + booking-answers + media + SOAP), `GET /admin/clients/:id/timeline` (visit timeline) | Read-only joins; no audit needed |
| **E3-S4c** Media + R2 SDK | `POST /admin/media/presign` (signed PUT URL), `POST /admin/media/complete` (writes media_assets row + queues variant worker), `GET /admin/media`, `PATCH /admin/media/:id` (alt text/caption), `DELETE /admin/media/:id`, `POST /admin/media/:id/replace`, `POST /admin/media/:id/regenerate-variants` | New territory — wraps R2 S3-compatible API. Needs R2 env vars set (USER task pending). |
| **E3-S4d** Triage questions + answers | `POST/GET/PATCH/DELETE /admin/services/:id/booking-questions`, `POST /admin/appointments/:id/booking-answers` (batch write), `POST /admin/booking-answers/:id/promote-to-note` | Includes the gating-rule JSONB validation |
| **E3-S4e** Service content deliveries | `POST/GET/PATCH/DELETE /admin/services/:id/content-deliveries` | Simple CRUD |
| **E3-S4f** SOAP notes | `POST/GET/PATCH /admin/appointments/:id/soap-notes`, `POST /admin/soap-notes/:id/lock`, `POST /admin/soap-notes/:id/revise` (creates revision row) | Lock semantics + revision history |
| **E3-S4g** Tenant signup hook | `provisionTenantMediaRoot()` — wired into Clerk webhook for new tenant creation | Backend-only; no frontend |

Each ships its own PR per the DB→API→frontend rule. Do not combine.

### Then E3-S5 — Tier-A frontend

After all Tier-A API PRs land, build the frontend per the walkthrough's 12-ticket sequence:
- Ticket 1: extract shared appointment/calendar primitives (refactor)
- Ticket 2: admin detail re-skin
- Ticket 3: staff variant of detail
- Ticket 4: admin calendar re-skin
- Ticket 5: staff calendar variant
- Ticket 6: customer time selection
- Ticket 7: customer detail / magic-link manage
- Ticket 8: loading / empty / error states
- Tickets 9-12: notes / role composers / booking answers + photos / alerts

Each ticket is its own PR.

### Tier B + Tier C still queued

After Tier A lands end-to-end, repeat the pattern:
- **Tier B schema PR** — booking primitives (BookingHold, WaitlistEntry, Block, AppointmentSeries, BlackoutDate, MagicLinkToken, booking-policy + state-machine extensions, settings tables, Consent)
- **Tier B API PR(s)** — public booking flow, magic-link management, waitlist, calendar block management, settings UI
- **Tier B frontend PR(s)** — public `/book/[tenantSlug]` route tree, magic-link `/book/manage/[token]`, admin block management UI
- **Tier C schema PR** — storefront fields (BookingPageContent, slugs, gallery, long_bio, BookingLinkCampaign, ProviderAssignmentLog, assignment strategy)
- **Tier C API + frontend** — branded booking page editor, direct-link/QR/embed setup, provider/service profile sheets

### USER tasks pending (no rush)

1. **Cloudflare R2 setup** — create `wellos-files-prod` bucket + scoped API token + custom domain (`files.wellos.one`) + CORS rule for `app.wellos.one`. Add env vars to Railway: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`. Tracked in `project_pre_launch_sweep.md`. Needed before E3-S4c (Media API) ships.
2. **Test data cleanup** — Test client + 3 client tags + 1 deleted tag from prior smokes, plus the test client/services/staff from earlier today
3. **Clerk dashboard cleanup** (~15 min, unchanged from morning handoff)

---

## Stack pins (don't substitute without asking)

Unchanged from morning. Restated:
- **Node 20.x** (engines.node capped at <21 per PR #33)
- pnpm 10 · TypeScript strict · Fastify 5.0.0 · Next.js 14 App Router · React 18.3.1
- Prisma 5.22.0 · `@clerk/nextjs` 6.x · `@clerk/fastify` 1.x · `zod` · `svix`
- Tailwind 3.x · Postgres via Supabase pooler 6543 / session pooler 5432 (`DIRECT_URL`)
- Upstash Redis · Postmark · `date-fns-tz` (booking time math)
- **NEW (Tier A):** Cloudflare R2 (S3-compatible) for all media; per-tenant bucket prefix
- Sentry · PostHog · BetterStack · GH Actions

---

## Gotchas accumulated this session

- **Prisma 5 advisory lock can stick** after an interrupted `migrate dev` — symptom: `P1002 Timed out trying to acquire a postgres advisory lock`. Fix: kill the stale Node process(es) holding the lock via PowerShell, wait ~10s, retry.
- **Prisma's auto-diff for partial indexes is wrong** — Prisma can't express partial indexes in its schema syntax, so when re-diffing it'll emit duplicate `CREATE INDEX` statements without DROPs. Hand-remove them from the migration or you'll get "index already exists" errors at apply time.
- **Prisma drops `DEFAULT` on enum-array columns** — even when the schema has `@default([])`, generated migrations sometimes emit `ALTER COLUMN "x" DROP DEFAULT` against an existing default. Add the `@default([])` declaration explicitly to the schema AND hand-remove the DROP in the migration if it appears.
- **Universal polymorphic owner relations need disambiguation in Prisma** — when one model has multiple FKs pointing at the same parent (e.g. `MediaAsset.tenantId` for multi-tenant scope + `MediaAsset.tenantOwnerId` for "tenant is the polymorphic owner"), give them distinct `@relation` names and matching inverse names on the parent.
- **`gh pr checks --watch --fail-fast` exits on Vercel preview failures** — the Vercel preview deploys are expected-fail (git identity issue), but `--fail-fast` treats any failed check as terminal. Use `gh run watch <run-id> --exit-status` to follow only the CI workflow.

---

## How to start the next chat

Paste this to seed the next session (after `cd H:\Projects\wellos-one`):

> Continuing the Wellos project. Read `docs/SESSION-HANDOFF-2026-04-30-evening.md` then follow `docs/000-CLAUDE-session-start-snippet.md`. Memory files load automatically — trust them, especially `feedback_db_api_frontend_order.md` (the standing rule that every feature ships database → API → frontend in that order, per feature) and `feedback_session_workflow.md`. Local working location is `H:\Projects\wellos-one`. Then summarize state and propose what's next. **Tier-A schema is in production; the next major work is E3-S4 — Tier-A API surface (one PR per logical endpoint group).**

---

## TL;DR for the next session

- **5 PRs merged today across morning + evening:** Client tags UI, morning handoff, booking engine schema (E3-S1), walkthrough spec docs (#46), Tier-A schema (#47).
- **The big shift this session:** adopted the database → API → frontend per-feature workflow rule, abandoned the E3-S2 frontend snapshot, adopted the walkthrough docs + R2 spec as canonical UX/UI source of truth.
- **Tier-A schema is in production:** 11 new tables + 14 enums; universal polymorphic `media_assets` table for R2; client memory + triage + content delivery + SOAP notes + comm preferences + banned flag + Appointment.source.
- **`main` at `04849d8`**, `api.wellos.one/version` confirms it.
- **GitHub state:** clean — 0 open PRs (after #47 merged), all CI green, branch auto-delete + squash-only enforced.
- **Next major piece: E3-S4 — Tier-A API surface** (~6-8 separate PRs by endpoint group). After that: E3-S5 frontend per the 12-ticket walkthrough sequence. Then Tier B + Tier C repeat the same DB→API→frontend pattern.
- **USER blocker for E3-S4c:** R2 bucket + custom domain + env vars need to be provisioned before the Media API can be smoked.
