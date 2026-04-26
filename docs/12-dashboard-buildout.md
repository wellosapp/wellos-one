# 12 — Dashboard (Today View) Buildout
**Project:** Velura (Mindbody Rebuild)
**Document:** 12 — Dashboard Today View Implementation
**Status:** Ready for build
**Version:** 1.0
**Date:** April 21, 2026
**Audience:** Solo developer or small agency
**Source spec:** `03-dashboard-today-view.md` (UX spec, v1.0)
**Companion docs:** `09-dev-handoff.md`, `10-design-system-buildout.md`, `11-onboarding-buildout.md`

---

## How to read this document

This is the implementation spec for the Today View. Think of the Today View as five widgets sharing a page shell, each with its own data source, role gating, and empty state. Every one of them must be built cleanly on its own before they can coexist on one page without visual and performance chaos.

Structure of this doc:

1. **Prerequisites** — what must be true before starting.
2. **Data model additions** — tables and materialized views the dashboard reads.
3. **API contracts** — endpoints powering each widget.
4. **Epic breakdown** — implementation tickets in dependency order.
5. **Performance considerations** — the real reason dashboards fail.
6. **Edge cases, empty states, role gating** — the details that decide whether this ships well.

Read in order. Do not start on the schedule list before the role-gating middleware is built. A dashboard that leaks data across roles is a worse outcome than a dashboard that ships a week late.

---

## 1. Prerequisites

- [ ] Design system built (`10-design-system-buildout.md`).
- [ ] Onboarding complete so there are real businesses to log into (`11-onboarding-buildout.md`).
- [ ] Epics 2 (Client + staff model) and 3 (Booking engine) from `09-dev-handoff.md` are complete. The dashboard reads from these heavily; without them, there is nothing to show.
- [ ] Auth system supports role-based API responses — not just UI hiding. Confirmed with an integration test that asserts a Provider cannot hit `GET /api/dashboard/revenue-today`.

If any of these are missing, stop and finish them first. The dashboard is the first page any user sees; shipping it against half-built dependencies means shipping a broken first impression.

---

## 2. Data model additions

The dashboard does not require major new tables — most of what it shows comes from `Appointment`, `Client`, `Staff`, and `Service`. It does add three things:

### 2.1 `DashboardSnapshot` (materialized metrics)

For reporting-style numbers (revenue today, appointment counts, utilization deltas), computing live on every page load is too slow once a business has real data. A nightly job materializes these:

```prisma
model DashboardSnapshot {
  id                    String   @id @default(cuid())
  businessId            String
  business              Business @relation(fields: [businessId], references: [id])

  snapshotDate          DateTime  // date at business midnight, UTC-stored
  appointmentsCount     Int       @default(0)
  appointmentsLastWeek  Int       @default(0)
  revenueCents          Int       @default(0)
  revenueTrailing7avg   Int       @default(0)
  openSlotsCount        Int       @default(0)
  cancellationsCount    Int       @default(0)
  formsPendingCount     Int       @default(0)

  computedAt            DateTime  @default(now())

  @@unique([businessId, snapshotDate])
  @@index([businessId, snapshotDate])
}
```

Snapshots are computed nightly for **yesterday's data**. Today's numbers are always live (see section 5).

### 2.2 `DashboardAttentionItem` (prioritized queue)

The "Needs Attention" widget shows up to 3 items. Rather than recomputing the priority on every request, items are written to this table by the events that create them (form sent but not signed, payment overdue, staff called out, etc.):

```prisma
model DashboardAttentionItem {
  id          String   @id @default(cuid())
  businessId  String
  userId      String?  // null = visible to all users at the business, subject to role
  kind        AttentionKind  // enum, see below
  priority    Int      // 1 (urgent) to 5 (informational)
  title       String
  description String?
  ctaLabel    String
  ctaAction   String   // e.g. "resend-form:form_abc123"
  expiresAt   DateTime
  resolvedAt  DateTime?
  createdAt   DateTime @default(now())

  @@index([businessId, resolvedAt, priority])
}

enum AttentionKind {
  UNSIGNED_INTAKE_FORM      // priority 1
  OVERDUE_PAYMENT           // priority 2
  UNCONFIRMED_APPOINTMENT   // priority 3
  STAFF_GAP                 // priority 4
  EXPIRING_MEMBERSHIP       // priority 5
}
```

Items expire automatically (e.g., an unsigned form for an appointment that already happened stops mattering). A cleanup job runs hourly to set `resolvedAt` on expired items.

### 2.3 `DashboardNudgeDismissal`

Carried over from onboarding — see `11-onboarding-buildout.md` section 4, ticket O-5 (`UserNudge` table). Dashboard reads from this to render the post-onboarding nudge bar.

---

## 3. API contracts

All dashboard endpoints live under `/api/dashboard/*`. All require authentication. All responses are JSON. All honor role gating — a Provider calling an owner-only endpoint gets 403, not filtered data.

Every endpoint takes an implicit `businessId` (from the session) and `timezone` (from `Business.timezone`). "Today" is always calculated at the business's local midnight, not the user's device time.

### 3.1 `GET /api/dashboard/overview`

Returns the data needed to render the entire Today View in a single request. Prefer this over 5 parallel endpoints — it reduces client complexity and lets the server optimize the underlying queries together.

**Request:** no body. Session cookie provides auth.

**Response 200:**

```json
{
  "topbar": {
    "greeting": "Good morning, Jane",
    "dateLine": "Tuesday, April 21 · Velura Salon",
    "unreadNotifications": 3
  },
  "alertBanner": {
    "level": "important",
    "kind": "UNCONFIRMED_APPOINTMENT",
    "title": "2 clients haven't confirmed today's appointments",
    "ctaLabel": "Resend",
    "ctaAction": "resend-reminders:today"
  },
  "statStrip": {
    "appointmentsToday": { "value": 12, "deltaVsLastWeek": "+2" },
    "revenueTodayCents": { "value": 164000, "delta7dayAvgCents": "+18200", "visible": true },
    "openSlots": { "value": 3, "note": "1 cancellation" },
    "formsPending": { "value": 2 }
  },
  "schedule": {
    "appointments": [
      {
        "id": "apt_...",
        "startUtc": "2026-04-21T15:00:00Z",
        "startLocal": "08:00 AM",
        "endLocal": "09:00 AM",
        "client": { "id": "cli_...", "name": "Rosa Castillo", "initials": "RC", "avatarUrl": null },
        "service": { "id": "svc_...", "name": "Deep Tissue Massage", "color": "#3D7A5E" },
        "staff": { "id": "stf_...", "name": "Kira Chen" },
        "status": "CONFIRMED",
        "isPast": false,
        "isNext": true
      }
    ],
    "openSlots": [
      { "startLocal": "10:00 AM", "endLocal": "10:30 AM", "staffId": "stf_..." }
    ]
  },
  "quickBook": {
    "visible": true,
    "recentServices": [{ "id": "svc_...", "name": "Facial" }]
  },
  "needsAttention": {
    "items": [
      {
        "id": "att_...",
        "kind": "UNSIGNED_INTAKE_FORM",
        "title": "3 intake forms unsigned",
        "description": "Before today's appointments",
        "ctaLabel": "Send form",
        "ctaAction": "send-form-batch:today"
      }
    ]
  },
  "staffToday": {
    "visible": true,
    "staff": [
      {
        "id": "stf_...",
        "name": "Kira Chen",
        "initials": "KC",
        "avatarUrl": null,
        "status": "BUSY",
        "statusText": "3 appts · busy until 5:00 PM",
        "appointmentCount": 3
      }
    ]
  },
  "nudges": [
    { "kind": "SETUP_PAYMENT", "title": "Connect a payment method", "ctaLabel": "Set up" }
  ]
}
```

**Response shape notes:**

- Every money field ends in `Cents` and is an integer. Never floats for money.
- Every time field has both UTC (`startUtc`) and display-local (`startLocal`) values. Client does not do time-zone conversion.
- Role gating is applied server-side: `statStrip.revenueTodayCents.visible` is `false` for roles that don't see revenue. The field is still present but empty so the client render is stable.
- `alertBanner` is `null` if there is no current alert.

**Error 401:** Not authenticated. Client redirects to login.
**Error 403:** Not a member of any business. Client redirects to onboarding.

### 3.2 `GET /api/dashboard/appointments?date=today`

Returns just the schedule. Used when the user pulls to refresh the schedule widget without refetching the whole page. Response shape matches `schedule` in 3.1.

### 3.3 `GET /api/dashboard/attention`

Returns the prioritized Needs Attention items for the current user. Response shape matches `needsAttention.items` in 3.1.

### 3.4 `POST /api/dashboard/attention/:id/dismiss`

Dismiss an attention item (user chose not to act on it). Sets `resolvedAt = now()` with a `resolvedReason = 'DISMISSED'`.

### 3.5 `GET /api/quickbook/clients?q=...`

Typeahead search for the Quick Book widget. Searches `Client.firstName`, `Client.lastName`, `Client.phone` where the business matches the session user's business.

**Response:**

```json
{
  "clients": [
    { "id": "cli_...", "name": "Rosa Castillo", "phone": "(555) 000-0000", "lastVisitDate": "2026-04-14" }
  ],
  "canCreateNew": true
}
```

Rate limit: 10 requests per second per user. Debounce client-side at 200ms.

### 3.6 `POST /api/quickbook/book`

Create an appointment from the Quick Book widget.

**Request:**

```json
{
  "clientId": "cli_...",         // OR newClient below
  "newClient": { "name": "...", "phone": "...", "email": "..." },
  "serviceId": "svc_...",
  "staffId": "stf_...",          // or "any"
  "startUtc": "2026-04-21T19:00:00Z"
}
```

**Response 200:**

```json
{
  "appointment": { "id": "apt_...", ... }   // full appointment shape as in schedule
}
```

**Error conditions:**

- `422 slot_unavailable` — slot was taken between availability lookup and booking. Client refetches availability and re-prompts.
- `422 client_required` — neither `clientId` nor `newClient` provided.
- `422 validation_failed` — standard field-level errors.

### 3.7 `GET /api/appointments/:id`

Full appointment detail for the drawer/bottom sheet. Includes client profile summary, intake status, service, staff, payment state, notes.

### 3.8 `POST /api/appointments/:id/check-in`

Mark an appointment as checked-in. Updates the state machine in Epic 3.

### 3.9 `POST /api/appointments/:id/no-show`

Mark as no-show. Separate from cancellation (see Epic 3).

### 3.10 `POST /api/dashboard/nudges/:kind/dismiss`

Dismiss a post-onboarding nudge. Sets `dismissedAt = now()` on the `UserNudge` row.

---

## 4. Epic breakdown

Seven tickets. Build in order. Parallel work is possible on D-3 and D-4 once D-1 and D-2 are done.

### Ticket D-1 — Layout shell + role gating

**Why first:** Every widget needs the shell to exist and role gating to be reliable. Building widgets first and retrofitting role gating is the #1 source of data leaks.

**Scope:**

- `/app/today` route with the page shell from `10-design-system-buildout.md` section 6.
- Topbar component with greeting, date line, notification bell, and "+ New Booking" CTA.
- Grid layout: left column (scrolling) + right column (sticky on tall screens).
- Mobile layout: stacked cards, bottom nav visible.
- Server-side role gating middleware that rejects requests to role-restricted endpoints.
- A `useRole()` hook that reads the role from the session and exposes a simple API: `role.canSee('revenue')`, `role.canSee('staff-overview')`, etc.

**Role capability matrix (centralize this in one file):**

```ts
// apps/web/src/lib/roles.ts
type Capability =
  | 'view-all-appointments' | 'view-own-appointments'
  | 'view-revenue' | 'view-utilization'
  | 'quick-book' | 'view-staff-overview'
  | 'manage-nudges';

const CAPABILITIES: Record<UserRole, Capability[]> = {
  OWNER_MANAGER:    ['view-all-appointments', 'view-revenue', 'view-utilization', 'quick-book', 'view-staff-overview', 'manage-nudges'],
  OWNER_PROVIDER:   ['view-all-appointments', 'view-revenue', 'view-utilization', 'quick-book', 'view-staff-overview', 'manage-nudges'],
  OWNER_SILENT:     ['view-all-appointments', 'view-revenue', 'view-utilization', 'view-staff-overview', 'manage-nudges'],
  MANAGER:          ['view-all-appointments', 'view-revenue', 'view-utilization', 'quick-book', 'view-staff-overview', 'manage-nudges'],
  FRONT_DESK:       ['view-all-appointments', 'quick-book', 'view-staff-overview'],
  PROVIDER:         ['view-own-appointments', 'quick-book'],
  SUBCONTRACTOR:    ['view-own-appointments'],
};
```

Both the client (`useRole().canSee(...)`) and the server (middleware) read from this same source. Same rules, two layers of enforcement.

**Done looks like:**

- `/app/today` renders empty widgets with correct shell and layout on mobile, tablet, and desktop.
- Role capabilities work on both client (UI) and server (API).
- Playwright test: a Provider logs in and hits `/api/dashboard/overview`; the response has `revenueTodayCents.visible === false`. Confirmed the field is withheld, not just hidden client-side.
- Playwright test: a Provider directly hits `/api/dashboard/revenue-today` (if it exists as a standalone endpoint); gets 403.

---

### Ticket D-2 — Today's Schedule widget

**Why second:** This is the largest widget and the most complex query. It informs the shape of the `schedule` response used by every other widget.

**Scope:**

- `<TodayScheduleWidget>` component.
- Appointment row rendering with time block, avatar, client/service/staff, status badge, view button.
- Past appointments render at `opacity: 0.5`.
- "NEXT UP" pill on the first upcoming-but-not-started appointment.
- Open slot rows (dashed border) between appointments.
- Tap/click an appointment → opens drawer (desktop) or bottom sheet (mobile).
- Empty state for new businesses with no appointments: illustration + "Book First Appointment" CTA.

**Query optimization notes:**

- Single query fetches today's appointments + open slots in one round-trip.
- Join to `Client`, `Service`, `Staff` via Prisma `include`.
- Apply role filter at the database level for providers/subcontractors (`WHERE staff_id = :requesterStaffId`).
- Index needed: `Appointment(businessId, startAt)` — confirm in Prisma schema.

**"NEXT UP" logic:**

- The first appointment in the day that is **not past and not started** (status is `SCHEDULED` or `CONFIRMED`, not yet `CHECKED_IN`).
- Only one "NEXT UP" pill per role-filtered schedule. If a provider has no upcoming appointments today, no pill shows.
- Trigger window decision (open question from the UX spec): 15 minutes before start. Confirmed with product before build.

**Done looks like:**

- Schedule renders 0, 1, 10, and 50 appointments cleanly on mobile and desktop.
- Past appointments visually de-emphasized.
- NEXT UP pill appears on the right appointment.
- Tapping an appointment opens the drawer/sheet without full-page navigation.
- Open slot rows appear in time gaps ≥ 30 minutes during business hours.
- Tapping an open slot opens Quick Book with the slot pre-filled.
- Provider role sees only their own appointments; Owner role sees everyone.

---

### Ticket D-3 — Stat Strip

**Scope:**

- `<StatStrip>` component with 4 tiles.
- Tile: label (eyebrow), value (Sora 700 26px), delta (12px with arrow + color).
- Role-filtered visibility per the capability matrix.
- Skeleton loading state (no data yet).
- Empty state: show `—` for values, no delta arrows, for brand-new businesses.

**Delta calculation logic:**

| Tile | Delta calculation |
|---|---|
| Appointments Today | vs same weekday last week (e.g., this Tuesday vs last Tuesday) |
| Revenue Today | vs trailing 7-day average, computed from `DashboardSnapshot` rolling window |
| Open Slots | Note of cancellation count if any, no delta |
| Forms Pending | Raw count only |

**"Today revenue" computation:**

Revenue today is live, not snapshot. Query: sum of `PaymentIntent.amountCents` where `status = SUCCEEDED` and `createdAt` between business-local midnight-today and now. Cache this query result for 30 seconds to avoid hammering the DB on rapid refreshes.

**Done looks like:**

- Stat Strip renders 4 tiles in a row on desktop, 2×2 grid on mobile.
- Delta arrow shows green ↑ for positive, red ↓ for negative, neutral when `0`.
- Role gating: Front Desk sees no Revenue tile, Provider sees Own-only versions.
- Revenue tile shows `—` and hides delta if `visible === false`.
- First load latency: tile values render within 500ms at p95.

---

### Ticket D-4 — Alert Banner + Needs Attention + Nudges

**Why grouped:** All three are actionable notification systems with similar UX patterns, and they share priority logic.

**Scope:**

- `<AlertBanner>` primitive (from design system).
- `<NeedsAttentionWidget>`: max 3 items, priority-sorted.
- `<NudgesBar>`: post-onboarding setup nudges (from onboarding buildout).
- Single global state owner: at most one `<AlertBanner>` visible at a time.
- Actions inline (no full-page navigation): clicking "Resend" in the banner calls the action endpoint and optimistically updates the banner to "Sent ✓" for 2 seconds before disappearing.

**Priority hierarchy:**

The `AlertBanner` is the top-of-stack, urgent, screen-wide item. `NeedsAttention` is up to 3 cards in the right column. `Nudges` are dismissible setup reminders, lowest urgency.

| Layer | Max visible | Examples |
|---|---|---|
| Critical modal | 1 | Payment processor rejected, account suspended |
| Alert banner | 1 | Unsigned forms today, staff called out, unpaid balance |
| Needs Attention | 3 | Unsigned forms (batched), overdue payments, unconfirmed appointments |
| Nudges | 3 | Connect payment, add services, add staff |

If a higher layer exists, lower layers do not render duplicate content. Example: if the banner shows "3 unsigned forms," the Needs Attention widget does **not** also show "Unsigned forms." One surface per concern.

**Done looks like:**

- Single alert banner renders at the top of the main column when an issue exists.
- Needs Attention shows max 3 items, with priority-sorted order.
- Clicking CTA triggers the action endpoint; banner/card updates optimistically.
- Dismissing a nudge hides it for 7 days via `DashboardNudgeDismissal`.
- No duplicate content across layers.
- Role gating respected (providers see only their own attention items).

---

### Ticket D-5 — Quick Book widget

**Scope:**

- `<QuickBookWidget>` dark card component.
- Client typeahead search (endpoint 3.5).
- Service dropdown (filtered to the selected client's applicable services or all active services if no client selected).
- Time slot dropdown showing open slots for today only (Quick Book is today-focused; full booking lives in the Calendar section).
- "+ Add new client" inline path: collapses client search into a minimal 3-field form (name, phone, email).
- Booking submission with optimistic UI: appointment appears in the schedule widget instantly, rolls back if server rejects.

**Slot query:**

Quick Book's time slots are computed by the availability engine (Epic 3 of the dev handoff doc). Each slot option is a `{ startUtc, endUtc, staffId }` tuple. The server computes these for today, starting from the current time, in the client's selected service's duration.

**"Any staff" path:**

If the user leaves staff as "Any," the server picks any available staff member. The rule is: the first staff in alphabetical order who has availability. Simple; upgrades to smarter rules (load balancing, staff preferences) in Phase 2.

**Optimistic UI rollback:**

On Quick Book submit:

1. Immediately render a new appointment card in the schedule widget with a subtle "Saving…" badge.
2. POST to `/api/quickbook/book`.
3. On success: replace the optimistic card with the server response, remove "Saving…" badge.
4. On failure: remove the optimistic card, show a toast with the error, refocus Quick Book form.

Failure modes (422 slot_unavailable most common): re-query availability automatically and populate the time slot dropdown with fresh options.

**Done looks like:**

- User can book an appointment in under 30 seconds with keyboard + mouse, under 45 seconds on mobile with thumb.
- New client path works without leaving the widget.
- Optimistic UI: the appointment shows up in the schedule within 100ms of submit.
- Rapid double-submit (user clicks Book twice) creates exactly one appointment (idempotency key on the request).
- "Any staff" assignment works.
- Widget hidden entirely for Subcontractor role.

---

### Ticket D-6 — Staff Today widget

**Scope:**

- `<StaffTodayWidget>` component, right column.
- Status dot (amber busy, green available, grey off).
- Staff row: dot + avatar + name + status text.
- "Manage" link in header → routes to `/app/settings/staff`.
- Role gating: hidden for Provider and Subcontractor.

**Status computation:**

For each active staff member:

- Count appointments today.
- Find the next gap in their schedule (if any) of ≥ 30 minutes.
- Determine status:
  - `OFF`: no working hours today or on PTO.
  - `AVAILABLE_NOW`: currently no ongoing appointment and no appointment starting within 15 min.
  - `BUSY`: currently in an appointment or back-to-back.

Status text examples:

- "3 appts · busy until 5:00 PM"
- "Next at 2:30 PM"
- "Available now"
- "Off today"

**Query efficiency:**

Do this with a single query — join staff + appointments + working-hours-template, group in the ORM, compute status in application code. Avoid N+1 queries (one query per staff member) at all costs.

**Done looks like:**

- Lists all active staff with correct statuses.
- Status dot color matches status text.
- Widget hidden entirely for Provider and Subcontractor.
- Manage link works.
- Handles 0, 1, 10, 30 staff gracefully (30+ collapses to scrollable list with max-height).

---

### Ticket D-7 — Appointment Drawer/Sheet

**Scope:**

- `<AppointmentDetailDrawer>` (desktop) and `<AppointmentDetailSheet>` (mobile) components.
- Opens from right (desktop) or bottom (mobile).
- Content: client info, last visit summary, service details, staff, intake form status, payment status.
- Action buttons: Check In, Collect Payment, Add Note, Reschedule, Cancel.
- Role gating on actions: only roles with appropriate capabilities see each action button.
- Close with Esc, tap outside (desktop), swipe down (mobile).

**Actions map:**

| Action | Capability required | Endpoint |
|---|---|---|
| Check In | PROCESS_APPOINTMENT | `POST /api/appointments/:id/check-in` |
| Collect Payment | PROCESS_PAYMENTS | Opens checkout (Epic 6 of handoff) |
| Add Note | ACCESS_CLIENT_CONTACTS | `POST /api/appointments/:id/notes` |
| Reschedule | ALL | `POST /api/appointments/:id/reschedule` (opens reschedule modal) |
| Cancel | ALL | `POST /api/appointments/:id/cancel` (confirm before) |

**Done looks like:**

- Drawer opens with full appointment detail within 200ms of tap/click.
- Actions fire the correct endpoints and optimistically update the schedule view.
- Cancel confirmation modal prevents accidental cancellation.
- Mobile sheet dismisses with swipe-down gesture.
- Keyboard navigation works (Tab between actions, Esc to close).

---

## 5. Performance considerations

Dashboards fail because they ship as 8 widgets making 8 parallel queries, each slow, each hammering the DB. Here's how to not do that.

### 5.1 Single-request rendering

Use `GET /api/dashboard/overview` (endpoint 3.1) on initial load. All widgets receive their data from one response. No client-side waterfall.

Only switch to per-widget endpoints when a widget needs to refresh independently (pull-to-refresh on the schedule, for example).

### 5.2 Query strategy

```
/api/dashboard/overview internally:
  - One transaction, read-only.
  - Parallel execution of 6 queries via Promise.all:
    1. Today's appointments with joins.
    2. Open slots for today.
    3. Dashboard snapshot for yesterday + rolling window.
    4. Live revenue today (cached 30s).
    5. Needs Attention items (top 3 by priority).
    6. Staff status with appointment counts.
  - Assemble response.
```

Target: p95 < 500ms on the overview endpoint. If this is slower, investigate indexes before adding caching.

### 5.3 Indexes required

```sql
-- Appointment queries
CREATE INDEX idx_appointment_business_date ON "Appointment" ("businessId", "startAt");
CREATE INDEX idx_appointment_staff_date ON "Appointment" ("staffId", "startAt");
CREATE INDEX idx_appointment_client ON "Appointment" ("clientId");

-- Attention items
CREATE INDEX idx_attention_pending ON "DashboardAttentionItem" ("businessId", "resolvedAt", "priority")
  WHERE "resolvedAt" IS NULL;

-- Dashboard snapshots
CREATE INDEX idx_snapshot_business_date ON "DashboardSnapshot" ("businessId", "snapshotDate" DESC);
```

Verify these exist in the Prisma schema via `@@index` directives, not added manually.

### 5.4 Caching

- **Revenue today:** in-memory cache (Redis), key `revenue:today:{businessId}`, TTL 30 seconds.
- **Stat strip deltas:** computed from `DashboardSnapshot` which is materialized nightly; no caching needed for the historical portion.
- **Staff availability:** not cached. Always live — stale availability is worse than slow availability.
- **Attention items:** not cached at the endpoint level. The underlying query is already fast with the partial index above.

### 5.5 Skeleton loaders

Every widget has a skeleton version that renders in 0ms while the overview endpoint is loading. This is a hard rule — no spinners on whole sections.

See `10-design-system-buildout.md` section 7.3 for the skeleton primitive.

### 5.6 Target latency

| Metric | Target |
|---|---|
| `GET /api/dashboard/overview` | p95 < 500ms |
| Initial render (first paint) | < 1 second on 4G |
| Full interactivity | < 2 seconds on 4G |
| Widget refresh (schedule, attention) | p95 < 300ms |
| Quick Book submit | p95 < 800ms |
| Appointment drawer open | < 200ms |

Instrument these with a real user monitoring tool (Sentry Performance, or Datadog RUM). If any slips to 2× the target in production, it's an incident — fix before shipping new features.

---

## 6. Edge cases & empty states

### 6.1 Brand new business (no appointments, no clients, no data)

- Schedule widget: empty state illustration + "Book First Appointment" CTA.
- Stat strip: all tiles show `—`, no deltas.
- Needs Attention: widget hidden (no empty card).
- Staff Today: shows the owner only, status "Available now."
- Quick Book: fully functional, but needs a service to be created first — if no services exist, show "Add a service first" CTA that routes to Settings.
- Nudges: all three post-onboarding nudges visible unless dismissed.

### 6.2 All appointments today are in the past

- Schedule widget: all appointments de-emphasized.
- No NEXT UP pill.
- Alert banner may show "You're done for the day" as an informational toast (not a banner).

### 6.3 Network failure during overview fetch

- Show skeletons for 10 seconds, then an error state in the main content area: "Couldn't load your dashboard. [Retry]"
- Do not show empty widgets — that looks like a broken app.
- Retry button refetches. Exponential backoff on repeated failures.

### 6.4 Timezone around midnight

"Today" is the business's local day. If a user in LA opens the app at 11:59 PM and refreshes at 12:01 AM, the data changes — that's correct.

Edge case: an appointment is on today at 11 PM local time. A user in a different timezone opens the app. They see it on "today" because it's today for the business, even if it's tomorrow in the user's timezone.

Test cases:

- User in NYC (ET), business in LA (PT), at 8 PM ET / 5 PM PT: today reflects LA.
- User in the business's timezone, at local 1 AM: sees the new day's empty schedule.

### 6.5 Same-weekday-last-week doesn't exist

New business, just onboarded 3 days ago, wants to see "vs last Tuesday" delta. No data exists for last Tuesday.

Behavior: show delta as `—` with no arrow. Do not show `+100%` or `+inf`. Label implicitly says "not enough history."

### 6.6 Staff offline / not working today

Status dot grey, status text "Off today." They remain in the widget (not hidden) so the user knows who's on the roster.

If all staff are off, widget shows "No staff working today" message. Useful for a solo practitioner on their day off.

### 6.7 Concurrent update conflicts

Two users on different devices view the Today dashboard. User A marks an appointment as checked-in; User B's dashboard still shows it as unconfirmed until refresh.

MVP: no real-time updates. Accept a stale view. Refresh on user action (clicking into the drawer refetches that appointment).

Phase 2: SSE or WebSocket for live updates. Don't build this yet.

---

## 7. Role gating tests

These are acceptance tests that **must pass** before shipping. They are the difference between a secure dashboard and a data-leak-waiting-to-happen.

### 7.1 Server-side tests (integration)

```ts
// apps/api/tests/dashboard-role-gating.spec.ts

describe('Dashboard role gating', () => {
  it('Provider cannot see revenue field', async () => {
    const session = await loginAs('provider');
    const res = await request(app).get('/api/dashboard/overview').set('Cookie', session);
    expect(res.status).toBe(200);
    expect(res.body.statStrip.revenueTodayCents.visible).toBe(false);
  });

  it('Provider only sees own appointments in schedule', async () => {
    const session = await loginAs('provider-a');
    const res = await request(app).get('/api/dashboard/overview').set('Cookie', session);
    res.body.schedule.appointments.forEach(apt => {
      expect(apt.staff.id).toBe(PROVIDER_A_STAFF_ID);
    });
  });

  it('Subcontractor does not receive staffToday block', async () => {
    const session = await loginAs('subcontractor');
    const res = await request(app).get('/api/dashboard/overview').set('Cookie', session);
    expect(res.body.staffToday.visible).toBe(false);
    expect(res.body.staffToday.staff).toEqual([]);
  });

  it('Cross-business access is forbidden', async () => {
    const session = await loginAs('owner-at-business-a');
    const res = await request(app)
      .get(`/api/appointments/${APPOINTMENT_AT_BUSINESS_B}`)
      .set('Cookie', session);
    expect(res.status).toBe(404); // not 403 — don't leak existence
  });
});
```

### 7.2 Client-side tests (Playwright)

- Log in as Provider. Assert Revenue tile is not in the DOM (not just hidden with CSS).
- Log in as Front Desk. Assert Staff Today widget is visible. Assert Revenue tile is not visible.
- Log in as Owner. Assert all widgets are visible.

---

## 8. Analytics events

| Event | When | Properties |
|---|---|---|
| `dashboard.viewed` | Overview endpoint success | `role`, `appointmentCount`, `loadTimeMs` |
| `dashboard.appointment_opened` | Drawer opens | `appointmentId`, `source` (schedule/click, open-slot/click) |
| `dashboard.quick_book_submitted` | Quick Book success | `newClient` (bool), `anyStaff` (bool), `timeToBookSec` |
| `dashboard.attention_item_resolved` | Attention CTA clicked | `kind`, `timeToResolveSec` |
| `dashboard.nudge_dismissed` | Nudge X clicked | `kind` |
| `dashboard.nudge_cta_clicked` | Nudge primary action | `kind` |

Drop-off signal: if `dashboard.viewed` without a subsequent event within 30 seconds, the user landed but didn't interact. High rate = dashboard isn't useful. Investigate.

---

## 9. Mobile-specific behaviors

Reinforcing what's in the UX spec:

- All tap targets ≥ 44×44px. Confirmed with a quick visual overlay in dev.
- Appointment rows are full-width cards on mobile, not table rows.
- Bottom nav always visible (56px + safe area).
- Appointment drawer → bottom sheet, slides up.
- Stat Strip: 2×2 grid.
- Right column widgets stack below schedule.
- Quick Book on mobile: consider replacing with a floating action button (FAB) that opens Quick Book as a full-screen modal. **Open question from the UX spec** — confirm with product before build.

---

## 10. Done looks like (whole dashboard)

- [ ] All 7 tickets (D-1 through D-7) ship their acceptance criteria.
- [ ] Dashboard loads in under 2 seconds on 4G.
- [ ] Role gating tests pass (7 tests minimum, all roles × all restricted data).
- [ ] Every widget has a skeleton loader and an empty state.
- [ ] Single `/api/dashboard/overview` endpoint serves the full page.
- [ ] Playwright E2E: Owner logs in, sees full dashboard within 2s, opens appointment drawer, checks in client, sees state update.
- [ ] Playwright E2E: Provider logs in, sees own-only view, no revenue, no staff widget.
- [ ] Lighthouse performance score ≥ 85 on a real device.
- [ ] No N+1 queries (verified with query logs during load testing).
- [ ] Quick Book creates an appointment end-to-end in under 30 seconds.

---

## 11. Open questions to resolve before build

Copied from the UX spec — these block specific tickets if unanswered.

- [ ] **Blocks D-7 (Provider drawer scope):** Should providers see a simplified "my day" view vs the full Today layout?
- [ ] **Blocks D-2:** What is the exact "NEXT UP" trigger — at appointment start time, or 15 minutes before?
- [ ] **Blocks D-2:** Do we show past appointments from today, or only upcoming?
- [ ] **Blocks D-5:** Is the Quick Book widget shown to Front Desk on mobile, or replaced with a FAB button?
- [ ] **Blocks D-3:** Should Revenue Today show collected only, or include upcoming expected revenue?

Each of these has a reasonable default baked into this doc (e.g., 15 minutes for NEXT UP, collected-only for revenue, show past appointments de-emphasized). If product pushes back, those are the places to look.

---

## 12. Sign-off

- [ ] UX spec (`03-dashboard-today-view.md`) reviewed and any deltas captured.
- [ ] Data model changes reviewed against `09-dev-handoff.md` Epic 2 and 3.
- [ ] API contracts reviewed by backend lead.
- [ ] Role capability matrix reviewed by product / security.
- [ ] Performance targets reviewed and confirmed realistic.
- [ ] Analytics event names added to the tracking plan.
- [ ] Open questions answered.

Once all boxes are checked, Tickets D-1 through D-7 can be scheduled. D-1 and D-2 must complete before any of D-3 through D-7 start. D-3, D-4, D-5, D-6, D-7 can run in parallel after that — they're independent widgets sharing the shell and the overview endpoint.
