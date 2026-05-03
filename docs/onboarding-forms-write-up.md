# Wellos — Onboarding & Forms Write-Up

**Status:** Canonical product narrative for **tenant onboarding** (business signup wizard) and **first-party forms** (intake, e-sign, service-linked flows). This document consolidates intent from `11-onboarding-buildout.md`, `09-dev-handoff.md` (Epics 2 & 5), `mindbody-rebuild-master-spec.md` Part 5.7, and parity tracking in `onboarding-forms-implementation-map.md`. UX microcopy for step screens remains in `02-onboarding-flow.md` when that spec is imported.

**Audience:** Product, design, and engineering — single reference for scope, APIs, sequencing, and acceptance.

---

## 1. Product goal

- **Onboarding:** Move a new business from “landing on signup” to a **live tenant** with business profile, hours, seeded catalog choices, owner identity, optional team invites, and a clear path into the dashboard — without losing progress mid-flow.
- **Forms:** Replace brittle third-party form chains with a **first-party** engine: versioned definitions, magic-link delivery, signatures with audit evidence, and staff visibility on the client / appointment **before** session time.

Together, these reduce time-to-value for tenants and cut session-time lost to paperwork — aligned with Epic foundations (`09-dev-handoff.md`) and the master spec’s CRM/forms positioning (`mindbody-rebuild-master-spec.md` §5.7).

---

## 2. Core concept

| Theme | Idea |
| --- | --- |
| **Draft-first onboarding** | Server-side `OnboardingDraft` + token — survives tab close and (eventually) device switch; auto-save debounced; cookie + localStorage per `11-onboarding-buildout.md` §2.5, §3. |
| **Single transactional commit** | `POST /api/onboarding/complete` creates `Business`, owner `User`, optional `Staff`, seeded `Service` rows in **one** transaction; draft deleted on success (`11-onboarding-buildout.md` §3.4). |
| **Clerk in v2 stack** | Identity today is Clerk-backed; the buildout doc still describes password hashing patterns — implementation maps Clerk users to tenant `User`/`Staff` rows without contradicting multi-tenant rules (`CLAUDE.md`). |
| **Forms as versioned JSON** | Definitions stored as JSON with explicit versioning; submissions bind to the version filled (`09-dev-handoff.md` Epic 5, master spec §5.7.2). |
| **Evidence packet** | Signatures → PNG in storage; audit row captures IP, UA, timestamp, version hashes (`09-dev-handoff.md`, §5.7.6 in master spec). |

---

## 3. Onboarding area (API & flow spine)

Aligned with **`11-onboarding-buildout.md` §3** API contracts (`/api/onboarding/*`).

### 3.1 `POST /api/onboarding/draft`

Creates a new draft; client persists `draftToken` (cookie + localStorage). No body.

### 3.2 `PUT /api/onboarding/draft/:token`

Auto-save draft payload + `currentStep`; debounced (~500ms) on blur/step change; idempotent update.

### 3.3 `GET /api/onboarding/draft/:token`

Restore draft for resume banner / continuation; 404 → client starts fresh.

### 3.4 `POST /api/onboarding/complete`

Transactional commit: owner account + business + services + queued invites; deletes draft on success; errors include `draft_not_found`, `email_taken`, `validation_failed` (`11-onboarding-buildout.md` §3.4).

### 3.5 `POST /api/onboarding/resend-invite`

Authenticated; owner re-sends failed staff invite (`11-onboarding-buildout.md` §3.5).

### 3.6 `POST /api/auth/accept-invite`

Invite token + password → session for invited staff (JWT invite tokens as in buildout).

### 3.7 Steps ↔ tickets (wizard shape)

| Step | Ticket | Summary |
| --- | --- | --- |
| 1–3 | **O-2** | Business type, business info, hours + categories — draft-backed (`11-onboarding-buildout.md` §4 O-2). |
| 4 | **O-3** | Owner account + first `/complete` transaction (`11-onboarding-buildout.md` §4 O-3). |
| 5 | **O-4** | Team invites + permissions (`11-onboarding-buildout.md` §4 O-4). |
| 6 | **O-5** | Completion UI + dashboard nudges (`UserNudge`) (`11-onboarding-buildout.md` §4 O-5). |

**O-1** implements §3.1–3.3 + `useOnboardingDraft()` hook before feature steps ship.

---

## 4. Forms area (builder, runtime, compliance)

Consolidates **Epic 5** (`09-dev-handoff.md`) and **master spec §5.7** subsections.

### 4.1–4.3 Definition & versioning

JSON definitions in Postgres; edit creates new version; submissions pinned to version (`09-dev-handoff.md`, §5.7.2).

### 4.4 Field-type library (MVP vs Growth)

MVP includes text, long text, date, yes/no, multi-select, **signature**, file upload per Epic 5; master spec §5.7.3 expands types and Growth extras (conditional logic, etc.).

### 4.5 Builder UX

Admin-facing builder — drag-and-drop patterns, templates — per §5.7.4 (product vision).

### 4.6 Service attachment

Forms attach to services; booking a service triggers the linked intake/consent flow (`09-dev-handoff.md`).

### 4.7 Magic-link delivery

Signed URL token; no client login; expiry rules (e.g. 7-day window vs appointment) per §5.7.1 / Epic 5.

### 4.8 Signature capture

Canvas → PNG → storage; metadata for audit (`09-dev-handoff.md`, §5.7.6).

### 4.9 Staff visibility

Submission visible on appointment / client before visit (`09-dev-handoff.md` “Done looks like”).

### 4.10 Immutability after submit

Signed submission is immutable; amendments = new submission (`09-dev-handoff.md`).

### 4.11 Audit / legal bundle

`FormSubmissionAudit` append-only: IP, user agent, timestamps, version refs (`09-dev-handoff.md`, master §5.7.6).

### 4.12 Analytics & reminders

Form analytics and reminder scheduling per §5.7.5–5.7.7 — Growth-tier features may refine depth.

---

## 5. Integrations — scheduling & CRM

Forms tie to **appointments** and **client records**: assignment rows, staff surfaces, booking triggers (`mindbody-rebuild-master-spec.md` §5.7.8). Staff booking CRM context (alerts, forms chips) follows `staff-booking-client-crm.md` / implementation maps — **not** a substitute for the full Epic 5 engine but overlapping UX for “know before you book.”

---

## 6. Integrations — notifications & storage

- **Email/SMS:** Distribution via Postmark + TextLink for magic links and reminders (`09-dev-handoff.md` Epic 8 references, master §5.7.5).
- **Storage:** Supabase (private bucket) for signatures and uploads — aligned with `CLAUDE.md` stack.

---

## 7. Custom row (CRM / booking)

Tenant-defined **custom profile rows** may be marked `requiredForBooking` — surfaced in staff booking context so providers resolve gaps before confirming appointments (`apps/web/lib/staff-booking/client-context-types.ts` `StaffBookingCustomRow`). Full enforcement rolls up with CRM + booking parity in `staff-booking-implementation-map.md`.

---

## 8. API areas (cross-reference)

| Area | Contract home |
| --- | --- |
| Onboarding draft + complete | `11-onboarding-buildout.md` §3 |
| Accept invite | `11-onboarding-buildout.md` §3.6 |
| Forms REST (future) | Epic 5 + master §5.7 — to be listed when routes are added |
| Admin CRM / staff booking | `apps/api` `/admin/*` patterns (`routes/admin/index.ts`) |

---

## 9. Watch-outs

- **Draft layer first:** Skipping O-1 forces rework when shapes change (`11-onboarding-buildout.md` §4 O-1).
- **Multi-tenant:** Every query scoped by `tenant_id`; no single-tenant shortcuts (`CLAUDE.md`).
- **Clerk vs legacy password doc:** Treat transactional password pseudocode in §4 O-3 as **conceptual**; actual hashing/session is Clerk + platform rules.
- **Resume cross-device:** Email-me-a-link deferred in buildout §5.4 — document if Phase 2.
- **Form parity:** Do not conflate triage widgets or partial CRM notes with Epic 5 “done” (`onboarding-forms-implementation-map.md`).

---

## 10. Acceptance (incremental)

**Onboarding (`11-onboarding-buildout.md` §9 + §6):**

- Tickets **O-1–O-5** acceptance bullets met.
- Analytics events: `onboarding.started`, `onboarding.step_completed`, `onboarding.completed`, `onboarding.error`, `onboarding.abandoned` (§6).
- Playwright happy path in CI (§7).
- No PII secrets in logs (§9).

**Forms (Epic 5 “Done looks like”):**

- Admin can create form with required field types and attach to service.
- Client completes magic link on mobile Safari.
- Staff sees submission before appointment.
- Immutable submission + audit metadata retained.

---

## 11. Build order

1. **Foundation:** Epic 1–2 prerequisites (`09-dev-handoff.md`) — auth, tenant, Client/Staff/Service CRUD.
2. **O-1:** Draft APIs + hook + cron cleanup (`11-onboarding-buildout.md`).
3. **O-2:** Steps 1–3 UI + validation.
4. **O-3:** Step 4 + `/complete` transaction.
5. **O-4 / O-5:** Team step, completion, nudges.
6. **Epic 5** in parallel once core booking stable — migrations for definitions, submissions, audit tables.

`onboarding-forms-implementation-map.md` **Suggested integration order** matches this sequence.

---

## 12. Framing

**Wellos** positions onboarding + forms as **revenue and liability infrastructure**: fast setup reduces abandonment; owned forms + audit trail reduce clinical/legal exposure called out in competitor research (`mindbody-rebuild-master-spec.md` Part 5 intro). **Wellos Studio** may ship a thinner onboarding slice (`wellos-studio-start-plan.md`) but shares the same backend — feature flags and tenant scoping apply (`CLAUDE.md`).

---

## Related documents

| Doc | Role |
| --- | --- |
| [`11-onboarding-buildout.md`](./11-onboarding-buildout.md) | Tickets O-1–O-5, APIs, analytics §6, sign-off §11 |
| [`09-dev-handoff.md`](./09-dev-handoff.md) | Epic 2 & Epic 5 scope |
| [`onboarding-forms-implementation-map.md`](./onboarding-forms-implementation-map.md) | Engineering parity checklist |
| [`mindbody-rebuild-master-spec.md`](./mindbody-rebuild-master-spec.md) | §5.7 Forms depth |
| [`MISSING-DOCS.md`](./MISSING-DOCS.md) | Pending `02-onboarding-flow.md` import |
