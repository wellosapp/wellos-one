# Staff Booking + Client CRM — Implementation Map

**Canonical product spec:** [staff-booking-client-crm.md](./staff-booking-client-crm.md)

**Calendar Area umbrella (views, booking panel, filters, blocks, acceptance criteria):** [calendar-area-features.md](./calendar-area-features.md)

**Services & Catalog (eligibility, pricing, buffers, public/staff surfaces):** [services-catalog-features.md](./services-catalog-features.md)

**Onboarding & Forms (tenant wizard + Epic 5 intake/e-sign):** [onboarding-forms-implementation-map.md](./onboarding-forms-implementation-map.md)

This document ties that spec to the **current Wellos monorepo**, highlights **gaps**, and tracks **build priority** (spec section 13) without duplicating the full matrix.

**Program goal:** Implement **every** feature and function described in the three canonical docs ([staff-booking-client-crm.md](./staff-booking-client-crm.md), [calendar-area-features.md](./calendar-area-features.md), [services-catalog-features.md](./services-catalog-features.md)). Downstream epics (automations, reporting, public booking polish) assume this foundation. Until the **Consolidated parity** section below reads **Done** for each row (or a documented ADR defers it), the platform is **not** spec-complete.

**Product commitment:** Treat the consolidated parity table as the engineering backlog for spec completeness—not optional polish. Delivery is **incremental** along [staff-booking-client-crm.md §13](./staff-booking-client-crm.md) build priority and the **Suggested integration order** section below; each merge should advance one or more rows with tests and tenant-safe scope.

---

## Consolidated parity (three specs)

Single backlog checklist. **Status key:** **Done** = matches spec intent for MVP path | **Partial** = shipped but missing spec behaviors or UI | **Not started** = no meaningful implementation yet.

### A — `staff-booking-client-crm.md` §3 (CRM in booking)

| # | Feature | Status | Notes |
|---|---------|--------|--------|
| 1 | Client search + fast select | **Done** | Admin calendar Quick Book + actions. |
| 2 | Inline new client | **Done** | `QuickBookPanel` + `quickBookCreateClientInline` (minimal create / flow B). |
| 3 | Client snapshot card | **Partial** | Quick Book: identity header (display name, status badge, **preferred name**, phone/email), **SMS/email opt-out** warnings, LTV + completed visits + last visit, preferred provider, payments strip (outstanding stub, **upcoming booked value**, card on file), recent visits (list price labeling). DB: `clients.preferred_name`. Gaps vs §3: full tabbed CRM drawer, tenant custom row. |
| 4 | Visit history | **Partial** | Recent visits from timeline with date, service, staff, state, list-price amount + notes snippet; cancellations/no-shows matrix depth still thin. |
| 5 | Structured client notes | **Partial** | Quick Book creates **ClientNote** linked to `appointment_id` (`sourceSurface: quick_book`, category `session`); drawer Overview shows linked rows. **Gap:** category picker + non–Quick Book surfaces still thin. |
| 6 | Pinned notes | **Partial** | Surfaced via client-context; drawer parity incomplete. |
| 7 | Booking alerts | **Partial** | Alerts load; **acknowledgment gate + audit** before save not implemented. |
| 8 | Preferences + service defaults | **Not started** | Prefill provider/room/etc. per spec §5. |
| 9 | Forms + intake status | **Partial** | Client-context now returns **intake chip** + **service booking questions** when `serviceId` is passed; soft/hard enforce-in-save path still incomplete. |
| 10 | Photos + files | **Partial** | Client-context **hydrates recent client media assets** as file summaries; attach-during-booking flow still thin. |
| 11 | SOAP / service notes | **Partial** | SOAP module exists; shortcut + briefing loop per matrix incomplete. |
| 12 | Payment + balance context | **Partial** | Client-context: outstanding + card **stubbed**; **upcoming committed schedule value** from appointments; Stripe ledger + deposit/block rules not end-to-end. |
| 13 | Client status + restrictions | **Partial** | Banned/VIP-ish mapping; full restriction engine + override logging incomplete. |
| Custom | Tenant-defined CRM row | **Not started** | `customRows: []` stub; no tenant config UI. |

### B — `services-catalog-features.md` §2 (Catalog)

| # | Feature | Status | Notes |
|---|---------|--------|--------|
| 1 | Service profile | **Done** | CRUD + core fields incl. visibility, category, buffers, price display mode (see Prisma + admin UI). |
| 2 | Categories + display order | **Done** | `service_categories` + admin UI. |
| 3 | Duration + buffer rules | **Done** | Availability + appointments use buffers; price locked on appointment. |
| 4 | Pricing + disclosure | **Partial** | `booked_base_price_cents`; full deposit/range/consultation UX vs spec varies. |
| 5 | Staff eligibility | **Done** | `StaffService` + server validation + staff-scoped lists. |
| 6 | Resource requirements | **Not started** | No first-class `resources` / `service_resources` + availability conflict loop. |
| 7 | Booking policies per service | **Partial** | Not as full **service_policies** row model in DB; notice/horizon/fee rules not fully enforced in API. |
| 8 | Booking page content | **Partial** | Descriptions exist; full marketing/gallery/prep sheet per spec not complete. |
| 9 | Service-linked forms, notes, CRM | **Partial** | Questions/triage paths exist; full assign-on-book + history loop incomplete. |
| 10 | Custom row (catalog) | **Not started** | No `service_custom_fields` / tenant builder per spec §6. |

### C — `calendar-area-features.md` §2 / §5 (Calendar area)

| # | Feature | Status | Notes |
|---|---------|--------|--------|
| 1 | Multi-view calendar | **Partial** | Day / week / month components exist; list/agenda + mobile compact per spec not complete. |
| 2 | Staff column view | **Partial** | Staff columns in day view; full column chrome (counts, blocked visualization) incomplete. |
| 3 | Quick appointment creation | **Partial** | Quick Book + gaps; **drag-range create**, **book again**, open-slot suggestion incomplete. |
| 4 | Right-side booking panel | **Partial** | Quick Book panel; resource/deposit/policy summaries incomplete vs §5.4. |
| 5 | Drag-to-reschedule | **Partial** | Day grid: grip **drag** + column **drop** → `PATCH` with `scheduledStartAt`/`staffId`; header `x-wellos-calendar-drag` sets `source = calendar_drag`. Validates overlap + schedule blocks. Week/month drag not built yet. |
| 6 | Appointment detail drawer | **Partial** | Tabs exist; payment/reminder/history depth vs spec incomplete. |
| 7 | Availability + conflict protection | **Partial** | Engine: appointments + buffers + **staff schedule blocks** (API); missing **resources**, **closures/blackouts**, **policy windows**, **external busy**. |
| 8 | Appointment status controls | **Partial** | States + transitions exist; permission matrix vs spec roles incomplete. |
| 9 | Block time / time off | **Partial** | **Backend:** blocks API + availability + create overlap. **Web:** day grid shows blocks + remove; **week** lists block cards + remove; **month** shows per-day block count badge; admin **Block time** panel (`?blocktime=1`) creates blocks. |
| 10 | Client alert strip | **Partial** | Partial surfacing; full strip + ack flow incomplete. |
| 11 | Calendar filters | **Partial** | Limited vs staff/service/location/status/resource/source matrix. |
| 12 | Calendar sync readiness | **Not started** | External busy + sync hooks not implemented. |
| 13 | Custom calendar row | **Not started** | Tenant-defined row / flags. |

---

## Current codebase anchors

| Spec surface | Repo location | Today |
|--------------|---------------|--------|
| Calendar Quick Book (right / sidebar) | [`apps/web/app/admin/calendar/QuickBookPanel.tsx`](apps/web/app/admin/calendar/QuickBookPanel.tsx) | Client search, inline create, CRM snapshot (identity, comm prefs, LTV, visits, preferred provider, payments summary, recent visits, tags, alert/pinned lines, forms/files from context). **Not** full §4 tabbed drawer (History/Notes/Forms/Files/Payments) in-panel yet. |
| Calendar page + URL state | [`apps/web/app/admin/calendar/page.tsx`](apps/web/app/admin/calendar/page.tsx), [`CalendarDayView.tsx`](apps/web/app/admin/calendar/CalendarDayView.tsx) | `?quickbook=`, `?selected=`, `?tab=`; drawer + Quick Book coexist in layout. |
| Appointment drawer (CRM-ish tabs) | [`apps/web/app/admin/calendar/AppointmentDrawer.tsx`](apps/web/app/admin/calendar/AppointmentDrawer.tsx) + [`tabs/`](apps/web/app/admin/calendar/tabs/) | Overview, client, payment, intake, files, notes — **appointment-centric**, not full “staff booking CRM panel” from spec section 4. |
| Admin client profile + Book tab | [`apps/web/app/admin/clients/[id]/`](apps/web/app/admin/clients/[id]/) (`ClientDetailShell`, `ClientProfileTabs`, `ClientQuickBookDrawer`, `book/page.tsx`) | Profile tabs + inline Book uses same booking actions as calendar; **does not yet** load consolidated CRM context API. |
| Booking server actions | [`apps/web/app/admin/calendar/_actions.ts`](apps/web/app/admin/calendar/_actions.ts) | `createAppointment`, availability, client search, `loadStaffBookingClientContextAction` → [`lib/api/staff-booking.ts`](../apps/web/lib/api/staff-booking.ts). |
| API layer (web) | [`apps/web/lib/api/*.ts`](apps/web/lib/api/) | Clients, appointments, timeline, notes — **partial** coverage for matrix rows 4–13 until unified context endpoint exists. |

**Related handoff:** [admin-client-profile-quick-book-handoff.md](./admin-client-profile-quick-book-handoff.md) (profile drawer UX; same booking engine expectation).

---

## Gap summary (spec vs shipped)

| Area | Gap |
|------|-----|
| Single CRM context payload | `GET /admin/staff-booking/client-context` returns snapshot (incl. LTV, preferred provider), alerts, pinned, recent visits, forms (intake + service questions), file summaries, payments (**ledger/card/balance stubbed**; **upcoming committed value** live), `customRows: []`. |
| Snapshot card in Quick Book | **Partial:** identity + snapshot metrics + payments strip + recent visits + tags + alerts — **not** full §4 CRM tabs, SOAP shortcut, or tenant custom rows in-panel. |
| Inline create client in panel | **Shipped** in `QuickBookPanel` (`quickBookCreateClientInline`). Further polish (profile nudge, validation copy) may remain. |
| Alert acknowledgment | No booking-gated acknowledge modal + audit log tied to `appointment_id` / note. |
| Structured notes from booking | Notes APIs exist in places; **appointment-linked note from booking panel** with categories needs productized flow. |
| Forms / intake gating | Intake status on client model exists in CRM; **service-required form soft/hard rules** in booking path not implemented as spec section 8. |
| Files in booking | No attach/link flow in Quick Book matching matrix row 10. |
| Payments in booking | Payment tab in drawer is placeholder relative to full balance/deposit rules. |
| Custom CRM row | Not tenant-configurable in UI/API yet. |
| Appointment `source` | Enum includes `calendar_drag`; Quick Book sets `quick_book`; calendar drag-reschedule sets `calendar_drag` via PATCH header. |
| Staff schedule blocks | **API + engine + day/week/month UI:** blocks on admin/staff **day** grid; **week** column cards + remove; **month** block-count badges; **Block time** panel (`?blocktime=1`). |
| Resources / rooms | **Not started** — availability does not yet check resource exclusion (spec §7 C). |

---

## Suggested integration order (maps to spec build priority)

Use this as epic ordering; adjust with PM.

| Priority | Spec reference | Engineering intent |
|----------|----------------|---------------------|
| 1 | Schema + CRM links | Prisma: confirm `appointment_id` on notes/files/forms/payments as needed; migrations additive only. |
| 2 | Search + inline create | Extend `QuickBookPanel` + actions: `POST` inline client, then attach `clientId` to appointment. |
| 3 | Snapshot card | UI card fed by client-context payload (even stubbed fields first). |
| 4 | CRM context endpoint | Fastify: `GET /admin/staff-booking/client-context` or nested under tenant routes — **one** contract; web types in `apps/web/lib/staff-booking/client-context-types.ts`. |
| 5 | Alerts + acknowledge | Note/trigger model + `POST …/acknowledge` + UI gate before submit. |
| 6 | Appointment-linked notes | From booking form + drawer; reuse note APIs with `appointmentId`. |
| 7–10 | Forms, files, history, payments | Incrementally hydrate context response + tabs in panel. |
| 11–12 | Restrictions, custom row | Policy layer + tenant config UI. |
| 13 | Calendar detail parity | Appointment drawer shows same pinned/alerts as booking panel where roles allow. |

---

## API naming note

The spec uses illustrative paths like `/api/staff-booking/...`. This repo’s web wrappers typically call **`/admin/...`** on the Fastify API. When implementing, align route names with [`apps/api`](apps/api) routing and auth; keep **one** canonical client-context response shape (see TypeScript types).

**Staff vs admin on `/admin/*`:** Reads needed for booking (clients list/detail, services list/detail, staff list scoped to self, availability for own `staffId`, appointments list/detail scoped to own column, transitions/notes patch on own appointments, whoami + `staffMember`) use **`requireRole.staff`**. Staff-only users are **scoped** by `apps/api/src/auth/calendarStaffScope.ts` (email ↔ Staff row). Destructive catalog edits and client deletes remain **admin-only**.

---

## TypeScript contract (frontend)

Shared types for the **target** client-context JSON live in:

`apps/web/lib/staff-booking/client-context-types.ts`

Import these from future `lib/api/staff-booking-context.ts` (or similar) once the backend exists. Until then, types guide UI mocks and prevent drift.

---

## Definition of done (incremental)

For each milestone, verify:

1. Staff does not need to navigate away from booking to see **mandatory** CRM facts for that milestone (e.g. snapshot + alerts before “full” matrix).
2. Writes persist with correct **foreign keys** and **tenant scope**.
3. Calendar and client profile views **read the same appointment + CRM links** where applicable.
