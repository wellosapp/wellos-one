# Wellos — Calendar Area Features & Benefits

**Area:** Calendar Area  
**Feature Count:** 12 core features + 1 custom row  
**Purpose:** Define the Calendar Area as the operational command center for viewing, creating, moving, managing, and completing appointments across staff, services, clients, resources, and booking policies.

---

## 1. Calendar Area Overview

The Calendar Area is where staff and admin users manage the live schedule. It connects directly to the booking engine, services catalog, staff availability, client CRM, payments, reminders, and appointment lifecycle.

The calendar must feel simple on the surface while handling complex scheduling rules underneath.

Core jobs of the Calendar Area:

- Show the business schedule clearly by day, week, staff, room, or resource.
- Let staff create appointments quickly without leaving the calendar.
- Prevent double-booking through backend validation, not just UI blocking.
- Surface client notes, alerts, intake status, and appointment history at the moment staff needs them.
- Support rescheduling, cancellations, no-shows, check-in, completion, and follow-up workflows.
- Keep admin, staff, and client-facing booking views in sync.

---

## 2. Feature + Benefit Matrix

| # | Calendar Feature | What It Does | Benefit | Booking / CRM Connection |
|---:|---|---|---|---|
| 1 | Multi-View Calendar | Supports day, week, staff, resource, and list views. | Lets each user work in the view that fits their workflow. | Pulls from appointments, staff schedules, resources, and services. |
| 2 | Staff Column View | Shows each staff member as a separate schedule column. | Makes provider availability easy to scan. | Uses staff eligibility, service assignments, and working hours. |
| 3 | Quick Appointment Creation | Staff can click or drag on the calendar to create a booking. | Speeds up front desk and provider scheduling. | Opens booking panel with client, service, staff, time, and notes. |
| 4 | Right-Side Booking Panel | Appointment form opens in a side panel without leaving the calendar. | Keeps context visible while booking. | Connects to client search, CRM alerts, services, pricing, availability, and policies. |
| 5 | Drag-to-Reschedule | Staff can drag appointments to a new time or staff member. | Makes schedule changes fast and visual. | Revalidates availability, staff eligibility, buffers, resource conflicts, and cancellation policy. |
| 6 | Appointment Detail Drawer | Clicking an appointment opens details, status, client notes, service info, forms, and actions. | Reduces jumping between screens. | Pulls CRM notes, intake status, payment status, appointment history, and reminders. |
| 7 | Availability + Conflict Protection | Calendar blocks unavailable times, busy staff, buffers, and resource conflicts. | Prevents double-bookings and scheduling mistakes. | Uses the same availability engine as public booking and Quick Book. |
| 8 | Appointment Status Controls | Supports confirmed, checked-in, in-progress, completed, cancelled, and no-show. | Gives staff a clear operational workflow. | Status changes update CRM history, reminders, payments, reporting, and follow-up triggers. |
| 9 | Block Time / Time Off | Staff can block unavailable time for breaks, lunch, PTO, meetings, or personal holds. | Keeps availability accurate across booking channels. | Blocks public booking and staff booking from using that time. |
| 10 | Client Alert Strip | Shows key CRM alerts directly on appointment cards or inside the drawer. | Prevents missed allergies, preferences, billing notes, or behavioral flags. | Pulls alert-priority client notes and logs acknowledgments when required. |
| 11 | Calendar Filters | Filter by staff, service, location, status, room/resource, or appointment source. | Helps admin and staff find what matters fast. | Uses appointment metadata, service category, staff role, and source fields. |
| 12 | Calendar Sync Readiness | Supports future Google, Outlook, and Apple calendar sync behavior. | Helps staff avoid personal/business calendar conflicts. | External busy blocks affect availability but should never auto-cancel existing bookings. |
| 13 | Custom Calendar Row | Tenant/admin can add custom calendar logic or display data. | Lets each vertical adapt the calendar to its workflow. | Can connect to client tags, service type, room needs, forms, membership status, or custom flags. |

---

## 3. How the Calendar Works with Booking

The Calendar Area does not create a separate scheduling system. It is another surface on top of the same booking engine used by public booking, Quick Book, and staff booking.

### Shared booking logic

Every calendar-created appointment must pass through the same validation pipeline:

1. Staff user selects or drags a time on the calendar.
2. Calendar opens the appointment creation panel.
3. Staff selects client, service, staff member, room/resource if needed, and appointment time.
4. System calculates service duration, buffer time, price, cancellation policy, and staff eligibility.
5. System checks for conflicts:
   - Existing appointments
   - Staff working hours
   - Staff blocked time
   - Resource or room conflicts
   - Business closures or blackout dates
   - Minimum booking notice
   - Maximum booking horizon
6. If valid, appointment is created.
7. Appointment appears instantly on the calendar.
8. CRM, notifications, payments, and reporting receive the appointment event.

### Important rule

The calendar UI may visually prevent conflicts, but the backend must still enforce conflict protection. The calendar should never be trusted as the only source of validation.

---

## 4. Calendar User Views

### Admin View

Admin users need the most complete calendar view.

Admin should be able to:

- View all staff schedules.
- Filter by staff, service, room, location, status, and source.
- Create appointments for any eligible staff member.
- Override limited scheduling conflicts with permission and reason.
- View client alerts and appointment notes.
- Cancel, reschedule, mark no-show, check-in, and complete appointments.
- See payment/deposit status where permissions allow.
- Open client CRM from appointment detail.
- Create block time for staff or business-level closures.

### Staff View

Staff users should see what they need without being overwhelmed.

Staff should be able to:

- View their own calendar by default.
- See assigned appointments and client briefings.
- Create bookings if they have permission.
- Add appointment notes linked to the client record.
- Mark appointments checked-in, in-progress, or completed.
- Request or perform reschedules depending on permissions.
- Block personal availability if allowed by company settings.

### Front Desk View

Front desk users need speed.

Front desk should be able to:

- Book a walk-in quickly.
- Search existing clients.
- Create a new client inline.
- See staff availability by column.
- Move appointments with drag-and-drop.
- Send or resend reminders.
- See intake form status.
- Flag appointments that need admin attention.

### Client-Facing Calendar Connection

Clients do not see the internal calendar, but the public booking flow pulls from the same availability rules.

Client-facing booking should reflect:

- Available staff or “any available provider.”
- Service duration and buffers.
- Blocked staff time.
- Existing internal appointments.
- Business closures.
- Resource conflicts.
- Booking policy: instant, request approval, or staff-only.

---

## 5. Feature Details

### 1. Multi-View Calendar

The calendar should support multiple viewing modes:

- Day view
- Week view
- Staff view
- Resource/room view
- List/agenda view
- Mobile compact view

**Benefit:** Different roles work differently. A front desk user may prefer staff columns, while a provider may prefer a simple agenda.

**Build note:** Views should share the same appointment data response and only change the layout rendering.

---

### 2. Staff Column View

Staff Column View shows staff members across the top or side with their appointments stacked by time.

Each staff column should show:

- Staff name
- Avatar or initials
- Working status
- Appointment count
- Open slots
- Blocked time
- Current/next appointment highlight

**Benefit:** This gives admin and front desk a fast “who is available?” answer.

**Booking connection:** When staff creates an appointment inside a staff column, that staff member should prefill in the booking panel.

---

### 3. Quick Appointment Creation

Staff should be able to create an appointment by:

- Clicking an empty time slot
- Dragging across a time range
- Clicking “Quick Book”
- Clicking “Book again” from a client’s appointment history
- Clicking an open slot suggestion

**Benefit:** Reduces friction for walk-ins, phone bookings, and rebooking after checkout.

**CRM connection:** If a client is selected first, the booking form should immediately surface alerts, preferences, and recent visits.

---

### 4. Right-Side Booking Panel

Instead of navigating away, booking opens in a right-side panel on desktop and a bottom/full-screen sheet on mobile.

The panel should include:

- Client search/create
- Service selector
- Staff selector
- Date/time selector
- Resource/room selector if required
- Notes field
- Internal staff note field
- Price/deposit summary
- Cancellation policy summary
- Save/book button

**Benefit:** Staff keeps the calendar visible while completing the booking.

**UX rule:** The panel should feel fast and guided, not like a giant admin form.

---

### 5. Drag-to-Reschedule

Staff can move an appointment by dragging it to a new time, staff member, or resource lane.

When dropped, the system must:

- Recheck staff availability.
- Recheck staff eligibility for the selected service.
- Recheck room/resource availability.
- Recalculate buffers.
- Warn if client reminders need to be resent.
- Ask for a reason if required by policy.

**Benefit:** Makes schedule cleanup fast and visual.

**Important:** Dragging should never silently force a conflict. If the move fails validation, the appointment snaps back and explains why.

---

### 6. Appointment Detail Drawer

Clicking an appointment opens a detail drawer.

The drawer should show:

- Client name and contact details
- Service name, duration, and price
- Staff/provider
- Date/time
- Appointment status
- Payment/deposit status
- Intake form status
- Notes for provider
- Internal notes
- Client alerts
- Recent appointment history
- Reminder history
- Actions: check in, start, complete, reschedule, cancel, no-show, open CRM

**Benefit:** Staff can manage the appointment without hunting through multiple screens.

---

### 7. Availability + Conflict Protection

Calendar availability must be powered by the scheduling engine.

Conflict checks include:

- Staff schedule
- Existing appointments
- Service duration
- Before/after buffers
- Staff blocked time
- Business hours
- Location closures
- Resource/room availability
- External calendar busy blocks
- Minimum booking notice
- Maximum booking window

**Benefit:** Prevents operational mistakes and protects trust with clients.

**Engineering rule:** Availability is computed, not stored as static time slots.

---

### 8. Appointment Status Controls

Appointments should move through a clear lifecycle:

```text
requested / pending_payment
→ confirmed
→ checked_in
→ in_progress
→ completed

Alternate endings:
→ cancelled
→ no_show
→ declined
```

Status actions should be permission-aware.

Examples:

- Front desk can check in a client.
- Provider can start and complete their own appointment.
- Admin can cancel or override.
- Subcontractor may only update their own appointments.

**Benefit:** Keeps calendar, CRM, reporting, reminders, and payments aligned.

---

### 9. Block Time / Time Off

Staff can block time for:

- Lunch
- Breaks
- PTO
- Meetings
- Training
- Personal appointments
- Room maintenance
- Business closures

Block time should have:

- Title
- Time range
- Staff or resource assignment
- Repeat option if allowed
- Visibility setting
- Reason/category

**Benefit:** Keeps public and internal booking accurate.

**Booking connection:** Blocked time removes availability from client-facing booking immediately.

---

### 10. Client Alert Strip

When an appointment is selected, client alerts should be visible immediately.

Examples:

- Allergy alert
- Medical note
- Behavioral flag
- Billing note
- Preferred pressure level
- Formula note
- Banned or restricted booking flag
- Outstanding balance

**Benefit:** Prevents staff from missing critical context.

**CRM connection:** Alerts come from structured client notes and can be linked directly to the appointment.

---

### 11. Calendar Filters

Calendar filters should help users focus.

Filter options:

- Staff
- Service
- Service category
- Appointment status
- Room/resource
- Location
- Client tag
- Appointment source
- Payment status
- Intake form status

**Benefit:** Admin can quickly find schedule problems, open slots, pending appointments, or client groups.

---

### 12. Calendar Sync Readiness

The calendar should be designed to support external sync later.

Supported future sync targets:

- Google Calendar
- Outlook Calendar
- Apple Calendar / CalDAV

External calendar behavior:

- Pull external busy blocks into availability.
- Do not expose private event details.
- Do not auto-cancel existing Wellos appointments if a conflict appears.
- Flag conflicts for staff review.

**Benefit:** Reduces accidental double-booking for providers who use personal calendars.

---

### 13. Custom Calendar Row

Each tenant should be able to add one or more custom display or logic rows depending on their vertical.

Examples:

| Vertical | Custom Row Example |
|---|---|
| Salon | Formula needed, color room, shampoo assistant |
| Medspa | Consent required, before/after photos required, contraindication review |
| Massage | Pressure preference, focus area, therapist ETA |
| Fitness | Class capacity, waitlist count, spot selection |
| Personal Training | Package/session count remaining |

**Benefit:** Lets the same calendar support multiple service industries without creating separate calendar products.

---

## 6. Calendar + CRM Write-Back Behavior

The Calendar Area should not just display appointments. It should update the client record and appointment history automatically.

When an appointment is created:

- Add appointment to client history.
- Link selected service to the client’s visit timeline.
- Save booking source.
- Save client notes entered during booking.
- Save staff/internal notes separately.
- Trigger intake form assignment if required.
- Trigger confirmation message if enabled.

When an appointment is completed:

- Update client last visit date.
- Increment client total visits.
- Add revenue/lifetime value once payment is complete.
- Store appointment notes.
- Trigger follow-up, review request, or rebooking prompt if enabled.

When an appointment is cancelled or marked no-show:

- Save status to client history.
- Evaluate cancellation/no-show policy.
- Add outstanding balance if fee fails.
- Trigger appropriate notification.
- Release the calendar slot if allowed.

---

## 7. Calendar Appointment Card Design

Appointment cards should be readable at a glance.

Each card should show:

- Time
- Client name
- Service name
- Status indicator
- Staff/provider color or service color
- Small alert icon if client has active alerts
- Payment/deposit indicator if needed
- Intake form status icon if needed

### Recommended card states

| State | Visual Behavior |
|---|---|
| Confirmed | Normal card |
| Requested | Dashed or pending-style card |
| Checked in | Stronger active marker |
| In progress | Active progress indicator |
| Completed | Muted/completed style |
| Cancelled | Hidden by default or shown in cancelled layer |
| No-show | Warning marker |
| Needs attention | Alert icon or top stripe |

---

## 8. Calendar Data Objects

### Appointment

Minimum fields needed by calendar:

```ts
type CalendarAppointment = {
  id: string;
  tenantId: string;
  locationId: string;
  clientId: string;
  clientName: string;
  staffMemberId: string;
  staffName: string;
  serviceId: string;
  serviceName: string;
  resourceId?: string;
  startsAtUtc: string;
  endsAtUtc: string;
  timezone: string;
  status: AppointmentStatus;
  source: 'consumer_web' | 'staff_web' | 'widget' | 'api' | 'import';
  priceCents: number;
  depositCents?: number;
  hasClientAlerts: boolean;
  intakeStatus?: 'not_required' | 'pending' | 'sent' | 'completed' | 'expired';
  paymentStatus?: 'not_required' | 'pending' | 'paid' | 'failed' | 'refunded';
};
```

### Block Time

```ts
type CalendarBlock = {
  id: string;
  tenantId: string;
  locationId: string;
  staffMemberId?: string;
  resourceId?: string;
  title: string;
  category: 'break' | 'lunch' | 'pto' | 'meeting' | 'maintenance' | 'closure' | 'custom';
  startsAtUtc: string;
  endsAtUtc: string;
  timezone: string;
  visibility: 'internal' | 'public_busy';
};
```

---

## 9. Suggested API Endpoints

```text
GET    /api/calendar?date=YYYY-MM-DD&view=day|week|staff|resource
GET    /api/calendar/appointments/:id
POST   /api/calendar/appointments
PATCH  /api/calendar/appointments/:id
PATCH  /api/calendar/appointments/:id/reschedule
PATCH  /api/calendar/appointments/:id/status
POST   /api/calendar/blocks
PATCH  /api/calendar/blocks/:id
DELETE /api/calendar/blocks/:id
GET    /api/calendar/availability?serviceId=&staffId=&date=
GET    /api/calendar/filters
```

All appointment writes should support idempotency keys.

**Repo note:** The Fastify API in this monorepo namespaces admin routes under `/admin/...` (see `apps/api`). When implementing, align concrete paths and auth with existing `appointments`, `availability`, and related routes rather than copying `/api/calendar` literally.

---

## 10. Edge Cases to Watch

| Edge Case | Required Behavior |
|---|---|
| Slot taken while staff is booking | Show conflict message and suggest nearest available slots. |
| Dragged appointment conflicts with another booking | Snap back and explain conflict. |
| Staff no longer performs service | Block move unless admin override is allowed. |
| Resource unavailable | Show resource conflict and suggest another room/time. |
| DST/timezone shift | Use tenant timezone for display, UTC for storage. |
| Client is banned | Block public booking; require admin override in staff booking. |
| Intake required but incomplete | Show pending intake indicator on appointment card. |
| Payment failed | Show payment warning and link to payment action. |
| External calendar conflict appears after booking | Flag conflict; never auto-cancel. |
| Staff deleted/soft-deleted | Preserve historical appointments but prevent new bookings. |

---

## 11. Acceptance Criteria

The Calendar Area is ready when:

- Admin can view all staff schedules.
- Staff can view their assigned schedule.
- Front desk can create an appointment from the calendar.
- Appointment creation opens in a side panel without leaving the calendar.
- Calendar-created appointments use the same availability engine as public booking.
- Drag-to-reschedule validates conflicts before saving.
- Block time removes availability from booking surfaces.
- Appointment detail drawer shows CRM context, notes, alerts, intake status, and actions.
- Appointment status changes update CRM history and reporting events.
- Client alerts are visible before or during appointment management.
- Filters work by staff, service, status, resource, and source.
- Calendar is mobile responsive.
- Custom calendar row logic can be added without rebuilding the core calendar.

---

## 12. Build Priority

### MVP

1. Day view
2. Staff column view
3. Appointment creation side panel
4. Appointment detail drawer
5. Availability conflict protection
6. Drag-to-reschedule
7. Appointment status controls
8. Block time
9. Client alert strip
10. Basic filters

### Growth

1. Week/resource views
2. External calendar sync
3. Advanced custom rows
4. Calendar analytics
5. Multi-location calendar
6. Auto waitlist promotion
7. Class/group calendar capacity views

---

## 13. Final Build Note

The Calendar Area should feel like a simple visual schedule, but it is actually a coordination layer between scheduling, services, staff, CRM, payments, notifications, and reporting.

The winning user experience is:

> Staff can look at the calendar and immediately know what is happening, what needs attention, and what action to take next.

---

## Related docs (this repo)

| Doc | Role |
|-----|------|
| [staff-booking-client-crm.md](./staff-booking-client-crm.md) | Staff booking + CRM snapshot, alerts, flows |
| [staff-booking-implementation-map.md](./staff-booking-implementation-map.md) | Spec ↔ codebase gaps and build order |
| [services-catalog-features.md](./services-catalog-features.md) | Services & Catalog matrix, eligibility, policies, MVP vs roadmap |
| [calendar-ui-update-2026-05-02.md](./calendar-ui-update-2026-05-02.md) | Recent admin calendar UI iteration notes |
