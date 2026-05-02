---
name: Calendar UI mockups (Admin + Staff + Client)
overview: Implement three surfaces from HTML references — admin multi-staff calendar, staff single-column schedule, and client self-service booking portal. Shared internals where sensible (grid primitives, tokens); hybrid Quick Book for admin/staff only. Client flow follows public booking spec (R2 §4); likely separate app route and APIs from internal calendars.
todos:
  - id: shared-primitives
    content: Extract shared calendar primitives (time axis, half-hour lines, now line, event block variants, open-gap blocks) for admin + staff only
  - id: admin-layout-shell
    content: Admin CalendarDayView — two-column grid + hybrid Quick Book; page head + below-grid (Needs attention, Recent activity, Today stats)
  - id: admin-calendar-grid
    content: Admin CalendarGrid + CalendarEventBlock — multi-staff toolbar, blocked/open-gap/alert treatments
  - id: admin-quick-book
    content: QuickBookPanel — admin variant; sidebar vs drawer; chips + summary per admin mock
  - id: staff-route-shell
    content: New staff schedule route + layout; auth scoped to logged-in staff member
  - id: staff-day-view
    content: Staff schedule — My schedule eyebrow, single column grid, staff-banner, Quick Book staff variant
  - id: staff-quick-book
    content: Staff Quick Book — restricted UI; note-strip; staffId locked to self
  - id: staff-below-grid
    content: Staff panels — Prep brief, My open gaps, Today actions
  - id: client-portal-shell
    content: Client portal layout — Wellos nav (Home, My Appointments, Forms, Files, Profile), avatar; magic-link/session auth per product spec (not Clerk for end clients)
  - id: client-booking-hero
    content: Hero band — eyebrow Client portal, headline, CTAs Quick Book / Book Again; upcoming appointment card with chips
  - id: client-booking-flow
    content: Self-service booking main column — step chips (Service → Provider → Time → Confirm), service grid, timezone-aware slot grid, preferences, upload dropzone; hide internal/admin fields
  - id: client-confirm-panel
    content: Sticky Confirm booking panel — identity fields, provider note, policy summary, safe-note (green), primary CTA; stack below ~980px
  - id: client-book-again
    content: Book again section — recent visits timeline with repeat actions (wire to APIs when available)
  - id: tokens-a11y
    content: Map all mocks to design tokens; breakpoints per mock (admin ~1100/720; staff ~980/720; client ~980/720)
---

# Calendar UI — Admin + Staff + Client HTML mockups

## Decisions (confirmed)

- **Quick Book (admin + staff):** Hybrid — persistent sidebar **`lg+`**; **drawer** below breakpoint.
- **Client surface:** Separate **public / client-portal** booking UX — not the same component as admin Quick Book; uses **multi-step self-service** flow and **confirm sidebar** per client HTML.

---

## Part A — Admin mockup

**Eyebrow:** Calendar · **Grid:** Time + **multiple staff** columns (headers with role · room). **Actions:** Day, Week, **All staff**, + Quick Book. **Quick Book:** Admin chips, full controls. **Below grid:** Needs attention · Recent activity · Today stats.

**Anchor:** [`apps/web/app/admin/calendar/`](apps/web/app/admin/calendar/).

---

## Part B — Staff mockup

**Eyebrow:** My schedule · **Grid:** Time + **one** column · **Staff banner** (avatar, name, stats · next up). **Actions:** Day, Week, Quick Book (no All staff). **Quick Book:** Staff Quick Book + amber **note-strip**. **Below:** Prep brief · My open gaps · Today actions.

**Codebase:** No **`/staff/schedule`** (or equivalent) yet — greenfield route + Clerk-linked staff identity TBD.

| Aspect | Admin | Staff |
|--------|-------|-------|
| Columns | Time + N staff | Time + **1** |
| Above grid | Column headers | **Banner** |
| Quick Book | Full admin | **Staff-safe**, no override UI |

---

## Part C — Client mockup (this message)

### Purpose

**Authenticated or magic-link client portal** — “Book your next visit” without exposing internal notes, admin controls, or staff-only fields (matches helper copy in mock).

### Structure

| Region | Client mock purpose |
|--------|---------------------|
| **Top bar** | Brand **Wellos**, nav **Home · My Appointments · Forms · Files · Profile**, avatar initial |
| **Hero** | Eyebrow **Client portal**, large headline, helper, **Quick Book** + **Book Again** CTAs; right **Upcoming appointment** card (service, time, provider, location, Confirmed + Add to calendar chips) |
| **Main layout** | Two columns: **`minmax(0,1fr)` + 360px sticky** booking panel; stacks at **980px** |
| **Left panel (`#book`)** | **Self-service booking** title + helper · **Steps:** `1 Service` (active) · `2 Provider` · `3 Time` · `4 Confirm` · **Service grid** (image placeholder, title, duration blurb, badges, Select / View details) · **Pick a time** + timezone label · **slot** buttons (incl. Waitlist) · **Quick preferences** (focus area, provider preference) · **upload** dashed box |
| **Right aside** | **Confirm booking** — name, email, phone, note for provider · **summary rows** (Service, Provider, Date, Policy) · **safe-note** (green — files/notes attach to visit + account) · **Book Appointment** CTA |
| **Below / full width** | **`#history` Book again** — timeline of recent visits with **Book again** per row |

### Spec alignment ([R2 buildout §4](docs/04-booking%20UI%20UX%20Update/wellos_booking_r2_uiux_package/wellos_calendar_booking_r2_uiux_buildout.md))

Maps to **public booking** steps: service → provider/time → details/policy → confirmation. Component names in §15.1 (`BookingShell`, `ServiceCard`, `SlotGrid`, `ClientDetailsForm`, `BookingSummaryPanel`, etc.) are the conceptual targets.

### Auth / product notes ([CLAUDE.md](CLAUDE.md))

End clients use **magic links** in MVP — **not** Clerk. Implementation must align session/booking token strategy with Epic 4 handoff; client portal may live on **`app.wellos.one`** path or **`wellos.studio`** depending on product split — **confirm route host when implementing**.

### Codebase status (client)

No dedicated **client booking / portal** route surfaced under [`apps/web/app`](apps/web/app/) or [`apps/studio`](apps/studio/) in a quick search — treat as **greenfield** next to future `GET /api/public/booking/...` contracts from R2 §14.

### Overlap with admin/staff

- **Do not** reuse internal `QuickBookPanel` as-is — client flow is **wizard + public APIs** (slot holds, confirm), different validation and **no staff directory pickers** unless exposed as “choose provider.”
- **Shared:** Design tokens, typography, `Button`/`Input` primitives from UI kit, possibly **slot chip** styling mirrored from admin grid aesthetics only.

---

## Three-way comparison

| Aspect | Admin | Staff | Client |
|--------|-------|-------|--------|
| Primary job | Ops floor / all staff | My day | Self-service book |
| Calendar grid | Multi-column | Single column | **None** — wizard + slots |
| Sticky side panel | Quick Book (internal) | Staff Quick Book | **Confirm booking** |
| Below-fold insights | Ops metrics | Prep / gaps / actions | **Book again** timeline |
| APIs | Admin appointments | Staff-scoped | **Public booking** + magic token |

---

## Design system compliance

All hex from mocks → **tokens** ([CLAUDE.md](CLAUDE.md)). No raw hex in TSX.

---

## Suggested implementation order

1. **Shared primitives** (admin + staff calendar geometry).
2. **Admin** calendar refresh (existing route).
3. **Staff** schedule (new route).
4. **Client portal** booking — can be **parallel epic** (different APIs); avoid blocking calendar ship on public booking backend readiness — use **stubbed steps** only if agreed.

---

## Files likely touched

**Admin / staff:** as in prior plan — [`admin/calendar/*`](apps/web/app/admin/calendar/), [`lib/calendar.ts`](apps/web/lib/calendar.ts), new `staff/schedule/*`.

**Client (new, indicative):**

- e.g. `apps/web/app/(portal)/book/page.tsx` or **`apps/studio`** route — **product decision**
- Components: `ClientBookingHero`, `BookingStepper`, `ServicePickerGrid`, `SlotPicker`, `ClientConfirmPanel`, `BookAgainTimeline`

---

## Out of scope (unless added later)

- Week view (all surfaces).
- Full **Waitlist** behavior until API exists.
- **Add to calendar** `.ics` export — wire when `appointments/.../calendar.ics` exists (R2 §4.5).

---

_Plan includes Admin, Staff, and Client HTML references; hybrid Quick Book applies to admin/staff only._
