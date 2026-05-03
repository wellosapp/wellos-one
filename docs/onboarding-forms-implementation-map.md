# Onboarding & Forms — Implementation Map

**Purpose:** Consolidated parity checklist for **tenant onboarding** (business signup wizard) and **first-party forms** (intake, e-sign, service-linked flows), aligned with repo specs and epics. This mirrors the structure of [`staff-booking-implementation-map.md`](./staff-booking-implementation-map.md).

---

## Canonical sources

| Document | Role |
| --- | --- |
| [`onboarding-forms-write-up.md`](./onboarding-forms-write-up.md) | **Canonical** product narrative — sections 1–12 (product goal through framing); cross-references buildout §6 analytics / §11 sign-off via sections **10–11** of the write-up. |
| [`11-onboarding-buildout.md`](./11-onboarding-buildout.md) | Implementation spec: `OnboardingDraft`, steps 1–6, tickets **O-1–O-5**, §6 Analytics events, §11 Sign-off. |
| [`09-dev-handoff.md`](./09-dev-handoff.md) | **Epic 2** (client/staff/service CRUD foundation), **Epic 5** (forms engine + e-sign). |
| [`mindbody-rebuild-master-spec.md`](./mindbody-rebuild-master-spec.md) | Part **5.7** — Forms, waivers, SOAP notes (platform vision). |
| [`MISSING-DOCS.md`](./MISSING-DOCS.md) | **`02-onboarding-flow.md`** — UX spec paired with `11-onboarding-buildout.md`; still pending export per that index. |

**Program stance:** Full parity with every row below is **incremental**. Clerk sign-up and admin surfaces exist; the **dedicated multi-step onboarding wizard**, **OnboardingDraft** persistence, and **Epic 5 form builder** are largely **not** shipped as of this audit. Do not treat any checklist as “complete” until status is updated with evidence (routes, migrations, tests).

---

## Consolidated parity

**Status key:** **Done** | **Partial** | **Not started**

### A — Business onboarding (`11-onboarding-buildout.md` tickets / flows)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 1 | Draft create + token (`POST /draft`, persistence) | **Not started** | No `OnboardingDraft` flow located under `apps/web` / `apps/api` onboarding module. |
| 2 | Steps 1–3 — business info, hours, categories (`PUT /draft`) | **Not started** | Studio plan lists Phase 3 “business onboarding”; implementation not wired as described in §4 tickets O-1–O-2. |
| 3 | Step 4 — owner account + transactional `POST /complete` | **Not started** | Clerk handles identity; **not** equivalent to doc’s password + `completeOnboarding` transaction block. |
| 4 | Step 5 — team invites + permissions | **Not started** | — |
| 5 | Step 6 — completion screen + dashboard nudges (`UserNudge`) | **Not started** | Dashboard stubs reference “sub-step 6” elsewhere; nudge table not evidenced. |
| 6 | §6 Analytics events (`onboarding.*` PostHog) | **Not started** | Events listed in buildout §682–690 not verified in codebase. |
| 7 | §11 Sign-off prerequisites | **Not started** | Checklist §756–764 — process/status only. |
| — | Resume / cross-device draft email | **Not started** | Deferred in buildout §652–658; still absent. |

### B — Forms & intake (`09-dev-handoff.md` Epic 5 + master spec §5.7)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 1 | Versioned form definitions (JSON in Postgres) | **Not started** | Epic 5 core; triage/question paths elsewhere ≠ full builder. |
| 2 | Admin form builder + attach to service | **Not started** | — |
| 3 | Signed magic-link client fill + token expiry rules | **Not started** | — |
| 4 | Canvas signature → storage + `FormSubmissionAudit` | **Not started** | — |
| 5 | Staff sees submission on appointment before session | **Partial** | Intake/triage data surfaces in places; full Epic 5 acceptance bar not met. |
| 6 | SOAP / structured clinical notes productized | **Partial** | Mentions in CRM/staff-booking maps as partial. |

### C — Foundation overlap (`09-dev-handoff.md` Epic 2)

| # | Feature | Status | Notes |
| --- | --- | --- | --- |
| 1 | Tenant-scoped Client / Staff / Service CRUD | **Partial** | Substantial admin work exists; compare field-by-field to Epic 2 “done looks like”. |
| 2 | Soft delete pattern everywhere | **Partial** | Confirm middleware/global filters vs spec. |

---

## Gap summary

| Area | Gap |
| --- | --- |
| Canonical UX spec | **`02-onboarding-flow.md`** missing — import per [`MISSING-DOCS.md`](./MISSING-DOCS.md). |
| Product write-up | **`onboarding-forms-write-up.md`** is **complete** — parity rows below still map primarily to `11-onboarding-buildout` tickets; write-up **§10–11** = acceptance + build order narrative (analytics §6 / sign-off §11 cited there). |
| Onboarding wizard | No first-class wizard matching O-1–O-5; tenant provisioning may use Clerk/webhooks only — **gap vs buildout**. |
| Forms epic | **Epic 5** largely unimplemented vs handoff; overlaps with partial intake/triage in booking CRM — track separately to avoid double-counting “done”. |

---

## Codebase anchors (today)

| Surface | Location | Notes |
| --- | --- | --- |
| Auth entry | `apps/web` / `apps/studio` Clerk sign-in, sign-up | Not multi-step onboarding draft flow. |
| Admin CRM / booking | `apps/web/app/admin/**` | Client + calendar work; not onboarding wizard. |
| Tenant hook comment | `apps/api/src/services/tenantMediaRootService.ts` | References future onboarding wizard. |
| Onboarding stub API | `apps/api/src/routes/admin/onboarding.ts` | `GET /admin/onboarding/status` → `{ status: 'not_configured', message }` (200) until wizard ships. |

---

## Suggested integration order

Aligned with **`11-onboarding-buildout.md`** (“Build them in order”) and **`09-dev-handoff.md`** epic sequencing:

| Priority | Source | Intent |
| --- | --- | --- |
| 1 | Epic 2 + prerequisites | Solidify tenant, User/Staff/Service models and Clerk alignment before onboarding routes. |
| 2 | Import `02-onboarding-flow.md` | UX microcopy + step screens; write-up already anchors product intent. |
| 3 | O-1 / O-2 — draft API + steps 1–3 | Establishes auto-save and validation spine. |
| 4 | O-3 — complete transaction | First real tenant commit path. |
| 5 | O-4 / O-5 — team + completion + nudges | Finishes wizard; connects to dashboard buildout. |
| 6 | Epic 5 — forms | Parallelizable after core tenant + appointments stable; depends on Storage + audit tables. |

---

## Definition of done (incremental)

1. Each milestone has **tenant-safe** APIs and Prisma migrations as needed.
2. Analytics events from **`11-onboarding-buildout.md` §6** recorded in staging PostHog when onboarding ships.
3. Forms milestone meets **Epic 5 “Done looks like”** bullets in `09-dev-handoff.md`.
4. Update **this file** and [`staff-booking-implementation-map.md`](./staff-booking-implementation-map.md) when CRM/booking touches overlap (e.g. intake gating).

---

## Related

- **[`staff-booking-implementation-map.md`](./staff-booking-implementation-map.md)** — Calendar + CRM + catalog parity (staff booking scope).
- **[`admin-client-profile-quick-book-handoff.md`](./admin-client-profile-quick-book-handoff.md)** — Profile + Quick Book UX.
