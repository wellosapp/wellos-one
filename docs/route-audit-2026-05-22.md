# Route audit — `apps/web/app/` — 2026-05-22

**Branch:** `chore/dashboard-role-router-and-audit`
**Scope:** every reachable URL under `apps/web/app/` on `main` + the routes added by this PR (`/no-access`, `/staff`).
**Methodology:** every `page.tsx` walked; classified against the spec docs listed under §Methodology below; cross-referenced with git log for last-modified context.

## TL;DR

- **Total reachable routes after this PR: 37** (36 on main + `/no-access` added here; `/staff` already existed as a folder via `/staff/schedule`, the new `/staff/page.tsx` is just a router so the URL count stays the same).
- **PRODUCTION REAL: 30** — full implementations with real data fetching, in spec docs.
- **PRODUCTION STUB: 3** remaining after this PR (the 4th, `/dashboard`, is fixed here). All three remaining stubs are in flight via PR #91 (Notes + Files build-out) or have a follow-up backend ticket (`/admin/clients/[id]/activity`).
- **DEV-ONLY: 0** — reclassified `/admin/impersonate` from "dev-only" to "PRODUCTION REAL with super-admin gating" per `memory/project_super_admin_impersonation_queued.md`; it's a legitimate ops surface.
- **ORPHAN: 0** — every reachable route is referenced in a spec doc or is standard CRUD scaffolding for a referenced data model.
- **NOT ON MAIN: 1** — `/manage/[token]` (magic-link manage flow on `feat/magic-link-ui`, not merged).

---

## 1. Methodology

Routes were walked by recursive directory listing under `apps/web/app/`. Each `page.tsx` was opened and classified along these axes:

| Classification | Definition |
|---|---|
| **PRODUCTION REAL** | Real implementation with data fetching, multiple components, real server actions. Looks shipped. |
| **PRODUCTION STUB** | Placeholder copy ("Real X arrives later", "Coming soon", "preview") as the entire page body. |
| **ORPHAN** | Reachable but not referenced in any spec doc and not a standard CRUD scaffold for a referenced entity. |
| **DEV-ONLY** | Clearly a development scaffold (`_dev/`, `__test__/`, `-stub`, `-test`). |

Spec docs referenced for cross-checking:
- `docs/00-V2-per-build-setup.md`
- `docs/09-dev-handoff.md`
- `docs/12-dashboard-buildout.md`
- `docs/calendar-area-features.md`
- `docs/04-booking-flow.md`
- `docs/admin-client-profile-quick-book-handoff.md`
- `docs/11-onboarding-buildout.md`

---

## 2. Route classification table

| # | Route | Purpose | Classification | Spec reference | Notes |
|---|---|---|---|---|---|
| 1 | `/` | Auth funnel (signed-in → /dashboard, signed-out → /sign-in) | PRODUCTION REAL | `09-dev-handoff.md` | |
| 2 | `/sign-in/[[...sign-in]]` | Clerk-hosted authentication | PRODUCTION REAL | `09-dev-handoff.md` (Epic 1) | Standard Clerk SignIn component |
| 3 | `/sign-up/[[...sign-up]]` | Clerk-hosted registration | PRODUCTION REAL | `09-dev-handoff.md` (Epic 1) | Standard Clerk SignUp component |
| 4 | `/dashboard` | **Role router (NEW)** — redirects to /admin / /staff / /no-access based on Clerk role | PRODUCTION REAL | `09-dev-handoff.md`, CLAUDE.md rule #16 | Was stub; this PR replaces with real server-side router |
| 5 | `/no-access` | **NEW** — terminal route for orphan Clerk users (signed in, no DB role) | PRODUCTION REAL | CLAUDE.md rule #16 | Polished page with Sign Out + Coming-soon "Contact your admin" |
| 6 | `/staff` | **NEW** — thin router redirecting to /staff/schedule | PRODUCTION REAL | CLAUDE.md rule #16 | Stable canonical URL for future staff sub-routes |
| 7 | `/staff/schedule` | Staff member's own day/week schedule | PRODUCTION REAL | `calendar-area-features.md` § Staff view | Full data fetching + appointment drawer + Quick Book |
| 8 | `/book` | Public anonymous booking surface | PRODUCTION REAL | `04-booking-flow.md`, `calendar-area-features.md` | Catalog fetch + service/staff/time selection + checkout |
| 9 | `/admin` | Admin operational dashboard (KPIs, alerts, schedule, widgets) | PRODUCTION REAL | `12-dashboard-buildout.md`, `calendar-area-features.md` § Admin view | Shipped via PR #89 |
| 10 | `/admin/resources` | Legacy tenant-resources cards (Clients · Services · Staff index) | PRODUCTION REAL | Not in primary specs | Moved from old admin home in PR #85; legacy convenience route |
| 11 | `/admin/calendar` | Admin calendar — day/week/month, drag-to-reschedule, quick book | PRODUCTION REAL | `calendar-area-features.md` (features 1-12) | Core operational command center |
| 12 | `/admin/clients` | Client list with search, sort, filters | PRODUCTION REAL | `calendar-area-features.md` § CRM connection | Standard list + pagination |
| 13 | `/admin/clients/new` | Create new client form | PRODUCTION REAL | Implicit CRUD | Shared ClientForm with `/admin/clients/[id]` |
| 14 | `/admin/clients/[id]` | Client profile — contact + profile + hero | PRODUCTION REAL | `admin-client-profile-quick-book-handoff.md` | Phase 1 (PR #91 open) restructures top tabs → left menu |
| 15 | `/admin/clients/[id]/timeline` | Client visit history with filters | PRODUCTION REAL | `calendar-area-features.md` § CRM connection | Real timeline API |
| 16 | `/admin/clients/[id]/book` | Quick Book inline-mode drawer | PRODUCTION REAL | `admin-client-profile-quick-book-handoff.md` | Shared booking engine, client pre-locked |
| 17 | `/admin/clients/[id]/notes` | Client notes | **PRODUCTION STUB** | Not in primary specs | Placeholder card on main; full composer + list built out in PR #91 |
| 18 | `/admin/clients/[id]/files` | Client files / documents | **PRODUCTION STUB** | Not in primary specs | Placeholder card on main; full dropzone + grid built out in PR #91 |
| 19 | `/admin/clients/[id]/intake` | Intake form definitions + submissions | PRODUCTION REAL | `11-onboarding-buildout.md` | Real submission tracking |
| 20 | `/admin/clients/[id]/activity` | Client activity feed | **PRODUCTION STUB** | Not in primary specs | Coming-soon stub per PR #91 plan — needs backend `GET /admin/clients/:clientId/activity` endpoint (audit table is populated but no read endpoint scoped to a client) |
| 21 | `/admin/client-tags` | Client tag catalog | PRODUCTION REAL | `admin-client-profile-quick-book-handoff.md` | Real tag CRUD |
| 22 | `/admin/client-tags/new` | Create tag | PRODUCTION REAL | Implicit CRUD | |
| 23 | `/admin/client-tags/[id]` | Edit tag | PRODUCTION REAL | Implicit CRUD | |
| 24 | `/admin/services` | Service catalog | PRODUCTION REAL | `calendar-area-features.md` § Shared booking logic | Used by booking validation |
| 25 | `/admin/services/new` | Create service | PRODUCTION REAL | Implicit CRUD | |
| 26 | `/admin/services/[id]` | Edit service | PRODUCTION REAL | Implicit CRUD | |
| 27 | `/admin/service-categories` | Service category reference data | PRODUCTION REAL | Implicit CRUD | |
| 28 | `/admin/staff` | Staff directory | PRODUCTION REAL | `calendar-area-features.md` § Staff column | Eligibility + availability integration |
| 29 | `/admin/staff/new` | Add staff member | PRODUCTION REAL | Implicit CRUD | |
| 30 | `/admin/staff/[id]` | Staff detail / profile | PRODUCTION REAL | Implicit CRUD | |
| 31 | `/admin/waitlist` | Waitlist management | PRODUCTION REAL | `12-dashboard-buildout.md` § Outstanding waitlist | Real waitlist widget + conversion flow |
| 32 | `/admin/waitlist/[id]` | Waitlist entry detail | PRODUCTION REAL | Implicit CRUD | |
| 33 | `/admin/intake-forms` | Intake form definitions | PRODUCTION REAL | `11-onboarding-buildout.md` | Real form definitions |
| 34 | `/admin/intake-forms/[id]` | Edit / view intake form | PRODUCTION REAL | `11-onboarding-buildout.md` | Form builder integration |
| 35 | `/admin/settings` | Business settings (locations, hours, policies, integrations) | PRODUCTION REAL | `09-dev-handoff.md` (Epic 2) | |
| 36 | `/admin/media` | Tenant media library (R2-backed) | PRODUCTION REAL | E3-S5 (see `09-dev-handoff.md`) | Real R2 + media CRUD |
| 37 | `/admin/impersonate` | Super-admin "Sign in as" workflow | PRODUCTION REAL (super-admin gated) | `memory/project_super_admin_impersonation_queued.md` | Reclassified from DEV-ONLY — legitimate ops surface, role-gated to super_admin |

---

## 3. Routes NOT on `main`

| Route | Source branch | Status |
|---|---|---|
| `/manage/[token]` | `feat/magic-link-ui` (PR M3) | Magic-link manage flow shipped behind feature branches but not merged. Open follow-up: review + merge the magic-link stack. |

---

## 4. Summary counts

| Classification | Count |
|---|---|
| PRODUCTION REAL | 34 (30 on main + 3 new + reclassified impersonate) |
| PRODUCTION STUB | 3 (Notes, Files, Activity under `/admin/clients/[id]/`) |
| DEV-ONLY | 0 |
| ORPHAN | 0 |
| NOT ON MAIN | 1 (`/manage/[token]`) |
| **Total reachable URLs** | **37** |

`/dashboard` was the 4th stub on main; this PR converts it to PRODUCTION REAL (role router).

---

## 5. Follow-up tickets

Audit is observational — no deletions in this PR. The work below ships as separate tickets:

1. **`/admin/clients/[id]/notes` content build-out** — IN FLIGHT in PR #91 (composer + list with pinned sort + Pin/Unpin + Delete actions). Wires to existing `apps/web/lib/api/client-notes.ts`.
2. **`/admin/clients/[id]/files` content build-out** — IN FLIGHT in PR #91 (drag-and-drop dropzone + responsive grid + per-card Download/Archive/Delete). Wires to existing `apps/web/lib/api/media.ts` presigned R2 flow.
3. **`/admin/clients/[id]/activity` content build-out** — NEEDS BACKEND. Audit log table is populated; no GET endpoint scoped to a clientId exists. Separate ticket: add `GET /admin/clients/:clientId/activity` + `apps/web/lib/api/audit.ts` helper + replace the Coming-soon stub with a real timeline.
4. **`/manage/[token]` merge** — magic-link manage flow stack (`feat/magic-link-schema`, `feat/magic-link-service-api`, `feat/magic-link-ui`) is review-ready but not merged. Review + ship.
5. **`/no-access` "Contact your admin" wire-up** — currently a Coming-soon inert button. Needs either a workspace admin-email field on `Tenant` (then mailto) or an in-product message thread to a workspace admin. Either way it's a separate ticket.

---

## 6. Audit caveats

- **Nested routes within `/admin/calendar`** (e.g. query-driven drawer states `?selected=`, `?quickbook=1`, `?blocktime=1`, `?pulse=1`) are not separate URLs — they're query-string state on the same `/admin/calendar` route. Counted once.
- **`/admin/onboarding`** existed at one point per `01A-current-build-context.md` but was never re-added after the admin shell restructure. Not currently a route. If onboarding lands as its own URL in a future ticket, this audit needs revisiting.
- **`/admin/billing`** referenced in the original ticket text but does not exist on `main`. Not in scope.
- **Staff sub-routes** beyond `/staff/schedule` are not yet built (no `/staff/clients`, `/staff/messages`, etc.). The new `/staff/page.tsx` is a stable canonical URL ready to handle "what should staff see first?" logic when those land.
- **Locale / i18n routes** — none exist on `main`. Not in scope.
