# Admin Client Profile — Quick Book Developer Handoff

**Canonical handoff for:** Quick Book from Admin Client Profile (right-side drawer / rail).

**Document saved:** 2026-05-02 at **14:51:32** local (**-07:00**).

**Related:** Dashboard Quick Book, calendar Quick Book, drag-to-create, walk-ins, public booking — shared booking engine and idempotency expectations.

---

## Build goal

When Admin clicks **Quick Book** from the client profile, the app should **stay on the same client profile page** and open a **right-side Quick Book drawer / rail**. The current client is already known, so the booking flow should prefill the client automatically and let the admin book without leaving the profile.

This should connect to the same booking engine used by dashboard Quick Book, calendar drag-to-create, walk-ins, and public booking so appointment creation stays consistent across the platform. The Quick Book spec already expects client search, service dropdown, time slot selection, optimistic UI, rollback on failure, “Any staff,” and idempotency protection.

---

## 1. UX behavior

### Trigger

Admin clicks:

```txt
Client Profile Header → Quick Book
```

### Result

Open a **right-side panel** without navigating away.

```txt
Client profile remains visible on the left.
Quick Book drawer opens on the right.
Current client is locked/preselected.
Admin chooses service, staff, date, time, notes, and confirmation options.
```

### Desktop behavior

- Right drawer slides in from the right.
- Width: **420px–480px**.
- Sticky/fixed to viewport height.
- Main profile content remains visible.
- Drawer can close with:
  - X button
  - Escape key
  - Cancel button
  - Clicking outside **only if** no unsaved form changes

### Tablet behavior

- Drawer can be **50–60%** width.
- If screen is cramped, convert to modal sheet.

### Mobile behavior

- Use full-screen modal or bottom sheet.
- Keep the same form steps, but stacked.

---

## 2. Required user flow

```txt
Admin clicks Quick Book
→ Open QuickBookDrawer
→ Prefill client from current profile
→ Load services, staff, locations, booking rules
→ Admin selects service
→ System filters eligible staff
→ Admin selects staff or Any Available
→ Admin selects date
→ System fetches available slots
→ Admin selects slot
→ Admin adds optional note
→ Admin chooses send confirmation / send intake options
→ Admin clicks Book Appointment
→ System revalidates slot
→ Appointment is created
→ Optional note is attached to appointment/client
→ Client profile refreshes in place
→ Drawer shows success state or closes
```

Quick Book should support staff-created bookings where payment is not always collected immediately. Staff Quick Book does not collect payment directly; if no card is on file, the appointment can be created with pending payment and collected later at checkout.

---

## 3. Right-side drawer layout

### Drawer header

```txt
Quick Book
Booking for Test First Test Last
Client ID: CL-000002 · Active · First-time
```

Include:

- Client avatar/initials
- Client name
- Client ID
- Status badge
- Close button

### Section 1 — Service

**Fields:**

- Service dropdown
- Service category filter if many services exist
- Duration preview
- Price preview
- Deposit/payment rule preview if enabled

**Behavior:**

- Service must be selected before showing slots.
- Selecting service resets selected staff, date slots, and selected time if those are no longer valid.

### Section 2 — Staff

**Fields:**

- Staff selector
- Option: **Any Available**
- Show only staff who can perform the selected service.

**Behavior:**

- If “Any Available” is chosen, server assigns based on availability rules.
- If specific staff is chosen, availability is filtered to that staff.

### Section 3 — Date

**Fields:**

- Date picker
- Quick options: **Today**, **Tomorrow**, **Next available**

**Behavior:**

- Changing date clears selected slot.
- Availability refetches.

### Section 4 — Time

**Fields:**

- Slot grid
- Morning / Afternoon / Evening grouping if enough slots exist
- Empty state if no slots exist

**Slot states:**

```txt
Available
Selected
Unavailable
Loading
Held / saving
```

If the slot is unavailable after submit, show a clear message and refresh slot options (stale-slot handling, `slot_unavailable` recovery).

### Section 5 — Appointment details

**Fields:**

- Internal appointment note
- Optional client-facing note
- Send confirmation checkbox
- Send intake checkbox if service requires intake
- Optional payment link checkbox if deposit/card is required but missing

**Note rule:**

```txt
Any note entered during Quick Book must be attached to:
1. appointment_id
2. client_id
3. author_user_id
4. visibility type: internal/client-facing
5. created source: admin_quick_book
```

### Drawer footer

Always sticky at bottom.

**Summary example:**

```txt
Test Service 3
Sara Thompson
May 4, 2026 · 6:00 AM
30 minutes
Main Location
```

**Buttons:**

```txt
[Cancel] [Book Appointment]
```

**Loading:**

```txt
[Booking…]
```

**Success:**

```txt
Appointment booked.
[View appointment] [Send intake] [Book another]
```

---

## 4. Components to build

### Page-level

```tsx
AdminClientProfilePage
```

Responsibilities:

- Fetch client profile data.
- Render profile header, tabs, overview cards, visits, notes, files, intake.
- Own Quick Book drawer state.
- Refresh client profile after appointment creation.

### Client profile

```tsx
ClientHeaderCard
ClientProfileTabs
ClientOverviewCards
RecentVisitsList
ClientNotesPanel
ClientFilesPanel
ClientIntakePanel
ClientActivityTimeline
```

### Quick Book

```tsx
QuickBookDrawer
QuickBookHeader
QuickBookClientLockCard
QuickBookServiceSelect
QuickBookStaffSelect
QuickBookDatePicker
QuickBookSlotGrid
QuickBookAppointmentDetails
QuickBookSummaryFooter
QuickBookSuccessState
QuickBookErrorState
```

### Shared UI

Use existing design system primitives: `Button`, `Card`, `Badge`, `Avatar`, `Input`, `Select`, `Textarea`, `Toast`, `Skeleton`, `Drawer`.

Warm professional UI, tokenized colors, Sora/DM Sans typography — no arbitrary one-off styling.

---

## 5. Frontend state shape

```ts
type QuickBookDrawerSource =
  | 'client_header'
  | 'recent_visit'
  | 'upcoming_appointment_card'
  | 'calendar_open_slot';

type QuickBookMode = 'create' | 'book_again';

type QuickBookState = {
  isOpen: boolean;
  mode: QuickBookMode;
  source: QuickBookDrawerSource | null;

  clientId: string;
  clientName: string;
  clientStatus?: 'active' | 'inactive' | 'banned';
  clientTags?: Array<{
    id: string;
    name: string;
    color: string;
  }>;

  locationId: string | null;
  serviceId: string | null;

  staffMode: 'any_available' | 'specific';
  staffId: string | null;

  date: string;
  selectedSlot: {
    startUtc: string;
    endUtc: string;
    startLocal: string;
    endLocal: string;
    staffId: string;
    staffName: string;
  } | null;

  durationMinutes: number | null;
  priceCents: number | null;

  internalNote: string;
  clientNote: string;

  sendConfirmation: boolean;
  sendIntake: boolean;
  sendPaymentLink: boolean;

  isLoadingInit: boolean;
  isLoadingAvailability: boolean;
  isSubmitting: boolean;

  error: {
    code: string;
    message: string;
    field?: string;
  } | null;
};
```

---

## 6. Core frontend functions

| Function | Responsibilities |
|----------|------------------|
| `openQuickBookDrawer({ clientId, source, mode?, prefill? })` | Opens drawer, locks client, optional prefill (recent visit, calendar slot), calls `initializeQuickBook()`. |
| `initializeQuickBook(clientId)` | Fetch init: services, staff, locations, defaults; default date today; default staff mode `any_available`. |
| `handleServiceChange(serviceId)` | Set service; reset ineligible staff/slot; duration/price; refetch availability. |
| `handleStaffChange(staffMode, staffId?)` | Update staff; clear slot; refetch availability. |
| `handleDateChange(date)` | Update date; clear slot; refetch availability. |
| `fetchQuickBookAvailability(state)` | Inputs: clientId, serviceId, staffMode, staffId, locationId, date, durationMinutes. Returns slots + optional `nextAvailable`. |
| `handleSlotSelect(slot)` | Set selected slot; update footer; enable Book. |
| `submitQuickBook()` | Validate; **idempotency key**; POST; handle success/failure (no double-submit). |
| `onQuickBookSuccess(appointment)` | Toast; refresh overview, upcoming, visits, activity; optional close or success actions. |
| `onQuickBookError(error)` | Map codes: `slot_unavailable`, `client_required`, `service_required`, `staff_unavailable`, `service_inactive`, `client_banned`, `validation_failed`, `payment_required`, `unknown_error`. |

---

## 7. Backend API routes

### 7.1 Initialize Quick Book

```http
GET /api/admin/clients/:clientId/quick-book/init
```

**Response shape (`QuickBookInitResponse`):**

- `client` — id, name, initials, status, clientNumber, tags, preferredStaffId?, lastServiceId?, intakeStatus?
- `locations` — id, name, timezone, isDefault
- `services` — id, name, category?, durationMinutes, priceCents, color, active, eligibleStaffIds, requiresIntake, depositRequired
- `staff` — id, name, initials, active, serviceIds
- `defaults` — locationId, date, staffMode, staffId?, sendConfirmation, sendIntake
- `bookingRules` — minNoticeMinutes, maxBookingDays, allowAdminOverride, allowPendingPayment

### 7.2 Fetch availability

```http
GET /api/admin/quick-book/availability
```

**Query:** `clientId`, `serviceId`, `locationId`, `staffMode=any_available|specific`, `staffId`, `date=YYYY-MM-DD`

**Response (`QuickBookAvailabilityResponse`):** `timezone`, `slots[]` (with `available`, `reasonUnavailable?`), `nextAvailable?`

Availability must reflect working hours, duration, buffers, existing appointments, location hours, blackouts, min notice, max horizon, timezone-safe math.

### 7.3 Create Quick Book appointment

```http
POST /api/admin/appointments/quick-book
```

**Request (`CreateAdminQuickBookRequest`):** `idempotencyKey`, `clientId`, `locationId`, `serviceId`, `staffMode`, `staffId?`, `startUtc`, `endUtc`, notes, toggles, `source: 'admin_client_profile_quick_book'`

**Response (`CreateAdminQuickBookResponse`):** `appointment` summary, `sideEffects` (confirmationQueued, intakeQueued, paymentLinkQueued, noteCreated, activityCreated)

---

## 8. Backend service function

```ts
async function createAdminQuickBookAppointment(
  input: CreateAdminQuickBookRequest,
  context: RequestContext,
) {}
```

**Execution order:**

1. Validate admin/manager/front-desk permission.
2. Validate tenant ownership of client, service, staff, location.
3. Validate service is active.
4. Validate staff can perform selected service.
5. Recalculate availability server-side.
6. If slot unavailable → **422** `slot_unavailable`.
7. Resolve staff if `staffMode` is `any_available`.
8. Create appointment in a transaction.
9. Write appointment status history.
10. Write appointment-linked note if provided.
11. Write client activity event.
12. Queue confirmation if enabled.
13. Queue intake if enabled and required.
14. Queue payment link if enabled.
15. Return appointment payload.

**Do not trust the frontend slot** — backend must revalidate at submit.

---

## 9. Appointment notes behavior

Save notes as appointment-linked records with: `tenantId`, `clientId`, `appointmentId`, `authorUserId`, `body`, `visibility` (`internal` | `client_visible`), `source: 'admin_quick_book'`.

Surface in: Notes tab, Activity tab, appointment drawer, visit context.

---

## 10. UI improvements (reference screenshot)

### Header actions (recommended order)

```txt
[Quick Book] [Add Note] [Edit Profile] [More]
```

- Quick Book = primary revenue/action workflow.
- Add Note = high frequency.
- Edit Profile = less frequent.

### Layout

Use intentional right-side space: profile content left, **Quick Book drawer** as fixed right rail on desktop.

### Overview cards

Tighten hierarchy; stronger CTAs on Notes / Files / Intake cards (“Add first note”, “Upload file”, “Send intake”).

### Recent visits

Each row: service, date/time · staff, status, quick action. Actions: View appointment, Book again (opens Quick Book with prefill), Add note.

---

## 11. Validation rules

**Required:** `clientId`, `serviceId`, `locationId`, `date`, `selectedSlot`

**Conditional:** `staffId` when `staffMode = specific`; payment link only when pending/deposit required; send intake only when service requires intake.

**Error copy map:**

```ts
const QUICK_BOOK_ERRORS = {
  SLOT_UNAVAILABLE: 'That time was just booked. We refreshed available times.',
  SERVICE_REQUIRED: 'Choose a service before booking.',
  STAFF_UNAVAILABLE: 'This provider is no longer available for that time.',
  SERVICE_INACTIVE: 'This service is inactive. Choose another service.',
  CLIENT_BANNED: 'This client cannot be booked without owner override.',
  VALIDATION_FAILED: 'Check the highlighted fields.',
  UNKNOWN: 'Something went wrong. Try again.',
};
```

---

## 12. Success UI

- Toast: “Appointment booked successfully.”
- Actions: View appointment, Send intake, Book another, Close.
- Refresh: upcoming card, visits list, visits count, activity, Notes tab if note added, Intake card if intake sent.

---

## 13. Build order

| Phase | Steps |
|-------|--------|
| **1 — UI shell** | QuickBookDrawer; wire header button; lock client in header; skeleton/loading. |
| **2 — Init data** | `GET quick-book/init`; render service/staff/date controls. |
| **3 — Availability** | Availability endpoint; fetch on changes; slot grid; empty + next available. |
| **4 — Create** | `POST quick-book`; idempotency; server slot revalidation; notes; side effects. |
| **5 — Profile refresh** | Revalidate server data; toast; success actions. |
| **6 — Polish** | a11y, Escape, mobile full-screen, skeletons, errors, Playwright happy path + slot unavailable. |

---

## 14. Acceptance criteria

```txt
✓ Admin clicks Quick Book from client profile → drawer opens on the right.
✓ Client prefilled and locked (unless explicit other workflow).
✓ Admin selects service, staff/any, date, slot.
✓ Slots from backend availability.
✓ Backend revalidates slot before booking.
✓ Double-click Book creates only one appointment (idempotency).
✓ Slot taken → UI refreshes availability + clear error.
✓ Profile updates without full page reload.
✓ Notes save to client + appointment with correct visibility/source.
✓ Upcoming + recent visits update; activity logs booking.
✓ Send confirmation / intake toggles queue side effects when applicable.
✓ Mobile: full-screen drawer/sheet.
✓ Role restrictions respected (provider/subcontractor).
```

---

## Appendix — Route prefix note

Handoff examples use `/api/admin/...`. Align path prefixes with the repo’s actual API layout (e.g. Fastify `/admin/...` behind `api.wellos.one`) and web client wrappers in `apps/web/lib/api/` when implementing.
