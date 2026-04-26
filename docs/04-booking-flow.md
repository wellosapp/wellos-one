# Booking Flow

**Project:** Velura (Mindbody / Vagaro / GlossGenius Rebuild)
**Document:** 04 — Booking Flow UX Specification
**Status:** Draft
**Version:** 1.0
**Date:** April 21, 2026
**Author:** Claude (in conversation with Matthew)
**Companion docs:** `01-design-system.md`, `02-onboarding-flow.md`, `03-dashboard-today-view.md`, `09-dev-handoff.md`, `technical-build-spec.md`

---

## Overview

The booking flow is the operational core of Velura. Every other feature — intake forms, checkout, reminders, reviews, payroll, reporting — either feeds into or consumes from a booking. This document specifies the client-facing (public, no login) and staff-facing (authenticated, in-app) surfaces of the booking experience, plus the two-tier company/staff settings model that governs how bookings behave for each tenant.

The design posture is deliberate: borrow GlossGenius's polished, login-free client flow; borrow Mindbody's enterprise-grade settings depth; borrow Vagaro's modular embeddability. Underneath all three surfaces is a single availability engine and a single `Appointment` table. The UX diverges by persona; the data does not.

The brand voice is **warm in framing, precise in facts**. Warmth lives in the connective tissue ("You're booked.", "See you Thursday."); precision lives in the facts that matter operationally or legally (exact timestamps, exact deposit amounts, exact fee triggers). This voice is applied consistently across every screen in this spec.

---

## Goals

- Client can book a first appointment in under 90 seconds on mobile, one-handed
- Staff can book a walk-in in under 30 seconds on mobile
- Staff can create an appointment from the full calendar in under 20 seconds on desktop
- Zero double-bookings under any race condition (enforced at the DB via `EXCLUDE` constraint)
- Every two-tier setting resolves predictably through the precedence chain
- Every tenant's booking policy (INSTANT / REQUEST_APPROVAL / STAFF_ONLY) is respected end-to-end
- Cancellations and reschedules via magic link work in under 30 seconds on mobile
- Post-review tip flow captures incremental tip revenue without creating friction or awkwardness

---

## Non-Goals

This document does not cover:

- Classes and group appointments (Phase 2, per `09-dev-handoff.md` Appendix A)
- Multi-service stacked bookings in the UI (schema supports it; UI is Phase 2)
- Pick-a-spot seating for classes (Phase 2)
- Memberships and package redemption inside the booking flow (separate doc, P2-4)
- Gift card sales during booking (P2-4)
- Social booking — Instagram, Facebook, Google Reserve (Phase 2, P2-6)
- Native mobile app flows (Phase 3)
- Multi-location / franchise booking (Phase 3)
- AI receptionist handling inbound booking via SMS or voice (Phase 2, P2-1)
- The full review capture system (flagged as dependency; not designed here)

---

## Assumptions

- Tenant has completed onboarding per `02-onboarding-flow.md`
- At least one active staff member exists with at least one service assigned
- Booking policy has been chosen during onboarding
- Company-level booking settings have been configured during onboarding (with sensible defaults)
- Stripe is connected (deposits and post-review tips require payments; booking without payments is supported as a degraded mode)
- Twilio is configured (SMS magic links, reminders, waitlist notifications)
- Resend is configured (email confirmations, magic links, receipts)
- The availability engine from `09-dev-handoff.md` Epic 3 is implemented

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Double-booking under concurrent requests | Medium | Severe | Postgres `EXCLUDE` constraint on `staff_id + time range`; idempotency keys on all create endpoints |
| Cancellation window math wrong around DST | Medium | High (charges clients incorrectly) | All window math in tenant timezone via `luxon`; dedicated DST test suite |
| Client booking a slot that was just taken | High | Medium (frustrating UX) | Slot hold (7 min) from first field interaction; re-validate at submit; clear error state |
| Deposit charged but booking creation fails | Low | Severe | Transactional pattern: create appointment first (unconfirmed), then capture deposit, then confirm; rollback on failure |
| Client merged into wrong account via email match | Medium | Severe (privacy breach) | Two-factor match (email + phone or email + name); "not you?" escape hatch on confirmation |
| Post-review tip charged on a stale card | Low | Medium | Validate card before showing prompt; graceful fallback if declined |
| Staff overrides double-book without clear audit trail | Medium | High | Required reason field; append-only `AuditLog` entry; manager approval for non-manager overrides |
| Company changes a setting that invalidates existing bookings | Medium | High | Settings changes apply to new bookings only; existing bookings honor their original terms |
| External calendar busy block conflicts with a booking already placed | Medium | Medium | 15-min polling creates busy blocks; conflicts flagged to staff, never auto-cancelled |
| Client's preferred staff is removed from a service mid-booking | Low | Low | Slot hold persists; at submit, fall back to "any available" with explicit notice |

---

## Flow Map

```
CLIENT-FACING (public, no login)
├── A. First-time booking ─────────────── happy path
├── B. Returning client booking ───────── silent match + "not you?" escape
├── C. Request-approval booking ───────── REQUEST_APPROVAL tenants only
├── D. Reschedule via magic link ──────── from reminder SMS/email
├── E. Cancel via magic link ──────────── inside/outside cancellation window
├── F. Waitlist signup ────────────────── preferred slot unavailable
├── G. Waitlist conversion ────────────── SMS notification → book
├── H. Intake form trigger ────────────── service requires form, post-booking
├── I. Deposit collection ─────────────── charged at booking time
└── J. Post-review tip flow ───────────── 5★ review + no tip given → prompt

STAFF-FACING (authenticated)
├── K. Quick Book (dashboard widget) ──── fast path, specced in 03
├── L. Full-calendar drag-to-create ───── primary staff flow
├── M. Walk-in booking ────────────────── minimal fields, new client inline
├── N. Block time off ─────────────────── staff unavailability
├── O. Manager override ───────────────── double-book with reason
├── P. Reschedule (drag) ──────────────── move appointment on calendar
└── Q. Staff-initiated cancel ─────────── never charges client
```

Each flow is specified in full in the `Detailed Flows` section below.

---

## Two-Tier Settings Architecture

### The Pattern

Every booking-related setting in Velura resolves through a precedence chain that respects both company authority and staff autonomy. This pattern is critical — it appears in at least 16 settings across the booking flow alone, and if it's not formalized now, each setting will be retrofitted differently later.

**Precedence (highest to lowest):**

1. Per-appointment override (manager override with reason; rare)
2. Staff-level setting (only if company allows staff control)
3. Company-level setting (default for all bookings)
4. System default (sensible fallback if company hasn't configured)

**Company-level control modes:**

Every two-tier setting has four possible company states:

| Mode | Company sets | Staff sees |
|---|---|---|
| `LOCKED` | Fixed value | Read-only display of the company value |
| `DEFAULT_OVERRIDABLE` | Default value | Pre-filled with company default, editable |
| `STAFF_CONTROLLED` | Nothing (delegates to staff) | Blank field, staff must set |
| `DISABLED` | Feature off entirely | Setting hidden from staff UI |

The staff's value is always stored in the database, even when overridden by company lock. This means if the company later switches from `LOCKED` to `DEFAULT_OVERRIDABLE`, the staff's prior preference comes back online automatically rather than being lost.

### Resolution Logic (for the engineering buildout)

When the booking engine needs a setting value (e.g., cancellation window for a specific appointment), it calls:

```
resolveSetting(settingKey, appointmentId) {
  1. Check appointment-level override → return if present
  2. Check company setting's control mode:
     - LOCKED → return company value
     - DEFAULT_OVERRIDABLE → check staff value; return staff value if set, else company default
     - STAFF_CONTROLLED → return staff value; error if staff hasn't set it
     - DISABLED → return null (feature off)
  3. Fall back to system default
}
```

The `AuditLog` records every resolution for compliance; this is free because settings changes are infrequent and the log table already exists.

### Settings Inventory

The following settings are two-tier. This list is the source of truth; if a new booking-related setting is added later, it defaults to two-tier unless explicitly decided otherwise.

| # | Setting | Company-only or two-tier | Default system value |
|---|---|---|---|
| 1 | Booking policy (INSTANT / REQUEST / STAFF_ONLY) | Company-only | INSTANT |
| 2 | Deposits enabled | Two-tier | Off |
| 3 | Deposit amount | Two-tier | $50 when enabled |
| 4 | Cancellation window | Two-tier | 24 hours |
| 5 | Cancellation fee | Two-tier | Same as deposit amount, or $0 if no deposit |
| 6 | No-show fee | Two-tier | Same as cancellation fee |
| 7 | Minimum booking notice | Two-tier | 2 hours |
| 8 | Maximum booking window | Two-tier | 90 days |
| 9 | Buffer time between appointments | Two-tier | 0 minutes |
| 10 | Service offerings (which services each staff performs) | Two-tier | Staff starts with no services; company assigns |
| 11 | Working hours | Two-tier | Company business hours |
| 12 | Break/lunch scheduling | Two-tier | None |
| 13 | Walk-in acceptance | Two-tier | On (company), per-staff override off |
| 14 | Tips enabled | Two-tier | On |
| 15 | Default tip percentages | Two-tier | 15% / 18% / 20% / Custom |
| 16 | Tip prompt timing (checkout / booking / both) | Two-tier | Checkout only |
| 17 | Post-review tip prompt enabled | Two-tier | On |
| 18 | Post-review tip minimum rating | Company-only | 5 stars |
| 19 | Post-review tip window (days after appointment) | Company-only | 7 days |
| 20 | Override/double-book permissions | Company-only | OWNER, MANAGER |
| 21 | Client recognition matching strictness | Company-only | Email + phone OR email + name |
| 22 | SMS reminder opt-in defaults | Company-only (legal) | Explicit opt-in required (unchecked) |
| 23 | Calendar sync enabled (which external calendars) | Company enables, staff opts in | Google and Outlook on; Apple CalDAV on |

### Settings UI Entry Points

**Company settings:** `Settings → Booking & Payments`, with tabs for each setting category. Each setting shows the current mode, the current value, and a preview of "what staff will see."

**Staff settings:** `My Settings → Booking Preferences`. Only shows settings where the company has set the mode to `DEFAULT_OVERRIDABLE` or `STAFF_CONTROLLED`. Locked settings appear in a collapsed "Set by company" section for transparency, with a tooltip explaining the staff can't change them.

**Note for follow-up doc:** This architecture deserves its own specification — proposed filename `05-settings-architecture.md`. It applies well beyond booking (payroll, commissions, permissions, communications). The booking flow ships the pattern; the dedicated doc formalizes it.

---

## Booking Policy Detail

### INSTANT

Client books and receives immediate confirmation. Card on file captured at booking (if deposits on) or SetupIntent captured for future no-show fee (if deposits off). The appointment enters state `confirmed` immediately.

**Best for:** High-volume businesses where staff schedules are predictable (salons, fitness studios, mid-market spas). Lowest friction; highest conversion.

**Client sees after slot selection:** the standard confirmation screen.

### REQUEST_APPROVAL

Client submits a booking request. Appointment enters state `requested`. Staff or admin receives a notification (SMS, email, in-app) and must approve or decline within a configurable window (default 24 hours). Client sees a "Pending approval — we'll confirm within 24 hours" screen. On approval: confirmation goes out, appointment moves to `confirmed`. On decline or timeout: client is notified, appointment moves to `declined`, card is released.

**Best for:** High-end medspa, boutique practitioners, specialty services where the provider vets new clients. Manages expectations; avoids rushed confirmations.

**Client sees after slot selection:** "Request sent. [Business name] will confirm within 24 hours. You'll get a text when they respond."

### STAFF_ONLY

No public booking portal. The tenant's URL redirects to a branded "Contact us to book" page with phone, email, and contact form. All bookings happen inside the staff app.

**Best for:** Solo practitioners who prefer direct communication, businesses transitioning from phone-only booking, or operations where every booking requires a pre-qualification call.

**Client sees at the public URL:** "Booking by request only. Contact [Business] at [phone] or [email], or use the form below."

### Onboarding Copy for Policy Selection

From `02-onboarding-flow.md` — this is the copy that runs during tenant setup. Reproduced here for reference; updates belong in that doc.

> **How do you want clients to book?**
>
> You can change this anytime in Settings.
>
> **Instant booking** — Clients book and get confirmed right away. Most businesses choose this. Best when your schedule is predictable and you want new clients to feel welcome.
>
> **Request approval** — Clients request a time; you confirm or decline within 24 hours. Best for new-client vetting, high-end services, or when you want a conversation before every appointment.
>
> **Staff-only booking** — No public booking page. Clients reach out through a contact form or phone. Best if you prefer to handle scheduling personally or are just getting started.
>
> [ Instant ] [ Request approval ] [ Staff only ]

---

## Detailed Flows

### A. Public Booking — First-Time Client (INSTANT Policy)

**Entry point:** Client lands on `book.{tenant}.velura.com` (or a custom domain) from a marketing link, Instagram bio, Google search result, or direct navigation. First time — no client record exists.

**Step 1: Service selection**

Client sees the business landing card at top (business name, one-line tagline from onboarding, optional logo/photo), followed by services grouped by category if the tenant has defined them. Each service card shows name, duration, price, and an optional short description. Cards are tappable; tapping advances to Step 2.

A "Prefer a specific provider?" link sits below the service list and opens a separate "Browse by provider" view. This is the secondary path for clients who know who they want; most will go service-first.

If the tenant has many services (>10), a sticky search bar at the top filters by service name.

**Copy — header:** "Book with [Business Name]"
**Copy — subhead:** Business's one-line tagline from onboarding, or "What can we do for you today?" if none set.

**Step 2: Staff preference**

Client sees a toggle: "Any available provider" (selected by default) or "Choose a provider." The "any available" path skips this step entirely and advances to Step 3 with the full slot grid. The "choose a provider" path shows avatars + first name + one-line bio for each staff member qualified for the selected service.

Tapping a staff member or "Any available" advances to Step 3.

**Copy — "Any available" state:** "We'll match you with the first available [service name] provider."

**Step 3: Time selection**

Client sees a date picker at the top (current date through the maximum booking window — default 90 days out) and a slot grid below showing available times for the selected date. Slots are labeled in 12-hour format with the timezone shown above the grid.

Slot availability reflects the resolved settings for the selected staff and service: working hours, buffers, existing appointments, external calendar busy blocks, minimum booking notice.

If the selected date has no availability, a "No openings on this day — try another date" message replaces the grid, with three suggested dates that do have availability.

Tapping a slot advances to Step 4 and starts the 7-minute slot hold.

**Copy — timezone indicator:** "Times shown in [Pacific Time / Los Angeles]"
**Copy — no availability:** "No openings on [date]. Here's what's close:" followed by the three suggested dates.

**Step 4: Client details + payment**

A single-screen form captures:

- First name (required)
- Last name (required)
- Email (required, validated format)
- Phone (required, validated format — used for SMS reminders and for client-matching)
- Notes for your provider (optional, free text, 500 char max)
- SMS opt-in checkbox (unchecked by default — 10DLC compliance)
- Card (Stripe Payment Element, inline)

Below the form, a summary panel shows:

- Service + duration
- Provider + date/time
- Total price
- Cancellation policy (exact timestamp, e.g., "Free to cancel or reschedule until Wed Apr 23 at 2:00 PM. A $50 fee applies after that.")
- Deposit disclosure if applicable ("$50 charged today, applied to your visit total.") OR card-on-file disclosure ("Card saved. You'll be charged only if you cancel after the window or don't show up.")

The primary action is "Book appointment." Tapping it:

1. Creates the client record (after running the two-factor match — in this case, first-time, no match)
2. Creates the appointment in `scheduled` state
3. Attempts to capture payment (SetupIntent for card-on-file only, or PaymentIntent if deposit applies)
4. On success, advances to Step 5 and transitions the appointment to `confirmed`
5. On payment failure, shows a clear error and keeps the form filled; slot hold continues

**Copy — SMS opt-in:** "Text me appointment reminders and updates. Msg & data rates may apply. Reply STOP to opt out."
**Copy — deposit (when on):** "$50 charged today. Applied to your visit total."
**Copy — card-on-file (when no deposit):** "Card saved. You'll only be charged if you cancel after [exact time] or don't show up — $[fee]."
**Copy — no cancellation fees at all:** "Free to cancel or reschedule anytime."
**Primary button:** "Book appointment" (not "Submit" or "Confirm" — action-oriented, friendly)

**Step 5: Confirmation**

Client sees a confirmation screen:

> **You're all set, Sarah.**
>
> Deep Tissue Massage with Jamie
> Thursday, April 24 at 2:00 PM
> 50 minutes • $120
>
> Card saved. We'll only charge it if you cancel after Wed Apr 23 at 2:00 PM or don't show up.
>
> [ Add to calendar ]   [ Manage booking ]
>
> Booking as Sarah Chen — not you? [ This isn't me ]

Confirmation email sends immediately. Confirmation SMS sends if the client opted in.

The "Manage booking" button deep-links to a magic-link-authenticated view where the client can reschedule or cancel. The magic link is also included in the email and SMS.

The "Add to calendar" button downloads a `.ics` file.

The "This isn't me" link triggers the escape-hatch flow (see Client Recognition section below).

**State after Step 5:** `Appointment.state = confirmed`. Scheduled jobs queued via BullMQ: 24h-before reminder, 5pm-day-before staff digest slot, 15-min-after-start no-show check, post-appointment review request.

**Time budget:** 90 seconds on mobile for a fluent user. The bottleneck is card entry; Payment Element with Apple Pay / Google Pay support reduces this significantly.

---

### B. Public Booking — Returning Client

**Entry point:** Same as Flow A — public booking URL.

**Delta from Flow A:** Steps 1–3 identical. In Step 4, when the client submits their details, the `ClientMatchResolver` service runs:

1. Query for clients where `email = submitted_email`
2. If zero matches → Flow A (new client)
3. If one or more matches → apply second-factor check:
   - **Strong match** = email + phone match on the same client record → silent attach
   - **Weak match** = email matches but phone doesn't match any existing record with that email → create new client (married-couple case)
   - **Name-only fallback** = email matches, phone not provided → if first+last name match → silent attach, else create new client
   - **Ambiguous** = email + phone match multiple records → staff-facing alert, treat as new client, staff resolves later

On silent attach, the appointment is linked to the existing client record. The existing client's card on file is offered as the default payment method, with a link to add a new card. Intake forms previously completed are reused; any service-required form not yet completed appears in Step 5.

**Step 5 delta for returning clients:**

> **Welcome back, Sarah.**
>
> Deep Tissue Massage with Jamie
> Thursday, April 24 at 2:00 PM
>
> Card ending in 4242 will be charged only if you cancel late.
>
> [ Add to calendar ]   [ Manage booking ]
>
> Booking as Sarah Chen — not you? [ This isn't me ]
>
> Need to update your details? [ Update info ]

**State after Step 5:** Same as Flow A.

---

### Client Recognition — The "Not You?" Escape Hatch

When a client taps "This isn't me" on the confirmation screen:

1. The appointment is **not** deleted. It's flagged `clientMatchDisputed = true` and temporarily unlinked from the matched client.
2. A modal asks: "No problem. Is this your first time booking with us, or are you Sarah Chen and just want to use a different account?"
3. Two paths:
   - **"I'm new" → create new client record.** The appointment is re-linked to a fresh client record. The matched client's data (card on file, history) is not touched. Confirmation re-sends to the new record's email. Done.
   - **"I'm Sarah, use that account" → magic link flow.** A magic link is sent to the matched client's email. Tapping it proves ownership and re-attaches the booking to the matched client. If the client's email is wrong or inaccessible, they contact the business directly; staff can resolve manually.
4. The modal also offers: "Not seeing your appointment history? [ Find my account ]" — the inverse case. A magic link is sent to the submitted email; if an account exists, it merges the new booking into that account.

**Staff-side:** Every disputed match appears in a "Client matches to review" queue in the admin panel. Staff resolve ambiguous cases manually.

**Audit:** Every match resolution writes to `AuditLog` with actor (system / staff), match strength, resolution outcome.

---

### C. Public Booking — REQUEST_APPROVAL Policy

**Entry point:** Same as Flow A. The business has set `bookingPolicy = REQUEST_APPROVAL` during onboarding or settings.

**Delta from Flow A:** Steps 1–4 identical. On submit in Step 4:

1. Client record created or matched (same logic as Flows A and B)
2. Appointment created in `requested` state (not `scheduled`)
3. Card SetupIntent captured (held, not charged — even if deposits are on, the deposit is not charged until approval)
4. Slot is held for the business's approval window (default 24h, configurable)
5. Notification sent to staff/admin (SMS + in-app) with one-tap approve/decline

**Step 5 delta — client sees:**

> **Request sent, Sarah.**
>
> You asked for: Deep Tissue Massage with Jamie, Thursday Apr 24 at 2:00 PM.
>
> [Business] will confirm within 24 hours. You'll get a text when they respond.
>
> Card saved, not charged yet. If they can't fit you in, nothing happens to your card.
>
> [ Check status ]

**Staff-side:** The staff notification shows the request details inline with approve/decline buttons. Approving:

1. Transitions appointment to `confirmed`
2. Captures deposit via PaymentIntent if deposits are on
3. Sends client confirmation SMS + email
4. Queues all the normal notification jobs

Declining:

1. Transitions appointment to `declined`
2. Releases the card SetupIntent
3. Sends client a decline notification with optional "Here are three nearby times that work" suggestions
4. Offers the client a rebook link

Timeout (no response within window):

1. System auto-declines at window expiry
2. Same client notification as manual decline, with the timeout reason suppressed ("We weren't able to confirm your time")

**State transitions:** `requested → confirmed` (approved) or `requested → declined` (manual or timeout).

---

### D. Reschedule via Magic Link

**Entry point:** Client taps "Need to reschedule?" in their 24h reminder SMS or email, or opens the magic link from their original confirmation.

**Step 1: Authentication via token**

The magic link is a signed JWT with 24-hour expiry from first use, single-use flag, and a refresh pattern: opening the link refreshes it for another 24h so a client can return without getting a new link. Expired links trigger a "Send me a new link" flow — client enters their email, gets a new magic link sent.

**Step 2: Appointment view**

Client sees their current booking:

> Your appointment
>
> Deep Tissue Massage with Jamie
> Thursday, April 24 at 2:00 PM
>
> [ Reschedule ]   [ Cancel ]   [ Add to calendar ]
>
> Questions? [Call/text business]

**Step 3: Reschedule flow**

Tapping "Reschedule" opens a slot-selection view. Unlike the initial booking, the service and staff are pre-selected (same service, same staff) — the client only picks a new time. Changing service or staff is possible via a "Change service or provider" link, but that's a secondary path.

The client sees the same slot grid as Flow A Step 3, populated with availability for the same service+staff combination.

**Cancellation window behavior during reschedule:**

- Inside the window: reschedule is free. Client sees "Free to reschedule — we'll keep the appointment, just change the time." No fees.
- Outside the window: reschedule incurs the cancellation fee. Client sees "This appointment is inside the cancellation window. Rescheduling will charge the $50 cancellation fee. [ Continue ] [ Keep original time ]"

My strong recommendation — flagged for tenant feedback — is to **make reschedule-inside-window free by default** (treating rescheduling as less severe than outright cancellation) and let businesses toggle "charge fee on late reschedule" if they want strict enforcement. This is a two-tier setting (`lateRescheduleChargeFee`, default off).

**Step 4: Confirmation of reschedule**

New appointment time locked in. Old slot released. Confirmation SMS + email:

> **Rescheduled.**
> Your appointment with Jamie is now Friday, April 25 at 3:00 PM.
> Previous time: Thursday, April 24 at 2:00 PM.

**State transitions:** Appointment's `scheduledStartAt` updates. `AuditLog` records the reschedule with old and new times. All queued notification jobs are removed and re-queued for the new time.

---

### E. Cancel via Magic Link

**Entry point:** Same as Flow D.

**Step 1–2: Same as Flow D.**

**Step 3: Cancel flow**

Tapping "Cancel" opens a confirmation:

**Inside the window:**
> Cancel this appointment?
>
> Deep Tissue Massage with Jamie
> Thursday, April 24 at 2:00 PM
>
> Free to cancel — no charge. You have until Wed Apr 23 at 2:00 PM to cancel without a fee.
>
> [ Cancel appointment ]   [ Keep it ]

**Outside the window:**
> Cancel this appointment?
>
> Deep Tissue Massage with Jamie
> Thursday, April 24 at 2:00 PM
>
> It's inside the cancellation window. A $50 cancellation fee will be charged to your card ending in 4242.
>
> [ Cancel and pay fee ]   [ Keep appointment ]

**Secondary path for outside-window cancels:** below the buttons, a link: "Need to cancel for a reason? [ Contact business ]" — this opens the business's contact form or phone link. Staff can waive the fee at their discretion from the appointment drawer.

**Step 4: Confirmation of cancel**

> **Appointment cancelled.**
> Sorry to miss you, Sarah. Rebook anytime at [booking URL].
>
> [ Book again ]

If a fee was charged, the confirmation screen and email include the fee amount and receipt.

**State transitions:** `Appointment.state = cancelled`, `cancelledAt = now()`, `cancelledBy = client`. If outside window, a `LedgerEntry` records the cancellation fee. All queued notification jobs are removed. Slot immediately freed in availability queries.

---

### F. Waitlist Signup

**Entry point:** Client in Step 3 of Flow A sees their preferred date has no slots, or the slot they want is taken.

**Step 1: Waitlist invitation**

Below the "no openings" message, a secondary CTA: "Want us to text you if something opens up?" Tapping opens a minimal form:

- Preferred dates (multi-select from a 14-day window)
- Preferred time of day (Morning / Afternoon / Evening / Any)
- Name, email, phone (required)
- SMS opt-in (required for waitlist — no SMS opt-in means no waitlist, since SMS is the notification channel)

**Step 2: Waitlist record created**

A `WaitlistEntry` is created with the client's preferences, service, and optional staff. No appointment exists yet. Client sees:

> **You're on the list.**
> We'll text you if a Deep Tissue Massage opens up Thu–Mon between [preferred times].
>
> [ OK ]

### G. Waitlist Conversion

**Trigger:** A slot matching any waitlist entry becomes available (another client cancels, or staff adds open hours).

**Step 1: Notification**

SMS sends to the first matching waitlist entry:

> A Deep Tissue Massage with Jamie just opened up Thursday Apr 24 at 3:00 PM. Yours if you want it — tap to grab it. This offer holds for 15 minutes: [magic link]

The link opens a booking confirmation screen, pre-filled with all details. Tapping "Grab this slot" books it immediately using the client's saved details or, if they're not saved, a streamlined flow (card entry only; everything else is pre-filled from the waitlist entry).

**Step 2: Time-boxed hold**

The slot is held for the notified client for 15 minutes. During this window, other waitlist entries don't see the slot. If the first client doesn't convert within 15 minutes, the slot re-enters general availability AND notifies the next matching waitlist entry.

**Step 3: Waitlist entry expires**

Every waitlist entry has a 14-day TTL. Expired entries are deleted and the client is not re-notified.

**State transitions:** On conversion, `Appointment` created in `confirmed` state, `WaitlistEntry.status = converted`. On expiry, `WaitlistEntry.status = expired`.

---

### H. Intake Form Trigger

**Trigger:** Client books a service that has an intake form attached (configured per service in the admin panel).

**Client experience:** The booking confirmation screen (Flow A Step 5) includes an additional section:

> **One more thing — quick intake form**
> Jamie needs a few details before your massage. Takes about 2 minutes.
>
> [ Fill it out now ]   [ I'll do it later ]

Tapping "Fill it out now" opens the intake form (signed token link, per Epic 5). "I'll do it later" closes; a reminder SMS sends 24h before the appointment if the form is still incomplete.

Intake form completion doesn't block confirmation. The appointment is `confirmed` regardless. Staff see the form status in the appointment detail drawer ("✓ Intake complete" or "⏳ Intake pending"). Staff can nudge the client manually if needed.

---

### I. Deposit Collection at Booking

**Trigger:** Tenant has deposits enabled for this service.

**Delta from Flow A:** In Step 4, the card entry is a Stripe Payment Element (not just SetupIntent). On submit, the deposit is captured via PaymentIntent immediately. If the PaymentIntent fails, the booking does not confirm; the client sees the error and can retry.

**Client copy changes:**

In the summary panel:
> $50 charged today. Applied to your visit total of $120.
> Balance due at visit: $70.

In confirmation:
> **You're all set.**
> $50 deposit paid. Balance of $70 due when you visit.

**Ledger treatment:** Deposit is recorded as `LedgerEntry(type=deposit, amount=50, appointmentId=...)`. At checkout, the deposit is applied as a credit against the total.

**Refund logic:**

- Inside cancellation window: full refund, automatic.
- Outside window: deposit forfeited as the cancellation fee. No additional fee charged.
- If deposit < cancellation fee: deposit is kept, difference charged via a second PaymentIntent.

---

### J. Post-Review Tip Flow

**Trigger conditions (all must be true):**

- Client completed a review for an appointment
- Review rating meets or exceeds the company's post-review tip minimum (default 5 stars)
- Client did NOT tip at checkout (checkout tip amount was $0)
- Appointment completed within the company's post-review tip window (default 7 days)
- Card on file is still valid
- Tips are enabled at the company level
- Post-review tip prompt is enabled at the company level
- The staff member has not opted out (if company allows opt-out)
- Client has not already seen the post-review tip prompt for this appointment

**Step 1: Review submission**

Client gets a review request (Epic 8) via email or SMS 2 hours after appointment completion. Tapping the link opens the review screen: star rating + optional text.

**Step 2: Post-review prompt**

If all trigger conditions above are met, after the client submits the 5-star rating, the screen transitions to:

> **Thanks for the 5 stars, Sarah.**
>
> Jamie put real work into your appointment. Want to send a tip?
>
> [ 18% — $21.60 ]   [ 20% — $24 ]   [ 25% — $30 ]
> [ Custom amount ]
> [ No thanks ]
>
> Charged to your card ending in 4242.

Tapping a tip amount charges immediately via PaymentIntent on the saved card. No extra confirmation. Confirmation: "Sent $24 to Jamie. They'll see it in their next payout."

"Custom amount" opens a numeric input modal. Same single-tap send.

"No thanks" closes the prompt. The `postReviewTipDismissedAt` field is set on the appointment; the prompt never shows again for this appointment.

**Step 3: Ledger treatment**

The tip writes a `LedgerEntry` with:
- `type = tip`
- `source = post_review_tip` (distinct from checkout tips)
- `staffId = <appointment's staff>`
- `appointmentId = <this appointment>`
- `reviewId = <the 5-star review>`

Staff see the tip on their payout. Reporting can distinguish post-review tips from checkout tips for business insight.

**Distribution for multi-staff (Phase 2):** follows the same rules as checkout tips (proportional to service price by default; company can override to equal split or custom percentages).

**Declined card handling:** if the PaymentIntent fails (card expired, declined, etc.), the client sees "Your card couldn't be charged. Would you like to update it?" with a link to enter a new card. If they don't, the tip is not sent. Staff are not notified of attempted-but-failed tips — it would create awkward dynamics.

---

### K. Staff Quick Book (Dashboard Widget)

Specced in `03-dashboard-today-view.md`. This flow is the fast path for staff booking an appointment from the dashboard home. Inputs: client (typeahead or new), service, slot. Outputs: confirmed appointment.

**Delta from the dashboard spec, now that booking flow is fully specced:** the Quick Book widget calls the same `createAppointment` endpoint as all other booking flows. The settings resolution logic applies automatically — minimum notice, buffer times, cancellation window, deposit, tip — all resolved server-side based on the selected staff and service.

Quick Book does not collect payment. The client's card on file is used if available; if not, the appointment is created with `paymentMethod = pending` and staff are expected to collect at checkout. This is the "staff knows the client" shortcut — it trades a strict card-on-file requirement for speed.

---

### L. Staff Full-Calendar Drag-to-Create

**Entry point:** Staff member opens the Calendar section. Default view is Day (mobile) or Week (desktop).

**Step 1: Drag on the calendar**

Staff click-and-drag on an empty slot on a specific staff member's column. The drag creates a visual block showing the duration. Minimum drag distance: 10 pixels (below that, treat as a tap to view details of whatever is there).

On release, an appointment detail drawer slides in from the right.

**Step 2: Appointment detail drawer**

The drawer is pre-populated with:
- Staff member: the one whose column they dragged on
- Start time: the drag start position
- End time: the drag end position (snapped to the service's duration grid once a service is selected)

Fields to fill:
- **Client**: typeahead search (name, email, or phone) — creates new inline if no match (Flow M)
- **Service**: dropdown filtered by services this staff can perform
- **Notes** (optional)
- **Send confirmation to client**: checkbox, default on

Settings-resolved values shown read-only:
- Duration (from service)
- Buffer after (from settings resolution)
- Price
- Deposit policy (if applicable, with "Collect deposit now" option)
- Cancellation window

On save, the appointment is created in `confirmed` state, notifications queued, confirmation sent to client if checkbox is on.

**Step 3: Confirmation**

Drawer closes. The new appointment renders on the calendar in the `confirmed` color. If the client doesn't have a card on file and deposits are required, a secondary flow prompts: "This client has no card on file. [ Send payment link ] [ Skip — collect at checkout ]"

---

### M. Staff Walk-In Booking

**Entry point:** Client walks in; staff opens Quick Book (dashboard) or Calendar (drag on "now" to a duration).

**Step 1: Minimal client capture**

If the walk-in client is new, staff tap "+ New client" inline. The fields are:
- First name (required)
- Last name (required)
- Phone (required — used for later matching if they return)
- Email (optional for walk-in)

That's it. Notes, address, birthday — all deferred. Staff can enrich the client record later.

**Step 2: Service + time**

Service dropdown. Time defaults to "now" or the next open slot matching the service duration.

**Step 3: Save**

Appointment created in `confirmed` state. If the client opted in to SMS (or provided an email), a confirmation sends. If not, it's a silent create.

**Target time: under 30 seconds.** The flow is aggressively minimal for this reason.

---

### N. Staff Block Time Off

**Entry point:** Calendar view. Staff selects their own row (or a manager selects any staff's row) and drags to create a block. Instead of the appointment detail drawer, a block detail drawer opens.

**Block detail drawer fields:**
- Label (text, e.g., "Lunch", "Training", "Doctor appointment")
- Start/end times (from the drag; editable)
- Recurring? (weekly only for MVP)
- Notes (optional, private to staff)

**Approval logic:**

Per the company settings for block time approval:
- OWNER: auto-approved
- MANAGER: auto-approved
- Others: depends on the company setting `blockTimeApprovalRequired`:
  - If the block is below the threshold (default 2 hours), auto-approved
  - If above the threshold OR if it conflicts with an existing appointment, requires OWNER/MANAGER approval

Blocks in approval-pending state show on the calendar with a dashed border and a "Pending approval" label. They DO block availability immediately (conservative default — don't let a client book into a block that might be approved).

**Conflict handling:** if a block overlaps an existing appointment, the block creation shows: "This overlaps with an existing appointment (Deep Tissue Massage, 2:00 PM). What would you like to do?"
- "Cancel that appointment" → initiates staff-initiated cancellation (Flow Q)
- "Reschedule that appointment" → opens the reschedule flow for that appointment
- "Keep both" → creates the block as a conflict; requires manager override with reason

---

### O. Manager Override (Double-Book)

**Entry point:** Any staff member tries to create an appointment that would cause a double-book (via DB `EXCLUDE` constraint check in the server).

**Step 1: Conflict detected**

The create attempt fails with a specific error: "This time conflicts with an existing appointment. Want to override?"

**Step 2: Override permission check**

- If the current user is OWNER or MANAGER: override is offered directly.
- If the current user is anyone else: override is routed through manager approval. Staff sees: "This requires manager approval. Send a request?" Tapping yes creates a pending override request notification to all managers.

**Step 3: Override confirmation (for OWNER/MANAGER)**

A modal appears:

> **Override double-book**
> This creates a double-booking with: [existing appointment details]
> You'll need to tell us why.
>
> Reason (required): [text field]
>
> [ Create anyway ]   [ Cancel ]

The reason field is required (no empty submits). On confirm, the appointment is created with a flag `isOverride = true` and both appointments coexist on the calendar with a visual indicator (orange outline).

**Audit:** every override writes an `AuditLog` entry with:
- Actor (override approver)
- Requester (if different from approver)
- Target appointment ID + existing conflict appointment ID
- Reason
- Timestamp

Reports can surface override frequency, reasons, and approvers.

---

### P. Staff Reschedule via Drag

**Entry point:** Staff drags an existing appointment block to a different time or different staff column on the calendar.

**Step 1: Drag and drop**

Drop target highlights on hover. On drop:
- If target slot is clear: modal confirms "Reschedule Sarah Chen to Thursday 3:00 PM?" with [ Reschedule ] [ Cancel ].
- If target slot would cause a conflict: falls into Flow O (manager override).
- If target is a different staff member AND the new staff doesn't perform this service: modal shows "Jamie can't perform Deep Tissue Massage. [ Change service ] [ Keep original time ]"

**Step 2: Cancellation window check**

If the appointment is inside the cancellation window, the modal warns:
> This appointment is inside the cancellation window. Rescheduling won't trigger the cancellation fee (staff-initiated), but we'll let the client know.

Client notification sends automatically. Copy:
> **Heads up, Sarah:** Jamie had to move your appointment. New time: Thursday Apr 24 at 3:00 PM (was 2:00 PM). Still works for you? [ Yes ] [ Need a different time ]

"Need a different time" opens the magic link reschedule flow (Flow D).

**Step 3: Confirmation**

Calendar updates immediately. Notifications re-queue for new time. Appointment audit log captures the reschedule actor and reason (staff-initiated).

---

### Q. Staff-Initiated Cancellation

**Entry point:** Staff opens an appointment detail drawer and taps "Cancel appointment."

**Step 1: Confirmation modal**

> **Cancel this appointment?**
> Deep Tissue Massage with Jamie, Thursday Apr 24 at 2:00 PM
> Client: Sarah Chen
>
> Reason (optional): [text field]
>
> The client will be notified and **not charged a cancellation fee**.
>
> [ Cancel appointment ]   [ Keep it ]

Staff-initiated cancellations never charge the client, regardless of cancellation window. This is an explicit design decision — incumbents conflate client cancels and staff cancels, which leads to misdirected fees.

**Step 2: Client notification**

SMS + email:
> **[Business name] had to cancel your appointment.**
> We're sorry — your Deep Tissue Massage on Thursday Apr 24 at 2:00 PM is cancelled. No charge.
> Want to rebook? [ Book again ]

**Step 3: Optional offer to rebook**

If the business has "offer rebook on staff cancel" enabled (two-tier setting, default on), the client notification includes three suggested alternative times. Tapping any of them opens the booking flow with that slot pre-selected.

**Audit:** `AuditLog` entry for staff-initiated cancel with actor, reason (if provided), and notification sent.

---

## State Coverage

### Empty States

| Screen | Empty condition | Content |
|---|---|---|
| Service selection (public) | Tenant has no services | "This business is setting up. Check back soon." — with a contact link if `STAFF_ONLY` policy is on |
| Staff selection (public) | No staff can perform the selected service | "No providers available for this service. Try another service." |
| Slot grid (public) | No availability in 90-day window | "No openings in the next 90 days. [ Join waitlist ]" |
| Today view (staff) | No appointments today | Covered in `03-dashboard-today-view.md` |
| Calendar view (staff) | Staff has no services assigned | "You haven't been assigned any services yet. Ask your manager." |

### Error States

| Error | Surface | Recovery |
|---|---|---|
| Slot hold expired during Step 4 | Inline banner on Step 4 | "This slot is no longer held. [ Refresh slots ]" — returns to Step 3 |
| Slot taken during submit race | Toast + return to Step 3 | "Someone else just booked this slot. Pick another?" |
| Payment declined | Inline error on Step 4 | Clear error with card-specific guidance; form stays filled |
| Magic link expired | Full-page fallback | "This link expired. We'll send you a new one." — enter email, receive new magic link |
| Magic link already used | Full-page fallback | "This link has been used. Need to make a change? [ Send new link ]" |
| External calendar sync failing | In-app banner for staff | "Your Google Calendar isn't syncing. [ Reconnect ]" — non-blocking |
| SMS delivery failure | Silent fallback | Email sends instead; staff notified for follow-up |
| Double-book race (between DB check and insert) | Server returns 409 Conflict | Client retries once; if persists, falls to Flow O |

### Edge States

| Condition | Behavior |
|---|---|
| Client books a service the chosen staff stops performing mid-booking | Slot hold persists; at submit, show "Jamie no longer offers this service. Any other provider?" |
| Business closes (changes operating hours) after a booking exists | Existing bookings honor their original terms; staff see warning on calendar |
| Cancellation window setting changes after booking exists | Existing bookings honor their original window; new bookings use the new window |
| Deposit setting changes after booking exists | Existing bookings honor their original deposit terms |
| Staff account deleted with future appointments | Appointments auto-reassign to "unassigned" queue; manager gets notification; public booking URL blocks new bookings to that staff |
| Client's phone number changes (detected via SMS bounce) | SMS falls back to email; staff notified to update record |
| Tenant downgrades plan and loses deposit feature | Existing appointments with deposits keep them; new bookings can't require deposits; clear admin warning |
| Clock drift / leap second during availability check | Rely on Postgres clock as source of truth; client clock irrelevant |
| DST transition during a booked appointment | Appointment renders with correct local times on both sides of transition; tested explicitly |

---

## Component Specifications

### ServiceCard

**Used in:** Flow A Step 1.

**Fields shown:**
- Service name (primary, 16px semibold)
- Duration + price (secondary, 14px regular)
- Optional short description (12px regular, 2-line truncate)

**States:** default, hover (desktop), pressed, disabled (service unavailable).

**Tap target:** entire card. Minimum 72px height.

**Accessibility:** role="button", aria-label includes name, duration, price.

### SlotGrid

**Used in:** Flow A Step 3, Flow D (reschedule).

**Layout:** CSS grid, 4 columns on mobile, 6 on tablet, 8 on desktop. Slot cells are 44×44px minimum.

**Slot cell contents:** start time (e.g., "9:00 AM"), compact 14px.

**States:** available (default), unavailable (disabled, strikethrough), holding (this client holds it briefly), taken (just taken by another client — shown for 2 seconds then removed with fade).

**Real-time updates:** the slot grid subscribes to a Server-Sent Events stream for the selected date. When another client books a slot, it fades out of the grid within 1 second.

### ConfirmationCard

**Used in:** Flow A Step 5 and analogous confirmation screens.

**Layout:**
- Greeting headline (24px bold)
- Appointment summary (16px)
- Policy disclosure (14px, muted)
- Action buttons (primary + secondary)
- Escape hatch link ("Not you?" — 12px, muted link)

**Variants:** first-time, returning, request-pending, rescheduled.

### PolicyDisclosure

**Used in:** Flow A Step 4 (summary panel), Flow A Step 5 (confirmation), Flow D/E (reschedule/cancel).

**Rules:**
- Always show exact timestamp (not relative time) for cancellation window
- Always show exact dollar amount for fees
- Always show last 4 digits of card being held/charged
- Never use words like "authorized", "held", "on deposit" — they mean different things to different people and invite chargebacks
- Always specify WHEN the charge happens (e.g., "only if you cancel after [time]")

### AppointmentDrawer (Staff)

**Used in:** Flows L, M, N, O, P, Q.

**Sections:**
- Header: appointment time, duration, status badge
- Client section: name, phone, email, last visit, notes
- Service section: service name, price, deposit status
- Intake form status
- Internal staff notes
- Action buttons: Reschedule, Cancel, Check In, Start Session, Complete, Charge Now
- Override indicator (if applicable): "Double-booked — reason: [reason], approved by [manager]"

### PostReviewTipPrompt

**Used in:** Flow J.

**Layout:**
- Celebratory headline
- Tip amount chips (3 options + custom + no thanks)
- Card disclosure
- One-tap submission, no confirmation modal

**Motion:** chips animate in with 50ms stagger on mount. Tap triggers a subtle success animation.

**Constraints:** no copy variants that guilt the client. "Want to send a tip?" is the maximum pressure. Never "Your provider worked hard — make sure to tip!" or similar.

---

## Mobile Behavior

- All flows must complete comfortably on a 375px-wide viewport (iPhone SE 2nd gen)
- Touch targets 44×44px minimum
- Input font-size 16px minimum on mobile (prevents iOS auto-zoom)
- Primary actions at the bottom of the screen, thumb-reachable
- Back button always behaves as expected (URL-driven steps in public flow; back navigation in staff flow)
- Magic links open in the native browser, not in-app webviews (breaks too many payment flows)
- The staff calendar collapses to single-staff-column Day view on mobile; Week view is desktop-only

---

## Loading States

Every async operation shows a loading state within 150ms of initiation. No loading state runs without a timeout.

| Operation | Loading pattern | Timeout | Timeout recovery |
|---|---|---|---|
| Service catalog fetch | Skeleton cards (3 shown) | 10s | "Trouble loading services. [ Retry ] [ Contact business ]" |
| Availability fetch | Skeleton slot grid | 10s | "Can't load times. [ Retry ]" |
| Booking submission | Button shows spinner, form disabled | 15s | "Your booking is taking longer than expected. Don't refresh — we're still working on it." |
| Magic link open | Full-screen loader | 5s | Fallback to "Something went wrong. [ Send me a new link ]" |
| Post-review tip submission | Button shows spinner | 10s | "Couldn't send the tip. Try again?" |

Skeletons use the design system's skeleton token, not custom animations. No shimmer, no spinners inside skeletons.

---

## Messaging & Copy

This section is the source of truth for all user-facing strings in the booking flow. Changes here propagate to the implementation.

### Client-facing copy

**Service selection header:** "Book with [Business Name]"
**No services available:** "This business is setting up. Check back soon."
**No providers:** "No providers available for this service. Try another service."
**No slots in window:** "No openings in the next 90 days."
**Timezone indicator:** "Times shown in [Timezone Name]"
**No openings on day:** "No openings on [date]. Here's what's close:"
**Slot hold banner (when close to expiring):** "This time is held for 2 more minutes."
**Slot hold expired:** "This slot is no longer held. [ Refresh slots ]"
**Slot taken race:** "Someone else just booked this slot. Pick another?"
**Card-on-file disclosure (no deposit):** "Card saved. You'll only be charged if you cancel after [exact time] or don't show up — $[fee]."
**Card-on-file disclosure (deposit):** "$[amount] charged today. Applied to your visit total of $[total]."
**No cancellation fee:** "Free to cancel or reschedule anytime."
**SMS opt-in:** "Text me appointment reminders and updates. Msg & data rates may apply. Reply STOP to opt out."
**Primary button (first-time):** "Book appointment"
**Primary button (returning):** "Confirm booking"
**Confirmation headline (first-time):** "You're all set, [First Name]."
**Confirmation headline (returning):** "Welcome back, [First Name]."
**Confirmation headline (request pending):** "Request sent, [First Name]."
**Not-you escape link:** "Booking as [Full Name] — not you? [ This isn't me ]"
**Cancel within window:** "Free to cancel — no charge. You have until [exact time] to cancel without a fee."
**Cancel outside window:** "It's inside the cancellation window. A $[amount] cancellation fee will be charged to your card ending in [last 4]."
**Reschedule within window:** "Free to reschedule — we'll keep the appointment, just change the time."
**Cancel confirmation:** "Appointment cancelled. Sorry to miss you, [First Name]. Rebook anytime."
**Waitlist invitation:** "Want us to text you if something opens up?"
**Waitlist confirmation:** "You're on the list. We'll text you if a [Service] opens up [preferences]."
**Waitlist offer SMS:** "A [Service] with [Staff] just opened up [date] at [time]. Yours if you want it — tap to grab it. This offer holds for 15 minutes: [link]"
**Post-review tip prompt headline:** "Thanks for the [N] stars, [First Name]."
**Post-review tip prompt body:** "[Staff First Name] put real work into your appointment. Want to send a tip?"
**Post-review tip success:** "Sent $[amount] to [Staff First Name]. They'll see it in their next payout."
**Post-review tip decline:** (no copy — just close the prompt)
**Staff-cancel notification:** "[Business] had to cancel your appointment. We're sorry — your [Service] on [date] at [time] is cancelled. No charge. Want to rebook?"

### Staff-facing copy

**Calendar empty (no services):** "You haven't been assigned any services yet. Ask your manager."
**Override double-book modal:** "This creates a double-booking with: [existing appointment]. You'll need to tell us why."
**Override reason placeholder:** "e.g., Training session, back-to-back request from client"
**Staff-cancel confirmation:** "The client will be notified and not charged a cancellation fee."
**Walk-in client create button:** "+ New client"
**Block time label placeholder:** "Lunch, training, etc."
**Reschedule client notification:** "Heads up, [First Name]: [Staff] had to move your appointment. New time: [date] at [time] (was [old time]). Still works for you?"

### Error copy (avoid over-apologizing; be specific)

**Payment declined:** "Your card was declined. Try another card or contact your bank." (Not "We're so sorry — oh no!")
**Network error during booking:** "Can't reach our servers. Check your connection and try again."
**Expired magic link:** "This link expired. Enter your email and we'll send you a new one."
**Invalid input:** Inline, specific ("Enter a valid phone number with area code")

### Tone checklist

- [ ] No exclamation points except in single-word celebrations ("Great!")
- [ ] No emojis in transactional copy (confirmations, receipts, errors)
- [ ] Emojis OK in post-completion moments (post-review tip, staff app check-in)
- [ ] No legal-speak in client copy ("authorized", "captured", "held on reserve")
- [ ] Every disclosure specifies: amount, trigger, timing
- [ ] First name used where possible; full name only when precision matters (client match disambiguation)

---

## Role-Based View Summary

| Feature | Client (public) | Staff (non-manager) | Manager | Owner |
|---|:---:|:---:|:---:|:---:|
| Public booking portal | ✓ | — | — | — |
| Magic link reschedule/cancel | ✓ | — | — | — |
| Waitlist signup | ✓ | — | — | — |
| Quick Book widget | — | ✓ | ✓ | ✓ |
| Full calendar — own column | — | ✓ | ✓ | ✓ |
| Full calendar — all staff columns | — | ✗ | ✓ | ✓ |
| Drag-to-create on own column | — | ✓ | ✓ | ✓ |
| Drag-to-create on others' columns | — | ✗ | ✓ | ✓ |
| Walk-in booking | — | ✓ | ✓ | ✓ |
| Block time off | — | ✓ (with approval) | ✓ (auto) | ✓ (auto) |
| Approve others' block time requests | — | ✗ | ✓ | ✓ |
| Approve request-approval bookings | — | ✓ (own) | ✓ (all) | ✓ (all) |
| Override double-book | — | ✗ (request only) | ✓ | ✓ |
| Manager override approval | — | ✗ | ✓ | ✓ |
| Staff-initiated cancel | — | ✓ (own) | ✓ (all) | ✓ (all) |
| Waive cancellation fee | — | ✗ | ✓ | ✓ |
| Edit company booking settings | — | ✗ | ✗ | ✓ |
| Edit own staff-level booking settings | — | ✓ (if company allows) | ✓ (if company allows) | ✓ |
| View audit log | — | ✗ | ✓ | ✓ |
| Resolve client match disputes | — | ✗ | ✓ | ✓ |

---

## Dependencies

### Must exist before booking flow ships

- Availability engine (`09-dev-handoff.md` Epic 3)
- Client data model with soft delete (`09-dev-handoff.md` Epic 2)
- Staff data model with services + working hours (`09-dev-handoff.md` Epic 2)
- Stripe Connect account for the tenant
- Stripe Payment Element integration
- Stripe SetupIntent + PaymentIntent flows
- Twilio SMS sending with A2P 10DLC registered
- Resend email sending with domain verified
- Magic link service (signed JWT, 24h expiry, refresh on use)
- BullMQ + Redis for scheduled notifications
- Design system (`10-design-system-buildout.md`)
- Onboarding flow including booking policy selection (`02-onboarding-flow.md`)
- `AuditLog` table and service

### Must exist before post-review tip flow ships

- Review capture system — **this does not exist yet** in any spec document. It needs to be designed. Candidate filename: `05-review-system.md` or `06-review-flow.md`.
- Review-to-appointment linking (reviews are per-appointment, not per-business, for tip attribution)

### Optional (degrades gracefully if missing)

- External calendar sync (bookings work; staff won't see busy blocks from Google/Outlook/Apple until sync ships)
- Intake form engine (bookings work; no intake trigger shown to clients)

---

## Open Questions — Resolved

All 24 open questions from `04-booking-flow-context.md` §8 plus the additions from the conversation. Resolutions captured here for traceability.

| # | Question | Resolution |
|---|---|---|
| 8.1.1 | Staff selection order | Service → any → slots (GlossGenius). Specific staff is a secondary filter. |
| 8.1.2 | Staff display | Avatar + first name + one-line bio. Initials fallback if no photo. |
| 8.1.3 | All slots across staff, or per-staff | All slots by default, "Prefer a specific provider?" filter chip |
| 8.1.4 | Slot granularity | Service-specific, default 15-min grid |
| 8.1.5 | Slot hold duration | 7 minutes from first field interaction |
| 8.1.6 | Client timezone vs business timezone | Business timezone with explicit label |
| 8.1.7 | Deposit messaging | "Card saved. You'll only be charged if [specific trigger]." Never "authorized" or "held." |
| 8.1.8 | Cancellation window display | Both: exact timestamp + plain-English wrapper |
| 8.1.9 | Waitlist model | SMS-to-confirm with 15-min response window |
| 8.1.10 | Multi-language | English only at MVP; Spanish P2 |
| 8.2.11 | Default calendar view | Day on mobile, Week on desktop |
| 8.2.12 | Drag-to-create minimum | 10px |
| 8.2.13 | Walk-in client creation | Inline, collapsible; 4 fields max |
| 8.2.14 | Override permissions | OWNER/MANAGER; others request |
| 8.2.15 | Block time approval | Auto for OWNER/MANAGER; threshold-based for others |
| 8.2.16 | Staff-initiated cancellation fee | Never charges client |
| 8.2.17 | Staff substitution UX | Drag-and-drop primary, drawer action secondary |
| 8.2.18 | Overbooking tolerance | DB constraint as floor; warn-and-allow for OWNER/MANAGER via override flow |
| 8.3.19 | External calendar polling | 15-minute interval; real-time is P2 |
| 8.3.20 | Deposit refund logic | Full refund inside window, zero outside |
| 8.3.21 | No-show fee trigger | Scheduled job 15 min after start; staff can trigger early |
| 8.3.22 | Multi-service schema | Yes, `BookingItem` from day one; UI in P2 |
| 8.3.23 | SMS opt-in | Explicit, unchecked (10DLC) |
| 8.3.24 | Medspa photo capture at booking | Deferred entirely to medspa package |
| — | Booking policy default | No default — all three explained in onboarding, user picks |
| — | Deposits toggle | Two-tier, default off |
| — | Cancellation window | Two-tier, default 24 hours |
| — | Client recognition | Hybrid: two-factor match (email + phone, or email + name) with "not you?" escape hatch |
| — | Brand voice | Warm framing + precise facts |
| — | Two-tier pattern scope | All 16+ booking settings enumerated in the Settings Inventory |
| — | Tips in the booking flow | Two-tier; default enabled; checkout-only prompt at MVP |
| — | Post-review tip prompt | Enabled by default; 5-star trigger; 7-day window; only if no checkout tip was given |
| — | Post-review tip: "tip more" flow | Not built — prompt hidden if any tip was given at checkout |
| — | Late reschedule fee | Two-tier, default off (rescheduling inside window is free) |

---

## Phase 1 — Build Now (MVP)

In priority order, aligned with `09-dev-handoff.md` Epic 3 and Epic 4.

- [ ] Availability engine (Epic 3 prerequisite)
- [ ] Two-tier settings resolution service (`resolveSetting` function + caching)
- [ ] Company settings UI — all 16+ two-tier settings enumerated
- [ ] Staff settings UI — shows only overridable/controlled settings
- [ ] Public booking portal — Flows A, B, C
- [ ] Magic link service
- [ ] Reschedule flow — Flow D
- [ ] Cancel flow — Flow E
- [ ] Waitlist — Flows F, G
- [ ] Deposit collection — Flow I (if Stripe is connected)
- [ ] Intake form trigger — Flow H
- [ ] Staff Quick Book (specced in dashboard doc) — Flow K
- [ ] Full calendar + drag-to-create — Flow L
- [ ] Walk-in booking — Flow M
- [ ] Block time off — Flow N
- [ ] Manager override — Flow O
- [ ] Staff reschedule via drag — Flow P
- [ ] Staff-initiated cancel — Flow Q
- [ ] Client recognition two-factor match + "not you?" escape
- [ ] Audit log entries for overrides, match disputes, staff cancellations, reschedules

Not in Phase 1 MVP:

- Post-review tip flow (requires review system — see Phase 2)

---

## Phase 2 — Add Later

- [ ] Post-review tip flow — Flow J (depends on review system design)
- [ ] Multi-service / multi-staff appointments in UI
- [ ] Classes and group appointments
- [ ] Pick-a-spot for classes
- [ ] Memberships and package redemption inside booking
- [ ] Gift card sales during booking
- [ ] Social booking integrations (Instagram, Google Reserve, Facebook)
- [ ] Real-time external calendar sync (replace 15-min polling)
- [ ] Spanish localization
- [ ] Staff opt-out toggles for post-review tips
- [ ] Configurable deposit refund logic (partial refunds, tiered by time-to-appointment)
- [ ] Late reschedule fee (two-tier setting, default off)

---

## Updates Needed to Other Docs

When this spec is signed off, the following existing docs need specific updates:

| Doc | Update required |
|---|---|
| `02-onboarding-flow.md` | Add "Company Booking Policies & Staff Permissions" step covering all 16+ two-tier settings. Formalize the `DEFAULT_OVERRIDABLE / STAFF_CONTROLLED / LOCKED / DISABLED` modes per setting. |
| `03-dashboard-today-view.md` | Update Quick Book widget spec to reference the unified `createAppointment` endpoint and the settings resolution service. |
| `09-dev-handoff.md` Epic 3 | Add acceptance criteria: two-tier settings respected in availability calculation; slot hold TTL of 7 minutes; `EXCLUDE` constraint tests. |
| `09-dev-handoff.md` Epic 4 | This doc becomes the acceptance criteria for Epic 4. Update the epic to reference this spec. |
| `09-dev-handoff.md` Epic 8 | Add post-review tip flow as a branch in the review request notification; flag dependency on review system. |
| `technical-build-spec.md` §3 | Add domain entities: `WaitlistEntry`, `BookingHold`, `BookingItem` (for multi-service future), `PostReviewTipPrompt` (tracking state). Update `LedgerEntry` to include `source` enum (`deposit`, `checkout_tip`, `post_review_tip`, `cancellation_fee`, `no_show_fee`). Add `AuditLog` entry types. |
| New doc required | `05-settings-architecture.md` — formalize the two-tier pattern as a cross-cutting system. |
| New doc required | `06-review-system.md` — design the review capture system that post-review tip depends on. |

---

## Reviewed By

Reviewer sign-off checklist. Do not mark this doc "approved" until each box is checked.

- [ ] Product owner — reviewed all flows, booking policies, and open-question resolutions
- [ ] Design lead — reviewed component specs, mobile behavior, copy tone
- [ ] Engineering tech lead — reviewed dependencies, settings architecture, audit logging requirements
- [ ] Operations / customer success — reviewed staff flows for real-world viability
- [ ] Legal / compliance — reviewed deposit messaging, SMS opt-in copy, cancellation window disclosures
- [ ] Accessibility — reviewed touch targets, keyboard navigation, screen reader labels

---

## Appendix A — Settings Resolution Example

To illustrate how the two-tier precedence chain works in practice, here's a worked example for the **cancellation window** setting during a specific booking.

**Scenario:**
- Tenant: Kindred Studio (salon)
- Company cancellation window setting: `DEFAULT_OVERRIDABLE`, company default 24 hours
- Staff member: Jamie, who has their cancellation window set to 48 hours in their staff preferences
- Client books a Deep Tissue Massage with Jamie for Thursday Apr 24 at 2:00 PM
- Current time: Wednesday Apr 23 at 10:00 AM

**Resolution:**

1. Check appointment-level override: none. Continue.
2. Check company setting mode: `DEFAULT_OVERRIDABLE`. Staff value is allowed.
3. Check Jamie's staff value: 48 hours. Use this.
4. Cancellation window is **48 hours before appointment start**. Window closes Tuesday Apr 22 at 2:00 PM.
5. Current time (Wed Apr 23 10:00 AM) is AFTER the window closed. So if the client tries to cancel now, they're outside the window and the fee applies.

**What the client sees:**
> "It's inside the cancellation window. A $50 cancellation fee will be charged to your card ending in 4242."

**Counterfactual:** if the company setting was `LOCKED` at 24 hours:
- Step 3 is skipped; Jamie's 48 hours is ignored
- Window closes Wed Apr 23 at 2:00 PM (24 hours before)
- Current time is 10:00 AM — window still open
- Client can cancel free

**What gets logged:** every resolution writes an entry to `AuditLog` with the setting key, resolved value, source (`staff` / `company` / `system`), actor, and timestamp. Reports can surface "how often are staff overrides being applied" and "which settings are most frequently overridden" for product insight.

---

## Appendix B — Copy Voice Examples

Illustrations of the warm-framing-precise-facts voice across three comparable competitors' equivalents.

### Confirmation screen

**Mindbody (efficient + polished):** "Your appointment has been confirmed. Please review the details below. A confirmation email has been sent to your registered email address."

**GlossGenius (warm + polished):** "You're all booked in! Can't wait to see you. Check your email for all the details."

**Velura (warm framing + precise facts):**
"You're all set, Sarah.
Deep Tissue Massage with Jamie, Thursday Apr 24 at 2:00 PM.
Card saved. We'll only charge it if you cancel after Wed Apr 23 at 2:00 PM or don't show up."

### Cancellation fee warning

**Mindbody:** "Warning: Cancellation within 24 hours of appointment time will result in a cancellation fee per business policy."

**GlossGenius:** "Heads up — cancelling now means a fee will apply."

**Velura:** "It's inside the cancellation window. A $50 cancellation fee will be charged to your card ending in 4242."

### Post-review tip prompt

**Mindbody:** [does not exist]

**GlossGenius:** [does not exist]

**Velura:**
"Thanks for the 5 stars, Sarah.
Jamie put real work into your appointment. Want to send a tip?"

---

*End of spec. Next chat produces `13-booking-flow-buildout.md` with data model, API contracts, component tree, and acceptance tests.*
