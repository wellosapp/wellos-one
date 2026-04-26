# 04 — Booking Flow: Context Handoff for Next Chat
**Project:** Velura (Mindbody Rebuild)
**Document:** 04 — Booking Flow UX & Product Context (handoff for next session)
**Status:** Draft — to be expanded in next chat
**Version:** 0.1 (seed)
**Date:** April 21, 2026
**Purpose:** Give a fresh chat enough context to start designing the booking flow without re-reading every project doc.

---

## How to use this document

This is a **handoff doc**, not a spec. It exists so the next chat can start at "let's design the booking flow" instead of "let me first understand what Velura is." Read this top-to-bottom once. After that, jump to §8 — that is where new work happens.

When this doc is complete enough to hand off to engineering, it should be renamed to `04-booking-flow.md` and follow the same UX spec pattern as:
- `01-design-system.md`
- `02-onboarding-flow.md`
- `03-dashboard-today-view.md`

Those are the three UX specs already produced. This will be the fourth.

---

## 1. What Velura is (30-second version)

Velura is a rebuild of Mindbody / Vagaro / GlossGenius for salon, spa, wellness, medspa, and fitness businesses. The research thesis: the three incumbents converge on the same commercial core (booking, CRM, payments, reminders, memberships, reporting) but all have the same operational failures — broken checkout, fragile intake forms, bolted-on SMS, limited calendar sync, locked-up training, inconsistent reminders.

Velura's winning play is to be **boring and correct** where the incumbents are flashy and broken. The booking flow is where most of that fight happens.

**The design posture:**
- GlossGenius-style polished UX
- Vagaro-style modular packaging
- Mindbody-ready enterprise data model underneath

**Verticals at launch:** Salon/medspa, wellness/massage, fitness studio, personal trainer. Multi-location is Phase 3.

---

## 2. What already exists (prior docs — read these)

| Doc | What it covers | Why it matters for booking |
|---|---|---|
| `01-design-system.md` | Visual tokens, typography, components, colors, spacing, motion | All booking UI must use these tokens — no exceptions |
| `02-onboarding-flow.md` | Business setup, staff invites, booking policy selection | Onboarding is where `bookingPolicy` (INSTANT / REQUEST_APPROVAL / STAFF_ONLY) is chosen. Booking flow must respect it. |
| `03-dashboard-today-view.md` | Today View home screen | The Quick Book widget lives here. Full booking creation flow lives in the Calendar section. |
| `deep-research-report.md` | Competitive analysis across Mindbody, Vagaro, GlossGenius | Booking is the domain where they diverge most — study their differences |
| `technical-build-spec.md` | Architecture direction | Booking engine is P0. Time-zone + recurrence + resource allocation are called out as the hardest problems. |
| `09-dev-handoff.md` | Epic sequencing | Booking is Epic 3 (availability + appointments) and Epic 4 (login-free client portal). Read those two epics first. |
| `10-design-system-buildout.md` | Implementation spec for the design system | Tailwind config, tokens, component contracts |
| `11-onboarding-buildout.md` | Implementation spec for onboarding | Shows the pattern this doc will eventually follow |
| `12-dashboard-buildout.md` | Implementation spec for dashboard | Shows where Quick Book lives and how it calls the booking engine |

**Minimum required reading for the next chat:** `02-onboarding-flow.md`, `03-dashboard-today-view.md`, and §3–§8 of `09-dev-handoff.md`. Everything else is reference.

---

## 3. Scope: what "booking flow" actually means

Booking is not one flow — it is a family of related flows that share a schema. They must be designed together or they drift apart.

### 3.1 Client-facing (public, no login)

- **Public booking portal** at a per-tenant URL (e.g., `book.kindredstudio.com`)
- **Embeddable widget** on the tenant's own website
- **Reschedule / cancel flow** via magic link
- **Deposit collection** at booking time (Stripe SetupIntent → PaymentIntent)
- **Waitlist signup** when the preferred slot isn't available
- **Recognition of returning clients** by email (silent — no account needed)

### 3.2 Staff-facing (authenticated, inside the app)

- **Quick Book widget** — already scoped in `03-dashboard-today-view.md` §Quick Book Widget
- **Full calendar create** — the drag-on-calendar path, richer fields
- **Walk-in booking** — minimal fields, client may not exist yet
- **Reschedule via drag-and-drop** on the calendar
- **Block time** (staff marks themselves unavailable) — technically not a booking, but shares the availability engine

### 3.3 Shared underneath (the booking engine)

Both flows call the same server-side availability engine and write to the same `Appointment` table. This doc is mostly about the UX of the two flows above; the engine internals are in `09-dev-handoff.md` Epic 3 and `technical-build-spec.md` §3.

### 3.4 Out of scope for this doc

- Classes and group appointments (Phase 2 per `09-dev-handoff.md` §P2)
- Multi-service stacked bookings (Phase 2)
- Pick-a-spot for classes (Phase 2)
- Memberships and packages redemption flow (separate doc, P2-4)
- Gift card sales inside booking (P2-4)
- Social booking (Instagram, Google Reserve) — Phase 2 P2-6

Keep the next chat's scope locked to MVP. Anything labeled P2 or P3 is tracked but not designed here.

---

## 4. Architectural constraints the booking flow must respect

These come from prior docs. The next chat does not get to re-litigate them.

### 4.1 From `09-dev-handoff.md` Epic 3

- **Store all times in UTC.** Convert to local at render time only.
- **Availability is computed, never materialized.** No stored `TimeSlot` table.
- **Double-booking prevented at the DB level** via Postgres `EXCLUDE` constraint on staff + time range. The UI cannot bypass this.
- **Recurring appointments at MVP: weekly only.** Monthly and custom are Phase 2.
- **Buffers are part of the service definition**, enforced by the engine, invisible to the client.
- **Appointment state machine:** `scheduled → confirmed → checked_in → in_progress → completed`, with forks to `cancelled` and `no_show`. Transitions enforced server-side.

### 4.2 From `10-design-system-buildout.md`

- All UI uses the design tokens: `--ink`, `--accent`, `--surface`, etc.
- Motion: no bounce, no overshoot. Fades and subtle translates only.
- Touch targets: 44×44px minimum.
- Mobile font size: 16px minimum on inputs (iOS zoom prevention).
- Never use color alone to convey state — always paired with icon or label.

### 4.3 From `11-onboarding-buildout.md` — booking policy

The tenant picks one during onboarding. The booking flow must branch on it:

| Policy | Client UX |
|---|---|
| `INSTANT` | Book and get immediate confirmation. Most common. |
| `REQUEST_APPROVAL` | Submit a request; see "Pending approval" status; owner confirms or declines. |
| `STAFF_ONLY` | No public portal at all. Direct visitors to contact the business. |

### 4.4 From `12-dashboard-buildout.md` — Quick Book

Quick Book on the dashboard is already scoped: typeahead client search, service dropdown, slot dropdown, book button. The full staff booking flow in this doc is the **richer** version — full calendar view, drag-to-create, client-detail expansion, optional notes, deposit handling, override permissions.

### 4.5 Payments posture

- **Stripe** for everything: Payment Element, Setup Intents, Terminal, Payment Intents.
- **Card-on-file at booking time** is collected via SetupIntent. No charge happens.
- **Deposits** charge via PaymentIntent with `off_session: true` after SetupIntent completes.
- **Cancellation / no-show fees** follow the same PaymentIntent path, triggered by state transitions or scheduled jobs.

### 4.6 Stack (locked)

Same as `11-onboarding-buildout.md` and `12-dashboard-buildout.md`:

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 App Router + TypeScript + shadcn/ui + Tailwind |
| Backend | Fastify on the DO Droplet |
| DB | PostgreSQL on DO Managed Databases |
| Auth | Clerk (staff) + magic links (clients, tokenized, no account) |
| Payments | Stripe |
| SMS | Twilio |
| Email | Resend + React Email |
| Deploy | DO Droplet per `push-to-production.md` |

---

## 5. The competitive lessons to apply

From `deep-research-report.md` and `09-dev-handoff.md` §Context. Study these before designing.

### 5.1 GlossGenius — what to copy

- **Login-free booking.** No account creation before booking. Biggest conversion lever.
- **Mobile-first aesthetic.** Calm, spacious, one-thumb operable.
- **Fast slot selection.** Under 90 seconds from landing to confirmation on mobile.
- **Reserve with Google / social integrations.** (Phase 2 for Velura.)
- **Frictionless reschedule.** Magic link, one-tap reschedule.

### 5.2 Mindbody — what to borrow (selectively)

- **Pick-a-spot for classes.** (Phase 2.)
- **Multi-location awareness in the data model.** Even though MVP is single-location.
- **Robust resource allocation** — rooms, equipment, chairs. Must be modeled from day one per `technical-build-spec.md` §3.
- **Enterprise-friendly booking policies** — deposits, cancellation windows, minimum notice.

### 5.3 Vagaro — what to borrow

- **Widget embeddability.** Salons link to Vagaro from their own sites. Velura's widget has to be equally embeddable.
- **Booking distribution** — Instagram, Facebook, Apple Maps booking. (Phase 2.)
- **Deposit policy flexibility** — per-service deposit amounts.

### 5.4 What every incumbent gets wrong — Velura must not repeat

1. **Deposit policy confusion.** Clients don't understand whether they've been charged. Fix: crystal-clear "Not charged yet — card saved for no-show fee" messaging.
2. **Recurring appointments breaking on DST.** Fix: test DST transitions explicitly before ship.
3. **Cancellation windows that trigger at the wrong local time.** Fix: window math in tenant timezone, not server UTC.
4. **Calendar sync double-creating events.** Fix: external events become busy blocks only, never appointments.
5. **"Loading…" states with no timeout.** Fix: every loading state has a 10-second fallback that offers a retry or contact.
6. **Booking a service that the chosen staff can't perform.** Fix: filter services by selected staff (or vice versa) in the UI, not validated only on submit.
7. **Showing unavailable slots as available for half a second before they disappear.** Fix: never render a slot that isn't guaranteed available in the current fetch cycle.

---

## 6. Personas and the journeys to design for

These are the concrete user stories the next chat should design against. They're written as "a [persona] is trying to [goal]" — expand each into a flow diagram.

### 6.1 Client-facing personas

| Persona | Primary journey | Edge cases |
|---|---|---|
| **First-time client, mobile** | Lands on `book.kindredstudio.com` from Instagram link → picks service → picks staff "any" → picks slot → enters name/email/phone/card → confirms | Payment declined, slot grabbed by another client during fill-in, typo in email |
| **Returning client, mobile** | Lands on booking URL → picks service (maybe they know the staff's name) → picks slot → email recognized → card on file used → confirms | Email recognized but client wants a different card, different service than history suggests |
| **Client needing to reschedule** | Receives reminder SMS with "Need to reschedule?" link → opens magic link → picks new slot → confirms | Magic link expired, new slot time conflicts with cancellation window, partial refund owed |
| **Client on waitlist** | Tries preferred slot, full → joins waitlist → gets SMS when slot opens → books within window | Slot expires before client responds, client no longer wants it |
| **Client booking a service that requires intake** | Normal booking flow → after confirmation, sees "You have 1 form to complete before your visit" banner → fills it | Doesn't complete form, arrives unprepared |

### 6.2 Staff-facing personas

| Persona | Primary journey | Edge cases |
|---|---|---|
| **Front desk, calendar-first booking** | Client calls → front desk opens calendar → drags to create on a staff calendar at the requested time → fills in client (search or new) → picks service → saves | Client doesn't exist yet, requested time overlaps with a break, client has a tag like "do not book after 6 PM" |
| **Owner, booking themselves** | Quick Book on dashboard → picks a regular client → pre-fills usual service → picks slot → saves | Owner is also a provider — their own availability is the constraint |
| **Provider, blocking time off** | Opens calendar → selects their own row → drags a block → labels "Lunch" → saves | Block overlaps an existing appointment — should the booking be blocked or the block be rejected? |
| **Manager, overriding a conflict** | Needs to double-book for training → hits "Override" with reason → confirms | Audit log must capture the override + reason |
| **Staff on mobile, checking in a walk-in** | Opens Quick Book from phone → "+ New client" → minimal fields → books for the next available slot → takes payment | Walk-in during another appointment — short service fits, long one doesn't |

---

## 7. Flows to sketch (for the next chat)

The next chat's first job is to produce flow diagrams or flow narratives for these. This is the output of the next session.

1. **Public booking — first-time client — happy path**
2. **Public booking — returning client — happy path**
3. **Public booking — request approval (non-INSTANT policy)**
4. **Reschedule via magic link**
5. **Cancel via magic link — inside and outside the cancellation window**
6. **Waitlist signup → notification → conversion**
7. **Staff Quick Book — happy path (already partially specced in dashboard doc)**
8. **Staff full-calendar drag-to-create**
9. **Staff walk-in booking**
10. **Staff block-time-off**
11. **Manager override for double-booking**
12. **Booking a service that triggers an intake form**
13. **Deposit collection at booking time**
14. **Rebook after cancellation — the "book again" CTA in the client's post-visit email**

Each flow should include:
- Entry point
- Step sequence
- What data is collected at each step
- Success and failure branches
- Empty/error/edge states
- Messaging shown to the user at each step

---

## 8. Open questions that must be answered in the next chat

These are design decisions that block the flow. The next chat must either answer them or propose a default and an ADR note.

### 8.1 Client-facing UX

1. **Staff selection: "Any available" first, or specific staff first?** GlossGenius defaults to service → any staff → slots. Vagaro surfaces specific staff earlier. Which feels better for Velura's verticals?
2. **How are staff displayed to clients?** Avatar + name + bio snippet? Or a name-only dropdown? (Implication: photo upload requirements.)
3. **Can clients see all open slots across all eligible staff, or only one staff member at a time?** The "all slots" view is better for conversion; the per-staff view is better for clients with a preference.
4. **Slot granularity.** 15-minute, 30-minute, or service-specific? Incumbents vary.
5. **How long is a slot "held" during the booking flow before someone else can grab it?** Proposed default: 8 minutes from first field interaction. Confirm.
6. **Do we show slot availability in client's local time zone or business's?** Business's is unambiguous; client's is friendlier. Default: business, with a "This time is shown in [City] time" note.
7. **Deposit messaging.** Is the card "saved" or "authorized"? The legal and UX answer differ. Reconcile.
8. **Cancellation window display.** "Free to cancel until 24 hours before" vs "Cancellation fee applies after [exact timestamp]." Which is clearer?
9. **Waitlist model.** First-come-first-served auto-book, or SMS-to-confirm? Auto-book is faster but riskier for the client.
10. **Multi-language support.** MVP English-only, or Spanish at launch? (Many wellness customers serve Spanish-speaking clientele.)

### 8.2 Staff-facing UX

11. **Full-calendar view default.** Day view, week view, or agenda? Per-role default?
12. **Drag-to-create minimum drag distance.** Too sensitive and staff create accidentally; too insensitive and it feels unresponsive.
13. **Walk-in client creation.** Inline in the booking flow, or redirect to Clients section and back?
14. **Override permissions.** Who can override a double-book — only OWNER and MANAGER, or also FRONT_DESK with reason?
15. **Block time off — does it require approval from OWNER?** For subcontractors, almost certainly yes. For providers, unclear.
16. **Cancellation by staff — does it charge a fee?** Incumbents differ. Default: never charge when staff cancels.
17. **Substituting staff on an existing booking.** UX pattern: drag-to-move across rows, or a "Change staff" action in the drawer?
18. **Overbooking tolerance.** Hard prevent, or warn-and-allow with a "confirm" second step?

### 8.3 Data / integration

19. **External calendar busy blocks.** When do they get pulled? Real-time vs. polling? Polling interval?
20. **Deposit refund logic.** Full refund on cancellation inside window? Partial? Configurable per service?
21. **No-show fee trigger.** Scheduled job N minutes after appointment start, or staff-triggered? Both, with staff override?
22. **Multi-service bookings (Phase 2 in scope).** Does the MVP schema need to support them even if the UI doesn't? (Recommended: yes, via a `BookingItem` table from day one.)
23. **SMS reminder opt-in at booking time.** Pre-checked, or opt-in? Legal constraint: 10DLC requires explicit opt-in.
24. **Client photo / selfie capture for medspa.** Deferred to medspa package, but should the booking flow anticipate it?

---

## 9. UX spec starter: flow structure

The next chat should expand this into a full `04-booking-flow.md`. Below is the skeleton to fill in, following the pattern of `02-onboarding-flow.md` and `03-dashboard-today-view.md`.

```
# Booking Flow
Project: Velura
Document: 04 — Booking Flow UX Specification
Status: Draft
Version: 1.0

## Overview
[Purpose of the booking flow in 1–2 paragraphs. Who uses it, what problem it solves, where it fits in the product.]

## Goals
- [ ] Client can book in under 90 seconds on mobile
- [ ] Staff can book a walk-in in under 30 seconds
- [ ] Zero double-bookings, ever, under any race condition
- [ ] Booking policy (INSTANT / REQUEST / STAFF_ONLY) is respected end-to-end

## Non-Goals
[Explicit list of what's not in this doc. Classes, memberships, social booking, etc.]

## Assumptions
- Tenant has completed onboarding
- At least one active staff member with at least one service assigned
- Booking policy is set
- Payments are either connected (deposit-capable) or not (book-only mode)

## Risks
[Table: risk / likelihood / impact / mitigation]

## Flow Map
[High-level diagram of all flows in §7 above, labeled entry points and exits.]

## Detailed Flows

### A. Public Booking — First-Time Client
[Step-by-step with screen layouts, fields, validation, copy]

### B. Public Booking — Returning Client
[Delta from A]

### C. Reschedule via Magic Link
[...]

### D. Cancel via Magic Link
[...]

### E. Waitlist Signup
[...]

### F. Staff Quick Book
[Reference to dashboard doc + delta]

### G. Staff Full-Calendar Create
[...]

### H. Staff Walk-In
[...]

### I. Staff Block Time
[...]

### J. Manager Override
[...]

### K. Intake Form Trigger
[...]

### L. Deposit Collection
[...]

## State Coverage
[All error, empty, and edge states]

## Component Specifications
[Individual component specs following the dashboard doc's format]

## Mobile Behavior
[Responsive rules]

## Loading States
[Skeleton rules, timeouts, retry patterns]

## Messaging & Copy
[Exact strings for all user-facing text — this becomes the copy source of truth]

## Role-Based View Summary
[Matrix of which booking features each role sees]

## Dependencies
[Availability engine, Stripe, Twilio, Resend, magic link service, etc.]

## Open Questions
[Carried from §8 of this handoff doc, with answers as they come in]

## Phase 1 — Build Now
[Checklist]

## Phase 2 — Add Later
[Checklist]

## Reviewed By
[Roles / reviewers]
```

---

## 10. Inputs the next chat will need

Before the next chat can produce a useful UX spec, it needs (or should ask for):

1. **Booking policy preference.** Is INSTANT the assumed default, or is REQUEST_APPROVAL more common in the target market?
2. **Deposit norms by vertical.** Salon: typically no deposit. Medspa: often a deposit. Fitness: usually not. Is Velura assuming all verticals can toggle?
3. **Cancellation window defaults by vertical.** 24 hours is common; some businesses want 48 or 72.
4. **Client recognition by email.** Confirmed — same email = same client, silent. Is that the final call? (Implications for privacy.)
5. **Brand voice for client-facing copy.** The dashboard doc uses a calm, warm tone. Should booking match, or lean more transactional?
6. **Screenshots or wireframes from competitors** that the team specifically likes or dislikes. This accelerates the UX conversation enormously.

The next chat should start by asking these if they're not provided.

---

## 11. Connection points to other docs

When the UX spec is written, these are the places where it will need to cross-reference or update existing docs:

| Existing doc | What needs updating when booking flow is specced |
|---|---|
| `03-dashboard-today-view.md` | Quick Book widget spec may need refinement based on shared flow decisions |
| `12-dashboard-buildout.md` | Quick Book API contract may expand; `POST /v1/dashboard/quick-book` may share schema with the public booking endpoint |
| `09-dev-handoff.md` Epic 3 | Availability engine acceptance criteria should be reviewed against the new UX — are there behaviors the engine needs to support that aren't yet listed? |
| `09-dev-handoff.md` Epic 4 | This epic *is* the login-free client booking portal. The UX spec becomes its acceptance criteria. |
| `technical-build-spec.md` §3 | Domain model additions: `WaitlistEntry`, `BookingHold`, possibly `CancellationPolicy`. |

The next chat should produce an update list at the end of its UX spec: "When this ships, these other docs need these specific changes."

---

## 12. What the next chat should produce

Minimum deliverable:

1. A UX spec file `04-booking-flow.md` following the skeleton in §9, at least as detailed as `03-dashboard-today-view.md`.
2. Answers or proposed defaults for all 24 open questions in §8.
3. A list of updates needed to existing docs (per §11).

Stretch:

4. A buildout doc `13-booking-flow-buildout.md` following the pattern of `11-onboarding-buildout.md` and `12-dashboard-buildout.md`, with data model additions, API contracts, component tree, and acceptance tests.
5. A sketch of the availability engine's test matrix — specifically the DST and recurrence edge cases.

The UX spec is the blocker. The buildout can happen in a follow-up chat once Product signs off on the UX.

---

## 13. Starter prompt for the next chat

Copy-paste this to start the next session cleanly. It gives the new chat everything it needs without requiring it to read every file in the project.

```
I'm working on Velura, a Mindbody/Vagaro/GlossGenius rebuild for salon,
spa, wellness, medspa, and fitness businesses. We have UX specs for the
design system (01), onboarding (02), and dashboard (03), plus
implementation buildouts for each. Now we need to design the booking flow.

I'm attaching:
- 04-booking-flow-context.md (this handoff doc — read this first)
- 02-onboarding-flow.md (for booking policy context)
- 03-dashboard-today-view.md (Quick Book lives here)
- 01-design-system.md (all booking UI uses these tokens)

Your job: produce a UX spec `04-booking-flow.md` following the structure
in §9 of the handoff doc. Cover both client-facing (login-free public
portal) and staff-facing (Quick Book + full calendar create) surfaces.

Start by asking me the inputs in §10 of the handoff doc. Then propose
defaults for the 24 open questions in §8. Then write the spec.
```

---

## 14. Status

This handoff is a **seed document**. It is not the UX spec. The next chat produces the spec.

When the next chat finishes:
- This doc can be archived (or kept as an appendix showing how the spec was scoped).
- `04-booking-flow.md` becomes the new source of truth.
- Open questions move from §8 here to a "Resolved" appendix in `04-booking-flow.md`.

---

## Checklist before starting the next chat

- [ ] Read `02-onboarding-flow.md`, `03-dashboard-today-view.md`, and `09-dev-handoff.md` §3, §4
- [ ] Have answers ready for the §10 inputs (or be willing to default them)
- [ ] Have competitor screenshots or reference flows on hand if possible
- [ ] Allocate at least 2 hours — this is the biggest and most edge-case-heavy flow in the product
- [ ] Be prepared to make decisions on the §8 open questions — defer only if necessary

Start the new chat by pasting the prompt in §13.
