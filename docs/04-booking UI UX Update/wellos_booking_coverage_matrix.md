# Wellos Booking / Calendar / Appointments — Coverage Matrix

**Purpose:** A single tier-mapping for every MVP feature listed in `wellos_calendar_booking_appointments_features.md`. Confirms nothing is missing from the roadmap and shows where each feature lands.

**How to use:** When a feature surfaces in conversation or PR review, look it up here to see its tier and current status. When a tier ships, update the **Status** column.

**Established:** 2026-04-30, after the E3-S2 pivot to follow the booking-UI walkthrough package and adopt the strict per-feature **database → API → frontend** workflow (`memory/feedback_db_api_frontend_order.md`).

---

## Tier definitions

| Tier | Scope | Status |
|---|---|---|
| **E3-S1** (shipped) | Core appointment table, EXCLUDE constraint, state machine, availability engine | Merged 2026-04-30 (PR #45) |
| **Tier A** (this schema PR) | Client memory + triage questions + content delivery + comm prefs + banned flag + appointment source | Generating now |
| **Tier B** (next schema PR) | Booking primitives: Block, MagicLinkToken, BookingHold, WaitlistEntry, AppointmentSeries, BlackoutDate, booking policy, request-approval state machine extension, location operating hours, settings infrastructure | Queued |
| **Tier C** (storefront schema PR) | Branded booking page, public slugs, gallery/bio storefront fields, BookingLinkCampaign, ProviderAssignmentLog, assignment strategy | Queued |
| **Epic 6** | Stripe — deposits, fees, card-on-file, refunds, ledger, no-show fee engine | Deferred per CLAUDE.md |
| **Epic 8** | BullMQ + TextLink + Postmark — scheduled jobs, SMS/email dispatch, reminders, waitlist auto-promotion, aftercare delivery, no-show auto-charge, pre-shift digest | Deferred per CLAUDE.md |
| **Forms epic** | Intake form builder, versioned forms, magic-link form distribution, signature audit | Deferred (separate epic) |
| **Phase 2** | Multi-service appointments, multi-provider, classes, resource/room allocation, real-time external calendar sync, travel time, auto-waitlist, multi-language | Deferred per spec |
| **Future** | Memberships, packages, gift cards, inventory, marketing campaigns, BI/data warehouse, etc. | Separate epics |
| **UI ticket** | Pure frontend feature on top of existing data — no schema change | Built per walkthrough sub-tickets |
| **Infra ticket** | Cross-cutting (Redis cache, observability, etc.) | Existing infra workflow |

---

## §1 Calendar Area — 28 MVP features

| # | Feature | Tier | Notes |
|---|---|---|---|
| 1 | Day calendar view | UI ticket | On E3-S1 data |
| 2 | Week calendar view | UI ticket | E3-S2 snapshot exists; rebuilds per walkthrough |
| 3 | Staff-column calendar | UI ticket | |
| 4 | Appointment blocks | UI ticket | |
| 5 | Appointment status badges | UI ticket | All 7 states from E3-S1; +2 from Tier B (requested/declined) |
| 6 | Open slot rows / gaps | UI ticket | Calls `/admin/availability` |
| 7 | "Next up" appointment marker | UI ticket | |
| 8 | Past appointment de-emphasis | UI ticket | |
| 9 | Appointment detail drawer | UI ticket | Walkthrough Ticket 2 |
| 10 | Calendar bottom sheet on mobile | UI ticket | Walkthrough mobile variant |
| 11 | Drag-to-create | UI ticket | Calls existing POST /admin/appointments |
| 12 | Drag-to-reschedule | UI ticket + new PATCH /:id/reschedule | API addition in Tier B |
| 13 | Block time off | **Tier B** | New `Block` table |
| 14 | Recurring blocks | **Tier B** | `Block.recurrence` |
| 15 | Pending block approval | **Tier B** | `Block.approvalStatus` |
| 16 | Calendar conflict state | UI ticket | Surfaces existing 409 EXCLUDE error |
| 17 | Manager override visual indicator | **Tier B** | `Appointment.isOverride` |
| 18 | Calendar role filtering | UI + role middleware | |
| 19 | Staff availability/status overview | UI ticket | Derived from appointments + working hours |
| 20 | Tap open slot to Quick Book | UI ticket | |
| 21 | Check-in action | ✅ E3-S1 | `appointment.transition` to checked_in |
| 22 | No-show action | ✅ E3-S1 | `appointment.transition` to no_show |
| 23 | Collect payment action | **Epic 6** | Stripe |
| 24 | Add note action | **Tier A** | `ClientNote` with appointmentId |
| 25 | Cancel action | ✅ E3-S1 | |
| 26 | Calendar refresh | UI ticket | SWR / pull-to-refresh |
| 27 | External calendar busy blocks | **Phase 2** | `ExternalCalendarConnection` + `ExternalBusyBlock` |
| 28 | Add-to-calendar output (.ics) | UI ticket | Generate ICS string from appointment data |

---

## §2 Public Booking Area — 37 MVP features

| Feature group | Tier | Notes |
|---|---|---|
| Public booking portal / Login-free / Mobile-first / Service selection / Categories / Provider preference / Date picker / Suggested nearby dates / Timezone label / Booking summary / Exact cancellation timestamp / Confirmation screen / Manage booking link / Public 404 fallback | UI ticket on **Tier B** data | New `/book/:tenantSlug/*` routes; uses Tier B BookingHold + MagicLinkToken |
| Service detail sheet | **Tier C** | `Service.galleryImageUrls`, `longDescriptionMarkdown`, `whatToExpectMarkdown` (already Tier A), `prepInstructionsMarkdown` (already Tier A), `highlightReviewId` |
| Provider profile sheet | **Tier C** | `Staff.tagline`, `longBioMarkdown`, `specialties`, `yearsExperience`, `introVideoUrl`, `galleryImageUrls`, `highlightReviewId` |
| Any-available + Round-robin/load-balanced/preferred-first assignment | **Tier C** | `Tenant.assignmentStrategy` + `ProviderAssignmentLog` |
| Time selection slot grid | ✅ E3-S1 | `/admin/availability` already exists; public variant in Tier B |
| Slot hold + Slot hold timer | **Tier B** | `BookingHold` |
| Client details form | UI ticket | |
| SMS opt-in | **Tier A** | `Client.smsOptedOut` (added) |
| Returning client recognition + "This isn't me" escape hatch | **Tier B** | Server-side matching logic; no new schema |
| Instant policy / Request approval / Staff-only | **Tier B** | `Tenant.bookingPolicy` enum + `requested`/`declined` AppointmentStatus extension |
| Direct service link / Direct staff link / Direct service+staff link | **Tier C** | `Service.publicSlug`, `Staff.publicSlug` |
| Embeddable booking widget | **Tier C** | iframe + JS bundle |
| Campaign booking links + QR codes | **Tier C** | `BookingLinkCampaign` |

---

## §3 Appointment Management — 21 features

| Feature | Tier | Notes |
|---|---|---|
| Appointment model | ✅ E3-S1 | |
| Appointment statuses (7 base) | ✅ E3-S1 | |
| Statuses `requested` + `declined` | **Tier B** | For request-approval policy |
| Create appointment (any path) | ✅ E3-S1 | |
| Reschedule via staff drag | UI + Tier B API addition | |
| Reschedule via client magic link | **Tier B** | `MagicLinkToken` |
| Cancel | ✅ E3-S1 | |
| Staff-initiated cancellation (no fee) | ✅ E3-S1 | App logic on cancel transition |
| Staff cancel with rebook offers | UI ticket | Suggests 3 alts via availability engine |
| No-show marking + Manual-only | ✅ E3-S1 | |
| Appointment audit log | ✅ AuditLog | |
| Appointment notes | **Tier A** | `ClientNote` with appointmentId |
| Appointment source tracking | **Tier A** | `Appointment.source` enum (8 values: web/staff/widget/api/import/campaign/walk_in/quick_book) |
| Idempotency key | ✅ Existing IdempotencyKey | |
| Booking hold record | **Tier B** | `BookingHold` |
| Booking creation rollback | App logic + Tier B BookingHold | |
| Recurring appointments (weekly) | **Tier B** | `AppointmentSeries` |
| Multi-service appointments | **Phase 2** | |
| Multi-provider appointments | **Full Platform** | |
| Appointment status history | ✅ AuditLog covers it | |

---

## §4 Scheduling & Availability Engine — 19 features

| Feature | Tier | Notes |
|---|---|---|
| Availability computation / Computed-not-materialized / Existing-appt subtraction / Service duration / Buffer time / DB-level double-book / Clear slot-unavailable error / DST coverage / Timezone-safe math / Staff working hours | ✅ E3-S1 | All shipped |
| Tenant blackout dates | **Tier B** | `BlackoutDate` table |
| Location operating hours | **Tier B** | `Location.operatingHours JSONB` |
| Minimum booking notice | **Tier B** | Tenant setting |
| Maximum booking horizon (default 90 days) | **Tier B** | Tenant setting |
| Resource / room availability | **Phase 2** | `Resource` + `ServiceResourceRequirement` + `AppointmentResourceAssignment` |
| Availability cache (Redis) | Infra ticket | |
| Any-provider strategy setting | **Tier C** | `Tenant.assignmentStrategy` |
| Availability rules table | **Tier B** | Could collapse into Tenant settings |
| Travel time | **Phase 2** | |

---

## §5 Quick Book & Staff Booking — 12 features

| Feature | Tier | Notes |
|---|---|---|
| Quick Book widget | UI ticket | On dashboard |
| Client typeahead | UI / API | Existing /admin/clients?q= |
| Inline new client | UI on existing Client CRUD | |
| Service dropdown | UI | |
| Today open slot dropdown | UI | Calls /admin/availability |
| Any-staff Quick Book | UI + assignment strategy (Tier C) | |
| Optimistic booking UI | UI / state mgmt | |
| Quick Book rollback | UI / error handling | |
| Walk-in flow | UI ticket | |
| Send confirmation checkbox | App logic | Controls Epic 8 dispatch |
| Send payment link | **Epic 6** | Stripe |
| Staff booking with pending payment | **Tier B** | `Appointment.paymentStatus` enum (pending / paid / waived) |

---

## §6 Rescheduling, Cancellation & Waitlist — 17 features

| Feature | Tier | Notes |
|---|---|---|
| Magic-link appointment view | **Tier B** | `MagicLinkToken` table |
| Magic-link refresh | App logic + Tier B | |
| Client reschedule flow | **Tier B** | Uses MagicLinkToken |
| Late reschedule policy | **Tier B** | Tenant setting |
| Reschedule audit | ✅ AuditLog | |
| Re-queue reminders after reschedule | **Epic 8** | BullMQ |
| Client cancellation flow + Confirmation | **Tier B** | MagicLinkToken |
| Cancellation fee receipt | **Epic 6** | Stripe |
| Waitlist signup + preferences + 14-day TTL + Manual promotion | **Tier B** | `WaitlistEntry` |
| Waitlist SMS opt-in requirement | **Tier A** | `Client.smsOptedOut` enforced |
| Waitlist conversion offer + Time-boxed hold | **Tier B** | `WaitlistEntry.expiresAt` |
| Auto waitlist promotion | **Phase 2** | BullMQ scheduler |

---

## §7 Booking Payments, Deposits & Policy — 11 features

All **Epic 6** (Stripe). Card on file / deposits / full payment / cancellation policy engine / no-show fee engine / staff fee override / deposit refund logic / balance due / ledger linkage / post-review tip flow.

**Schema impact at Tier A/B/C:** none directly. `Appointment.paymentStatus` enum lands in Tier B for the staff-pending-payment flow but actual payment processing is Epic 6.

---

## §8 Intake, Prep & Appointment Context — 10 features

| Feature | Tier | Notes |
|---|---|---|
| Intake form trigger / Intake status / Intake reminder | **Forms epic** | Separate epic |
| Pre-booking triage questions | **Tier A** | `ServiceBookingQuestion` + `AppointmentBookingAnswer` |
| Service question templates (per vertical seed packs) | **Tier A** | Seed data populated in migration seed step |
| Photo upload in booking | **Tier A** | `ClientFile` with `noteId` FK |
| Staff prep visibility | API ticket | Aggregator on top of Tier A data |
| Pre-session prep content | **Tier A** | `Service.prepInstructionsMarkdown` + `ServiceContentDelivery` |
| Aftercare content | **Tier A** | `Service.aftercareMarkdown` + `ServiceContentDelivery` |
| Hard contraindication gating (medspa) | **Tier A** | `ServiceBookingQuestion.isGating` + `gatingRule` JSONB |
| Morning / pre-shift digest | **Epic 8** | BullMQ scheduled job |

---

## §9 Booking Notifications & Messaging — 14 features

All **Epic 8** (BullMQ + TextLink + Postmark). Booking confirmation SMS/email / Reminder SMS-email / Staff request-approval alert / Approval confirmation / Decline notification / Reschedule notification / Staff-initiated change confirmation / Cancellation notification / Waitlist notification / Prep reminder w/ content / Aftercare delivery / Review request notification / TextLink+Postmark channel strategy.

**Schema impact at Tier A/B/C:** minimal. `NotificationDispatch` table comes with Epic 8.

---

## §10 Booking Settings & Rules — 20 features

| Feature | Tier | Notes |
|---|---|---|
| Two-tier booking settings + Company setting modes + Staff booking preferences | **Tier B** | `TenantSetting` + `StaffSetting` tables OR JSONB on Tenant/Staff |
| Booking policy (instant/request_approval/staff_only) | **Tier B** | `Tenant.bookingPolicy` |
| Deposits enabled / amount | **Tier B settings + Epic 6 wiring** | |
| Cancellation window / fee | **Tier B** | Tenant setting |
| No-show fee | **Tier B** | Tenant setting |
| Minimum booking notice | **Tier B** | Tenant setting |
| Maximum booking window (default 90 days) | **Tier B** | Tenant setting |
| Buffer time | ✅ E3-S1 | `Service.bufferAfterMinutes` |
| Service offerings per staff | ✅ E2 | StaffService M2M |
| Working hours | ✅ E2 | `Staff.workingHours` JSONB |
| Break/lunch scheduling | **Tier B** | Extension of working_hours JSONB or new `Break` table |
| Walk-in acceptance | **Tier B** | Tenant setting |
| Tips enabled / defaults | **Tier B + Epic 6** | |
| Override / double-book permissions | RBAC ticket | Existing role-assignments + Tier B audit fields |
| Client recognition strictness | **Tier B** | Tenant setting |
| Calendar sync enabled | **Tier B** | Tenant + per-staff |
| Assignment strategy | **Tier C** | `Tenant.assignmentStrategy` |
| Booking Links settings page | **Tier C** | UI on top of `BookingLinkCampaign` |

---

## §11 Classes / Group / Phase 2 — 13 features

All **Phase 2** per the source doc. Class templates / Class occurrences / Registrations / Class capacity / Class waitlist / Auto-promote / Pick-a-spot seating / Companion-group booking / Gift booking / Save-for-later / Multi-language / Invitee-timezone display / Social booking integrations / Real-time external calendar sync.

**Schema impact at Tier A/B/C:** none. Phase-2 work is its own schema PR sequence.

---

## §12 Proposed Additions — 15 review-only features

All marked **Review** in the source doc; not in the roadmap until reviewed. Smart gap filler / Cancellation rescue flow / Last-minute opening broadcast / Rebook reminder after completion / Preferred cadence per service / Provider prep checklist / High-risk no-show flag / Waitlist priority tiers / Auto-fill from client preferences / Staff capacity heatmap / Calendar print/export / Service prep library / Weather-aware reminders / Mobile-service route planner / Booking inbox / Admin booking sandbox.

---

## Cross-cutting MVP (Wellos features matrix sheet "Sectioned Features")

Coverage of the broader features spreadsheet sections directly relevant to booking/calendar:

| Feature | Tier | Notes |
|---|---|---|
| Communication preferences (Client CRM #2) | **Tier A** | `Client.smsOptedOut`, `emailOptedOut`, `preferredChannel` |
| Banned client flag (Client CRM #9) | **Tier A** | `Client.banned`, `bannedReason`, `bannedAt` |
| Consent history (Files #8) | **Tier B** | `Consent` table; pairs with public-booking checkout flow |
| Soft-delete recovery view | ✅ Existing | `?includeDeleted=true` query param |
| Audit log | ✅ Existing | `AuditLog` table |
| Two-tier setting resolution | **Tier B** | See §10 above |

---

## File / image / video storage backend

**Cloudflare R2** is the canonical storage backend for `ClientFile`, `SoapNote` reference photos, future booking photo uploads, future Service gallery images, future Staff photos, and any other binary asset. Confirmed by user 2026-04-30.

**Schema impact:** none beyond the existing `ClientFile.storagePath` column. The column stores an R2 object key (e.g. `tenants/{tenantId}/clients/{clientId}/files/{fileId}.jpg`). Provider switching, if ever needed, is a config change, not a schema change.

**USER tasks to ship before any upload code runs (tracked in `memory/project_pre_launch_sweep.md`):**

1. Create R2 bucket in Cloudflare (e.g. `wellos-files-prod`)
2. Create R2 API token (scoped Object Read + Write to that bucket only)
3. Set up custom domain (e.g. `files.wellos.one`) for public-readable assets via R2's "Public Bucket" or via a Worker-routed CDN path
4. Add env vars to Railway (`@wellos/api`): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` (the custom domain, e.g. `https://files.wellos.one`)
5. Add the same as placeholders in `.env.example` (gets done as part of the API ticket that wires the upload SDK)
6. CORS rule on the bucket allowing PUT from `app.wellos.one` (signed-URL uploads)
7. EXIF stripping at upload time (per `wellos_calendar_booking_appointments_features.md` Files #3) — backend job, not schema

---

## Summary

| Bucket | Count (approx) |
|---|---|
| ✅ Already shipped (E3-S1 + E1 + E2) | ~14 features |
| 🟢 Tier A (this schema PR) | ~13 features |
| 🟡 Tier B (next schema PR) | ~30 features |
| 🔵 Tier C (storefront) | ~15 features |
| 🟣 Future epics (Stripe / BullMQ / Forms) | ~32 features |
| 🎨 UI tickets only (no schema) | ~50 features |
| ⏸️ Phase 2 / Review | ~28 features |

**~150 MVP features. Every one mapped to a tier or deferred bucket. Nothing missing from the roadmap.**

This document supersedes any earlier scope ambiguity. When new features surface in conversation, they get triaged into a bucket here before code work starts.
