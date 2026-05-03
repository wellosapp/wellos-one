# Wellos — Staff Booking Area + Client CRM

**Focus:** Staff Booking Area  
**Connected module:** Client CRM  
**Scope:** Thirteen core CRM capabilities in booking + one tenant-defined custom row  
**Purpose:** Define how client CRM appears inside staff booking, appointment creation, calendar appointment detail, check-in, service completion, and future client history.

**Companion:** See [staff-booking-implementation-map.md](./staff-booking-implementation-map.md) for repo mapping, API gaps, and build order versus current code.

---

## 1. Product Goal

The Staff Booking Area must not feel like a disconnected form that only creates appointments.

It should behave as a fast booking workspace where staff can:

- Find or create the client.
- See the most important client information before booking.
- Avoid mistakes using alerts, allergies, restrictions, forms, balances, and preferences.
- Attach notes, files, service details, and appointment context directly to the booking.
- Ensure every appointment feeds the client CRM for future lookup.

**Rule:** Every appointment becomes part of the client record, and every important client detail is visible at booking time.

---

## 2. Where This Lives in the App

### Primary staff surfaces

| Surface | Purpose |
|--------|---------|
| Dashboard Quick Book | Fast path for front desk or provider. |
| Calendar Day / Week View | Click or drag a slot to open booking. |
| Appointment Side Panel | Booking on the right; same screen as calendar. |
| Client CRM Drawer | History, alerts, notes, forms, files, preferences, appointment-linked records. |
| Appointment Detail View | After booking, reopen appointment with full CRM context. |

### Experience pattern

1. Right-side booking panel opens (Quick Book, New Appointment, or drag slot).
2. Staff selects or creates a client.
3. Client CRM section loads under or beside the booking form.
4. Staff selects service, provider, date, time, resource, settings.
5. System evaluates CRM rules: alerts, banned status, intake, forms, balances, preferences, conflicts.
6. Staff confirms.
7. Appointment saves and links to client CRM automatically.

---

## 3. Staff Booking — Client CRM Feature Matrix

| # | Feature | What staff sees | Benefit | How it works with booking |
|---:|---|---|---|---|
| 1 | Client search + fast select | Searchable field (name, phone, email, tags) | Correct client, fewer duplicates | Selection loads contact, preferences, defaults, alerts, forms, history. |
| 2 | Inline new client | Compact create form in panel | Walk-ins without leaving calendar | Create client, then link appointment; minimal fields with completion nudge. |
| 3 | Client snapshot card | Name, preferred name, phone, email, tags, visits, last visit, LTV, preferred provider | Context before service choice | Snapshot updates defaults (e.g. preferred provider). |
| 4 | Visit history | Last 3–5 visits: date, service, provider, status, notes, amount | Pattern without full profile | Repeat service, same provider, reuse past notes. |
| 5 | Structured client notes | Categories: general, preference, formula, allergy, medical, behavioral, billing, relationship, internal | Searchable, not one blob | Notes can link to client only, service, or this appointment. |
| 6 | Pinned notes | High-value notes at top | Nothing critical missed | Surfaces in booking and calendar appointment open. |
| 7 | Booking alerts | Blocking or acknowledge alerts on client select | Safety and ops | Acknowledgment required before save where configured. |
| 8 | Preferences + service defaults | Provider, room, pressure, products, music, gender, service setup | Personalization, fewer repeats | Prefill with override per appointment. |
| 9 | Forms + intake status | Chips: pending, sent, completed, expired, required before visit/booking | Clearance for visit | Soft vs hard rules per service; assign or block. |
| 10 | Photos + files | Before/after, PDFs, waivers, inspiration uploads | Prep and comparison | Attach during booking; link to client, service, appointment. |
| 11 | SOAP / service notes | Shortcut in appointment detail | Clinical/service documentation | Tied to appointment ID; visible in CRM and future briefings. |
| 12 | Payment + balance context | Card on file, balance, deposit, policy, packages | Collect before confirm | Warn, block, or override by permission. |
| 13 | Client status + restrictions | Active, inactive, banned, VIP, needs approval, etc. | Protect the business | Block or override with logged reason. |
| Custom | Tenant-defined CRM row | e.g. preferred room, skin type, membership | Vertical flexibility | Configurable visibility, edit rules, booking behavior. |

---

## 4. Recommended Layout (Staff Booking Panel)

Right-hand panel structure (conceptual):

1. Header: New appointment + quick actions (walk-in, block, waitlist).
2. **Client:** search, create new, then **client snapshot card**.
3. **CRM alerts + must-know:** allergies, balance, forms, pinned notes.
4. **Appointment details:** service, staff, date/time, resource, duration, deposit/card.
5. **CRM drawer tabs:** History, Notes, Forms, Files, Payments (within or adjacent to panel).
6. **Appointment notes:** client-facing, internal, service-specific.
7. Primary actions: Save appointment, Save + send confirmation.

Tab contents:

| Tab | Contents |
|-----|----------|
| History | Recent visits, cancellations/no-shows, last service, provider, notes. |
| Notes | Pinned, alerts, preferences, formulas, medical/non-clinical, internal. |
| Forms | Required forms, status, send/resend, submissions. |
| Files | Before/after, reference photos, waivers, uploads. |
| Payments | Card on file, deposit rule, balance, packages/membership. |

---

## 5. CRM Context Load (Client Selected)

Flow:

```text
client selected → load profile → load booking-relevant CRM context
→ surface alerts / preferences / forms / balance / history
→ apply defaults to appointment form
→ validate permissions and restrictions
```

### What loads immediately

| Data | Why during booking |
|------|-------------------|
| Identity | Correct person |
| Preferred name | Personalization |
| Preferred provider | Default staff |
| Tags | Segment context |
| Alerts | Prevent mistakes |
| Pinned notes | Critical context |
| Required forms | Allow vs block |
| Saved card / balance | Deposit and policies |
| Visit history | Repeat service, fewer questions |
| Files/photos | Prep for visual services |
| Communication preferences | SMS vs email confirmation |

---

## 6. Appointment Creation Workflows

### Flow A — Existing client

Calendar / Quick Book → panel opens → search/select client → CRM snapshot + alerts → service/provider/time → validation (availability, resources, restrictions, forms, payment, alerts) → save → link IDs and references → confirmation per preferences.

### Flow B — New / walk-in

No search match → Create new client (minimal fields) → book → client created first → appointment linked → profile incomplete nudge.

### Flow C — Client with alert

Select client → alert with trigger booking → acknowledge → log acknowledgment (note, staff, appointment, context, time) → continue.

### Flow D — Required form

Select service → check form rules → soft (book + send form) vs hard (block) → save with assignments → client completes via magic link → CRM + appointment updated.

---

## 7. Booking Writes Back to CRM

| Booking event | CRM update |
|----------------|------------|
| Appointment created | Visit/history |
| Client-facing note | Appointment + client-visible context |
| Internal note | Internal notes + appointment link |
| Service-specific note | Service history |
| Form assigned | Forms tab |
| Form completed | CRM + appointment |
| File uploaded | Files tab + appointment |
| Checked in | Status + alerts |
| Completed | Last visit, visits count, LTV, service history |
| SOAP note | Provider documentation |
| Cancelled / no-show | History + optional balance |
| Payment captured | Payment history + LTV |

---

## 8. Booking Rules vs CRM

| Condition | Behavior |
|-----------|----------|
| Banned | Block public; staff may need override |
| Allergy alert | Acknowledge before book/check-in |
| Behavioral alert | Warning; possible dual coverage / manager |
| Outstanding balance | Warn, block, or pay per tenant |
| Intake incomplete | Assign, warn, or block per service |
| Preferred provider | Prefill staff |
| Previous formula note | Offer repeat setup |
| Reference photo | Show in prep |
| SMS opted out | Email confirmation |
| VIP / high-touch | Concierge notes / review |
| No phone/email | Warn on reminders |
| Profile incomplete | Allow book + post task |
| Custom row required | Block or override |

---

## 9. Data Model Notes

### Appointment links (target shape)

Each appointment should support references including: tenant, location, client, staff, service, resource, times, timezone, status, source, internal/client notes, idempotency.

### CRM links to appointment

Examples: notes, files, SOAP, form assignments, payment intents, alert acknowledgments — each should optionally reference `appointment_id` where applicable.

### Appointment `source` values (taxonomy)

Use consistent enums such as: consumer web, staff web, widget, api, import, walk-in, quick book, calendar drag — align with existing Prisma/API enums and extend deliberately.

---

## 10. Permissions (Summary)

- Owner/admin: full CRM and overrides in booking.
- Manager: booking + most overrides per settings.
- Front desk: create/select clients, book, forms, balances if allowed.
- Provider: own appointments + needed context, pinned notes, alerts, relevant forms/files.
- Subcontractor / limited: narrowed visibility; safety alerts may still surface.

Sensitive categories (clinical, billing, internal notes) remain tenant-configurable.

---

## 11. UI States (Empty / Warning)

Cover empty states (no client, no history, no notes, no forms, no files, no card) and warnings (duplicate client, slot lost, incomplete form, SMS opt-out, balance, banned, overlap, etc.) with explicit copy and actions — see acceptance criteria.

---

## 12. Acceptance Criteria (Summary)

- Search/select and inline create from booking panel.
- Selecting a client loads snapshot, alerts, notes, forms, files, history, payment context.
- Critical alerts before save; acknowledgments logged.
- Appointment-linked and service notes during booking.
- Service-driven form detection and assignment.
- Files linked to client and appointment.
- SOAP/service notes post-completion.
- Preferences drive confirmations.
- Restrictions warn, block, or override with audit.
- Booking writes through to CRM history.
- Custom CRM row configurable and visible in panel.

### Calendar integration

- New appointment appears on calendar after save.
- Appointment drawer shows same CRM context.
- Status updates feed CRM.
- Reschedule preserves linked notes/files/forms where modeled.
- Cancel/no-show updates history.

---

## 13. Build Priority (Engineering)

1. Appointment schema + CRM links.  
2. Client search + inline create in staff booking panel.  
3. Client snapshot card.  
4. CRM context endpoint for booking.  
5. Alert trigger system.  
6. Appointment-linked notes.  
7. Forms status integration.  
8. Files/photos links.  
9. Visit history.  
10. Payment/balance context.  
11. Restrictions + override flow.  
12. Custom CRM row config.  
13. Calendar appointment detail integration.

---

## 14. Suggested API Shape (Future)

Illustrative REST paths (prefix may be `/admin/...` or `/v1/staff-booking/...` per API conventions):

- `GET` staff-booking client context (`clientId`, optional `serviceId`)
- `POST` staff-booking appointments (or reuse existing appointment create + enrich)
- `POST` staff-booking clients inline
- `POST` staff-booking notes
- `POST` staff-booking alerts acknowledge
- `POST` staff-booking forms assign
- `POST` staff-booking files link

Response shape for client context: see shared TypeScript types in `apps/web/lib/staff-booking/client-context-types.ts` and [staff-booking-implementation-map.md](./staff-booking-implementation-map.md).

---

## 15. Custom Row Configuration

Configurable label, field type, visibility, required behavior, source (profile vs service vs appointment), edit roles, and booking behavior (display, prefill, block, warn).

Examples vary by vertical (salon, massage, medspa, fitness, PT) — tenant-defined.

---

## 16. Product Rule

Booking creates the appointment. CRM explains the client. Calendar shows the schedule. Appointment history connects all three.

If staff must leave booking to understand the client, the feature is not complete.
