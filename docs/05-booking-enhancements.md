# Booking Enhancements — Trust, Triage, Reach & Personalization

**Project:** Velura (Mindbody / Vagaro / GlossGenius Rebuild)
**Document:** 05 — Booking Flow Enhancements (Lunacal-Inspired Gap Closure)
**Status:** Draft
**Version:** 1.0
**Date:** April 25, 2026
**Author:** Claude (in conversation with Johnathan)
**Companion docs:** `04-booking-flow.md`, `01-design-system.md`, `02-onboarding-flow.md`, `09-dev-handoff.md`, `mindbody-rebuild-master-spec.md`, `006-booking-design-refresh.md`

---

## Why this document exists

Doc 04 (`04-booking-flow.md`) specifies a competitive booking core: instant booking, deposits, magic-link reschedule, waitlist, two-tier settings, post-review tipping. That work is sound and should ship as-is.

This document covers a different layer. Reviewing Lunacal's spa/massage and medspa booking pages alongside our own spec surfaced eleven concrete capabilities that competitors are increasingly using to pull conversion ahead of Mindbody and Vagaro. They aren't redesigns of the existing flow — they are additions that wrap the existing flow with **trust**, **triage**, **reach**, and **personalization**.

Each gap below is scored on three dimensions:

- **Conversion lift:** how directly does this move clients from "browsing" to "booked"?
- **Operational lift:** does it reduce work for staff (intake, no-shows, mis-bookings)?
- **Build cost:** how much engineering does it cost relative to MVP scope?

Items rated **High / High / Low** belong in MVP. Items rated **High / Medium / High** can defer to Phase 2 without harm. Recommendations are explicit at the end of each section.

---

## Gap analysis — what Velura has vs. what Lunacal is shipping

| # | Capability                                                  | In Doc 04 today              | Lunacal emphasis | Verdict                |
|---|-------------------------------------------------------------|------------------------------|------------------|------------------------|
| 1 | Branded booking page with story / proof / FAQs              | Tagline + logo only          | Core selling point | **Add to MVP**         |
| 2 | Pre-booking preference & triage questions (separate from intake) | Notes field only         | Differentiator   | **Add to MVP**         |
| 3 | Reference photo upload at booking time                      | Mentioned in CRM doc, not in flow | Yes         | **Add to MVP (lite)**  |
| 4 | Pre-session prep content (what to expect, parking, prep)    | Not specified                | Strong push      | **Add to MVP**         |
| 5 | Embedded booking widgets + per-service / per-staff direct links | Mentioned, not specced  | Core             | **Add to MVP**         |
| 6 | Round-robin assignment rules for "any available"            | Implicit                     | Explicit         | **Add to MVP**         |
| 7 | Companion / group booking (couples, bridal, family)         | Phase 2                      | Highlighted      | **Defer (P2)**         |
| 8 | Gift booking ("Book this for someone else")                 | Phase 2 (bundled w/ gift cards) | Yes           | **Defer (P2)**         |
| 9 | Save-for-later / favorited services (consumer wishlist)     | Not specified                | Light            | **Defer (P2)**         |
| 10| Multi-language + invitee-timezone slot display              | English only, biz-tz only    | Yes              | **Defer (P2)**         |
| 11| Hard contraindication gating before slot selection (medspa) | Intake forms post-booking    | Strong (medspa)  | **Add to MVP (medspa-only)** |

The seven items marked "Add to MVP" are specified in detail below. Items marked "Defer" are flagged at the end with a reason.

---

## 1. The branded booking page (the "shopfront")

### Why it matters

Lunacal's research finding is consistent with what GlossGenius proved years earlier: clients booking a service-business appointment are doing two jobs simultaneously — picking a slot **and** deciding whether to trust the business. Doc 04 currently delivers the first job and treats the second as an onboarding-level concern (logo, tagline). That's a structural under-build.

Three signals close the trust gap inside the booking flow itself: **proof** (testimonials, reviews, before/after), **personality** (provider bios, video intros, business story), and **clarity** (FAQs about parking, prep, what's included). All three are content the tenant already has elsewhere — Instagram captions, Google reviews, intake-form copy. The booking page should pull this content forward, not require new authoring.

### Schema additions

```sql
-- Tenant-level booking page content (the "About this business" panel)
CREATE TABLE booking_page_content (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hero_headline   TEXT,                          -- "A calm space for serious bodywork"
  hero_subhead    TEXT,                          -- one-line tagline
  story_markdown  TEXT,                          -- "About us" — markdown allowed
  intro_video_url TEXT,                          -- Loom or Cloudflare Stream
  faqs            JSONB NOT NULL DEFAULT '[]',   -- [{question, answer_markdown}]
  parking_info    TEXT,
  prep_default    TEXT,                          -- generic prep instructions
  policy_summary  TEXT,                          -- plain-English cancellation/late policy
  review_provider TEXT,                          -- 'google' | 'yelp' | 'manual' | null
  review_embed_id TEXT,                          -- Google Place ID, Yelp business ID, etc.
  is_published    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

-- Per-service marketing fields (extend existing services table)
ALTER TABLE services
  ADD COLUMN gallery_image_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN long_description_markdown TEXT,
  ADD COLUMN what_to_expect_markdown TEXT,
  ADD COLUMN prep_instructions_markdown TEXT,
  ADD COLUMN aftercare_markdown TEXT,
  ADD COLUMN highlight_review_id UUID REFERENCES reviews(id),
  ADD COLUMN price_disclosure TEXT;               -- e.g., "Starting at $129"

-- Per-staff marketing fields (extend existing staff/providers table)
ALTER TABLE providers
  ADD COLUMN tagline TEXT,                        -- "Deep tissue specialist, 12 years"
  ADD COLUMN long_bio_markdown TEXT,
  ADD COLUMN specialties TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN years_experience INT,
  ADD COLUMN intro_video_url TEXT,
  ADD COLUMN gallery_image_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN highlight_review_id UUID REFERENCES reviews(id);

-- Public-facing testimonials (curated by tenant from review pool)
CREATE TABLE booking_page_testimonials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_review_id UUID REFERENCES reviews(id),  -- if pulled from a real review
  display_name    TEXT NOT NULL,                 -- "Sarah C." (privacy-trimmed)
  quote_text      TEXT NOT NULL,
  service_id      UUID REFERENCES services(id),  -- attaches testimonial to a service
  staff_id        UUID REFERENCES providers(id), -- attaches to a provider
  is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
  display_order   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX booking_page_testimonials_tenant_idx
  ON booking_page_testimonials (tenant_id, is_featured, display_order);
```

### Flow changes

Step 1 of the public booking flow (service selection in `04-booking-flow.md`) gains an **About panel** above the service list. It is collapsed by default on mobile (one tap to expand) and expanded on desktop. The panel surfaces:

- Hero headline + subhead from `booking_page_content`
- 3 featured testimonials from `booking_page_testimonials`
- Optional video intro
- "View FAQ" link that opens an inline drawer

Service cards gain a **gallery thumbnail** when `services.gallery_image_urls` is populated. Tapping the card now opens a service detail sheet (not advancing immediately) with:

- Hero gallery (swipeable)
- Long description
- "What to expect" + prep instructions
- Highlight review pulled from review system
- Two CTAs: `[ Book this service ]` and `[ Back to services ]`

Step 2 (provider preference) gains a **provider profile sheet** with the same depth: long bio, specialties chips, years of experience, optional video intro, gallery, highlight review. Tapping a provider's avatar opens this sheet rather than instantly selecting them. Selection happens via the explicit `[ Book with [Name] ]` CTA inside the sheet.

The structural rule: **information is always one tap away, never required**. A client who knows what they want never sees the marketing layer.

### Content strategy & onboarding implications

This pattern collapses without good seed content. `02-onboarding-flow.md` should be updated to add a "Booking page content" step where the tenant is walked through:

1. Pasting their Google Business Profile URL → Velura imports up to 5 5-star reviews automatically
2. Picking a hero headline from 6 templates ("A calm space for serious bodywork", "Where every visit feels like an upgrade", etc.)
3. Optional: writing one paragraph about the business (skippable; defaults to "We're a [vertical] in [city] focused on [tagline]")
4. Optional: uploading 3+ gallery images per service (skip allowed; service shows a category illustration if none)

Reasonable defaults are critical. A tenant with zero content authored should still get a usable booking page — just one without proof yet. The progressive prompts to add content live in the dashboard with copy like: *"Three more reviews on your booking page can lift conversion 12%. Pull from Google?"*

### Engineering notes

- Image storage uses the same `client_files` infrastructure already specced in `mindbody-rebuild-master-spec.md` 5.2.4, with a new `folder = 'booking_page'` value and `visibility = 'public'`.
- Reviews are read-only on the public booking page until the review system from `06-review-system.md` (a separate document still to be authored) ships. In the interim, testimonials can be entered manually by the tenant.
- FAQ rendering uses simple markdown; no rich text editor needed.
- Performance: the booking page content blob is small (<10KB serialized). Cache for 5 minutes at the edge, invalidate on tenant write.

### Score

**Conversion: High** — proof at the booking surface is one of the most-cited conversion levers in service-business commerce.
**Operational: Medium** — fewer "what should I expect?" calls; fewer mis-bookings.
**Cost: Low–Medium** — schema is additive; UI is composition of existing primitives.

**Verdict: Ship in MVP.**

---

## 2. Pre-booking preference & triage questions

### Why it matters

Doc 04's flow puts a free-text "Notes for your provider" field in Step 4. Useful, but it has two failure modes: clients leave it empty (provider has no prep info), or they fill it with a paragraph the provider has to parse manually mid-shift. Lunacal's spa pages call out the missing middle: **structured preference questions** that the tenant defines per service, the client answers in 30 seconds, and the staff sees in their morning brief.

Critically, these are different from intake forms (`04-booking-flow.md` Flow H). Intake forms are post-booking, can be PDFs, and capture liability/medical history. Triage questions are pre-booking, micro-format (chips, sliders, short text), and capture **preferences** — pressure level, music or quiet, allergies, target areas, inspo references. The tenant should be able to author them once per service in 5 minutes.

For medspa specifically (covered in §11 below), some triage questions become **gating** — answering "yes, currently pregnant" must hide certain treatments rather than just inform the provider. That gating logic is medspa-specific and specced separately.

### Schema additions

```sql
-- Pre-booking question templates per service
CREATE TABLE service_booking_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  question_key    TEXT NOT NULL,                  -- machine-readable: 'pressure_level'
  question_label  TEXT NOT NULL,                  -- "What pressure do you prefer?"
  helper_text     TEXT,                           -- "Most clients pick medium"
  question_type   TEXT NOT NULL,                  -- enum below
  options         JSONB NOT NULL DEFAULT '[]',    -- for chips/select: [{value, label}]
  is_required     BOOLEAN NOT NULL DEFAULT FALSE,
  is_gating       BOOLEAN NOT NULL DEFAULT FALSE, -- medspa contraindication-style
  gating_rule     JSONB,                          -- { "if_value": "yes", "block_with": "Please call us..." }
  display_order   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_booking_questions_type_check
    CHECK (question_type IN ('chips_single', 'chips_multi', 'short_text', 'long_text', 'slider', 'yes_no', 'photo_upload')),
  UNIQUE (service_id, question_key)
);

-- Client answers, stored per appointment
CREATE TABLE appointment_booking_answers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES service_booking_questions(id),
  question_key_snapshot TEXT NOT NULL,            -- denorm for historical queries after question edit
  question_label_snapshot TEXT NOT NULL,
  answer_value    JSONB NOT NULL,                 -- string, array, number, or { "url": "..." } for photos
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, question_id)
);

CREATE INDEX appointment_booking_answers_appointment_idx
  ON appointment_booking_answers (appointment_id);
```

### Question type matrix

| Type           | Use case                                           | Mobile rendering                  |
|----------------|----------------------------------------------------|-----------------------------------|
| `chips_single` | "Pressure level" — pick one                        | Horizontal chip row               |
| `chips_multi`  | "Areas to focus on" — pick many                    | Horizontal wrap, multi-select     |
| `short_text`   | "What name do you want on the schedule?"           | Single-line input                 |
| `long_text`    | "Anything else we should know?"                    | Auto-growing textarea             |
| `slider`       | "Pressure (1=light, 10=very firm)"                 | Range slider with labels          |
| `yes_no`       | "Are you pregnant?" (medspa gating)                | Two large tap targets             |
| `photo_upload` | "Inspo photo" — for color, nail art, brows         | Tap-to-upload, max 3 images       |

### Flow placement

The triage step inserts as a **new Step 3a**, between time selection and add-ons:

```
Step 1 → Service
Step 2 → Provider preference
Step 3 → Time selection
Step 3a → Quick preferences (NEW — only if service has questions)   ← here
Step 4 → Add-ons / Enhancements
Step 5 → Details + payment
Step 6 → Confirmation
```

If the service has zero questions configured, the step is silently skipped — no empty screen, no friction. If all questions are optional, the step shows a `[ Skip for now ]` link below the primary CTA.

The mobile target is **45 seconds for a typical 4-question flow**. Each question fits on one screen; the client thumbs through. The questions are NOT collapsed into one long form — that destroys the perceived speed. Per-question advance with a thin progress bar at the top.

### Staff visibility

Answers appear in three places for staff:

1. **Today view brief** (per `03-dashboard-today-view.md`): a compact strip on each upcoming appointment card. Format: `Pressure: medium · Focus: shoulders, lower back · Music: quiet`.
2. **Appointment detail drawer**: full Q&A, with each question and answer rendered.
3. **Pre-shift digest** (5pm day-before): the existing staff digest (Doc 04 Step 5 jobs) gains a "Tomorrow's prep" section pulling each appointment's answers.

### Onboarding & defaults

The triage system collapses without good seed templates. `02-onboarding-flow.md` should be updated so that during service creation, the tenant is offered one or more **starter question packs** matched to the service category:

- **Massage:** pressure level, focus areas, music preference, allergy alert
- **Hair color:** target shade (chips), inspo photos, hair history
- **Nail:** preferred shape (chips), nail art (yes/no + inspo), removal needed
- **Facial:** skin type, sensitivities (chips_multi), recent products
- **Medspa consult:** primary concern, prior treatments, pregnancy/breastfeeding (gating)

The tenant clicks "Use template" and edits in place. Authoring time drops to under 2 minutes per service.

### Score

**Conversion: Medium** — does not directly drive bookings, but reduces drop-off on services where the client worries the provider "won't get it right."
**Operational: High** — the morning-of prep call is a real time sink for serious tenants. Structured answers eliminate it.
**Cost: Medium** — schema is straightforward; question rendering reuses primitives; gating logic is the only complex piece (medspa-only).

**Verdict: Ship in MVP, with starter question packs to make adoption painless.**

---

## 3. Reference photo upload at booking time

### Why it matters

For nail art, hair color, brow services, makeup, and medspa consultations, the inspo photo is the *single most useful* piece of pre-appointment context. Doc 04 doesn't explicitly include it in the booking flow. The CRM document (`mindbody-rebuild-master-spec.md` 5.2.4) does support reference photo storage on the client record — but only via the staff app or via intake forms, both of which are after the fact.

Pulling photo upload into booking time requires no new infrastructure beyond what's already built: it's just exposing the `photo_upload` question type from §2 to an existing storage path. We surface it here as its own deliverable because the *workflow integration* — appointment record automatically linked to the photo, photo viewable from the appointment detail drawer — is what makes it useful, and that's an explicit choice rather than a side effect.

### Schema additions

None beyond what §2 specifies (`question_type = 'photo_upload'`). The answer is stored as `{ "urls": ["https://...", "https://..."] }` in `appointment_booking_answers.answer_value`. Files land in the existing `client_files` bucket with `folder = 'References'` and `appointment_id` set, mirroring the `mindbody-rebuild-master-spec.md` pattern.

### UX additions

The `photo_upload` question type renders as:

- 3 dotted-line thumbnail slots (3-photo max for performance and UI sanity)
- Tap any slot → camera roll picker on mobile, file picker on desktop
- Auto-resize on upload to 1920px max long edge
- EXIF stripped on upload (privacy)
- Each photo gets an optional caption field below it

### Score

**Conversion: Low** — does not move the booking decision.
**Operational: High (for relevant services)** — eliminates "send me your inspo photo" texts before every appointment.
**Cost: Low** — composes existing pieces.

**Verdict: Ship in MVP as part of §2's question system.**

---

## 4. Pre-session prep & post-session aftercare content

### Why it matters

The booking confirmation in Doc 04 Step 5 ends the client experience. Lunacal's spa pages call out the gap: most service businesses have prep instructions ("arrive 10 min early", "no caffeine 2 hours before", "remove jewelry") and aftercare instructions ("hydrate", "no hot showers for 24 hours") that they currently text manually or print on a card. Automating these is high-leverage: it sets up a great session (prep) and great recovery + retention (aftercare).

This is content the tenant authors once per service. The system delivers it on a schedule.

### Schema additions

The fields already exist in §1 (`services.what_to_expect_markdown`, `services.prep_instructions_markdown`, `services.aftercare_markdown`). New piece is the **delivery scheduling**:

```sql
-- Auto-delivered content rules per service
CREATE TABLE service_content_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  delivery_type   TEXT NOT NULL,                  -- 'prep' | 'aftercare' | 'reminder_with_content'
  channel         TEXT NOT NULL,                  -- 'sms' | 'email' | 'both'
  schedule_offset_minutes INT NOT NULL,           -- negative = before appt, positive = after
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  template_override_markdown TEXT,                -- if null, use service's prep/aftercare field
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id, delivery_type, channel)
);
```

### Default delivery schedule

When a service is created or has prep/aftercare authored, three deliveries are created with sensible defaults — the tenant can edit or disable any of them:

| Delivery        | Default offset             | Default channel | Notes                                  |
|-----------------|----------------------------|-----------------|----------------------------------------|
| Prep            | -24 hours                  | SMS + email     | Combined with the existing 24h reminder |
| Day-of prep     | -3 hours                   | SMS             | Optional, disabled by default          |
| Aftercare       | +30 minutes after end time | SMS + email     | Triggers on appointment.completed event |

The "prep merged with reminder" pattern is intentional — sending two SMS messages 24 hours apart annoys clients. The 24h reminder template gains a conditional content slot: if the appointment's service has prep content, the reminder SMS appends it inline rather than firing as a separate message.

### Confirmation screen change

Doc 04 Step 5's confirmation screen gains a small section **between** the appointment summary and the "Add to calendar" buttons:

```
─────────────────────────────────────
 Before your visit
 • Arrive 10 minutes early to settle in
 • Skip caffeine 2 hours before
 • Wear loose, comfortable clothing
─────────────────────────────────────
```

Tenants who have authored zero prep content see no such section — no awkward empty state.

### Score

**Conversion: Medium** — does not affect first booking, but tightens the experience and improves retention.
**Operational: High** — eliminates manual texts before/after every appointment.
**Cost: Low** — schema is small; rendering reuses existing notification templates and BullMQ scheduling.

**Verdict: Ship in MVP. Default schedules; tenant edits later.**

---

## 5. Embedded booking widgets & per-service / per-staff direct links

### Why it matters

Lunacal's data point: **78% reported higher conversions when embedded booking links were used inside Instagram bios, WhatsApp, or Google Maps listings.** That is consistent with what every service-business owner observes in practice — the highest-converting booking flow is the one with the fewest clicks from the social post that prompted the visit.

Doc 04 specifies a single public URL: `book.{tenant}.velura.com`. That works for a generic Instagram bio link, but it forces the client through every step from the top. We need three additional surface types:

1. **Direct service link** — `book.{tenant}.velura.com/s/{service-slug}` — lands on Step 2 with the service preselected.
2. **Direct staff link** — `book.{tenant}.velura.com/p/{staff-slug}` — lands on Step 1 filtered to that staff's services.
3. **Direct service+staff link** — `book.{tenant}.velura.com/s/{service-slug}/p/{staff-slug}` — lands on Step 3 with both preselected.
4. **Embeddable widget** — `<iframe>` and JS-bundle versions for tenants with their own websites.

### Schema additions

```sql
-- Add slug fields for routing
ALTER TABLE services
  ADD COLUMN public_slug TEXT,
  ADD CONSTRAINT services_slug_per_tenant UNIQUE (tenant_id, public_slug);

ALTER TABLE providers
  ADD COLUMN public_slug TEXT,
  ADD CONSTRAINT providers_slug_per_tenant UNIQUE (tenant_id, public_slug);

-- Trackable booking link campaigns (UTM-style attribution)
CREATE TABLE booking_link_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_slug   TEXT NOT NULL,                  -- "instagram-bio-2026q2"
  display_label   TEXT NOT NULL,                  -- "Instagram bio"
  service_id      UUID REFERENCES services(id),
  provider_id     UUID REFERENCES providers(id),
  qr_image_path   TEXT,                           -- generated PNG of QR
  click_count     INT NOT NULL DEFAULT 0,
  booking_count   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, campaign_slug)
);

CREATE INDEX booking_link_campaigns_tenant_idx
  ON booking_link_campaigns (tenant_id, created_at DESC);
```

The booking page reads `?c={campaign_slug}` from the URL on landing, increments `click_count`, and stores it on the resulting appointment as a referral source. This is essentially UTM tracking with a built-in dashboard, removing the need for tenants to set up Google Analytics for a basic answer to "where are my bookings coming from?"

### Embed widget

The widget ships as both formats:

- **iframe embed:** `<iframe src="https://book.{tenant}.velura.com/embed?service={slug}" height="800" width="100%" />` — works on every CMS without JS.
- **JS bundle:** `<script src="https://book.velura.com/embed.js" data-tenant="..." data-service="..."></script>` — opens a styled modal over the parent page; better UX, requires JS.

Both versions use the same booking flow as the public URL, with one CSS variable difference (no max-width container; styled to inherit the parent's body width). All cross-origin postMessage events for analytics (`booking_started`, `booking_completed`, `booking_value`) fire so the tenant's site can attribute revenue.

### Settings UI

A new page **Settings → Booking Links** exposes:

- The base public URL with copy-to-clipboard
- A list of services and staff with auto-generated direct links + QR codes
- A "Create campaign link" button that generates a tracked URL with custom label
- Code snippets for the iframe and JS embed
- Per-campaign performance summary (clicks, bookings, revenue, conversion rate)

This page is one of the highest-leverage surfaces in the entire admin app — a tenant who copies their Instagram bio link and pastes the new tracked one will start producing data within 24 hours.

### Score

**Conversion: High** — direct links measurably outperform funnel-top URLs across every service-business booking platform that has published the data.
**Operational: Medium** — new attribution data informs every other product decision.
**Cost: Medium** — slug routing is straightforward; the QR/campaign system is medium-effort; the embed widget needs careful CSP and CORS handling.

**Verdict: Ship in MVP. The slug-based URLs are essentially free; the campaign tracking + embed widget can be a fast-follow if MVP timeline is tight.**

---

## 6. Round-robin & load-balancing for "Any available"

### Why it matters

Doc 04 Step 2 offers "Any available provider" as the default option but doesn't specify how that selection is made. The naive implementation — pick the staff with the earliest open slot — has well-known failure modes:

- One staff member becomes the "default" and gets overworked; others sit idle.
- New clients always land on the same provider, killing the team's revenue distribution.
- A high-rated provider books out for weeks while a new hire has empty days.

Lunacal's spa and physiotherapy pages call this out explicitly: round-robin distribution preserves morale and revenue parity. We need the assignment rule to be a **two-tier setting** (per the architecture in `04-booking-flow.md`), with sensible defaults.

### Schema additions

```sql
-- Assignment strategy is a two-tier setting; values stored on tenant_settings + provider_settings
-- (existing settings infrastructure from 04-booking-flow.md)

-- New normalized values for the 'any_available_strategy' setting:
--   'first_available'      — earliest slot wins (current implicit behavior)
--   'round_robin'          — strict rotation among qualified staff
--   'load_balanced'        — staff with fewest hours booked this week wins
--   'priority_weighted'    — uses providers.priority_weight (already exists per booking_system_build_spec)
--   'preferred_first'      — returning clients see their previous provider; new clients use round_robin

-- Track assignment history for round-robin fairness
CREATE TABLE provider_assignment_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  provider_id     UUID NOT NULL REFERENCES providers(id),
  service_id      UUID NOT NULL REFERENCES services(id),
  strategy_used   TEXT NOT NULL,
  candidate_provider_ids UUID[] NOT NULL,         -- who was eligible at decision time
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX provider_assignment_log_tenant_idx
  ON provider_assignment_log (tenant_id, created_at DESC);
CREATE INDEX provider_assignment_log_provider_idx
  ON provider_assignment_log (provider_id, created_at DESC);
```

### Default & UX

Default strategy: **`preferred_first`**. The reasoning: returning clients almost always have a provider preference even when they don't say so explicitly; routing them to a new face is a churn risk. New clients get round-robin so the team's load stays even.

In Settings → Booking → Assignment, the tenant sees five options as a radio group with one-line explanations and a "Recommended" badge on `preferred_first`. The setting can be overridden per service (e.g., "consult appointments use round_robin to share lead-gen evenly").

### Score

**Conversion: Low** — clients don't see this happen; it's invisible.
**Operational: High** — solves a real, recurring complaint about every booking platform from staff teams.
**Cost: Low** — the assignment is a single function call with a strategy parameter; the assignment log is a single insert.

**Verdict: Ship in MVP. The default of `preferred_first` is the single-most-common request from real teams.**

---

## 7. Hard contraindication gating (medspa-only)

### Why it matters

Doc 04 places intake forms after booking confirmation (Flow H). For most verticals that's correct: the form captures liability info, but the appointment was already valid. For **medspa**, that ordering is dangerous. A pregnant client booking laser hair removal needs to know *before* picking a slot that the service isn't available for them; learning it at the intake-form stage means a wasted slot, an awkward call, and a fee dispute.

This pattern is medspa-specific. We isolate it here so that the rest of the platform isn't burdened with contraindication logic it doesn't need.

### Schema additions

The `service_booking_questions` table from §2 already supports gating via `is_gating = true` and `gating_rule`. Medspa services should use this pattern. Example:

```json
{
  "if_value": "yes",
  "block_with": "Some treatments aren't safe during pregnancy. Please call us at (555) 123-4567 — we'd love to help find a treatment that works.",
  "block_action": "show_contact_card"
}
```

When a gating question is answered with the blocking value, the booking flow does NOT advance to the time selection step. Instead, the client sees a **redirect card** with the configured copy plus an optional `[ Call ]` button (using `tel:` link) and `[ Send a message ]` button (opens the contact form). The slot hold is not initiated; no appointment record is created.

### Onboarding for medspa tenants

Medspa onboarding (per `02-onboarding-flow.md`'s vertical profile from `mindbody-rebuild-master-spec.md` 2.3) gains a starter question pack with hard-coded gating questions:

- "Are you currently pregnant or breastfeeding?" → blocks for laser, certain peels, certain injectables
- "Have you taken Accutane in the last 6 months?" → blocks for laser, microneedling, certain peels
- "Are you on blood thinners?" → blocks for filler, microneedling
- "Do you have an active cold sore?" → blocks for lip filler

These are **defaults the tenant must explicitly enable per service** — the platform does not assume which services have which contraindications. The tenant's medical lead authorizes the gating list once, and it propagates to all medspa services that opt in.

### Score

**Conversion: Negative on bad-fit clients (correctly)** — the booking is rejected before slot is held, freeing it for a different client.
**Operational: Very High (for medspa)** — a single avoided booking-then-cancel cycle pays for the feature.
**Cost: Medium** — the rendering is straightforward; the policy authoring needs care to be defensible.

**Verdict: Ship in MVP for medspa vertical only. Other verticals can use the same `is_gating` mechanic for soft routing if they want, but the contraindication content library is medspa-scoped.**

---

## Items deferred to Phase 2

These are mentioned in Lunacal's pages and would add value, but they don't merit MVP build-out for the reasons given.

### 7. Companion / group booking (couples, bridal, family)

Bridal parties and couples massage are real revenue. The schema in `04-booking-flow.md` already supports the multi-resource shape (`BookingItem` mentioned in §6 of doc 04). The blocking issue is UX: group booking requires multi-client capture, multi-staff coordination, and a different confirmation flow per-client. Estimated 2–3 weeks once classes/group bookings ship in P2 (`09-dev-handoff.md` Phase 2). **Defer.**

### 8. Gift booking ("Book this for someone else")

Closely tied to gift cards (P2-4 in `09-dev-handoff.md`). The flow would gate on the recipient's contact info and create a redeemable code rather than a confirmed appointment. Useful but small TAM impact at MVP. **Defer to P2 alongside gift cards.**

### 9. Save-for-later / wishlist

Useful for high-consideration services (medspa packages, hair extensions) where the client researches for days. Requires a returning-client identity model that's lighter than full account creation. Real, but not on the critical path. **Defer to Phase 2.**

### 10. Multi-language + invitee-timezone slot display

Doc 04 explicitly defers Spanish localization to P2 (open question 8.1.10). Timezone-shifted display is reasonable for a future build when the platform serves customers traveling across time zones (e.g., destination spas, virtual consults). For local-business MVP, business-timezone display is correct. **Defer to Phase 2.**

---

## Updated MVP build order

Insert these items into `09-dev-handoff.md` Epic 4 (Booking) as new sub-epics:

| Sub-epic   | Title                                                | Effort | Depends on             |
|------------|------------------------------------------------------|--------|------------------------|
| 4-E1       | Branded booking page content (§1)                    | 5d     | Epic 1 design system   |
| 4-E2       | Pre-booking triage questions (§2)                    | 4d     | Epic 4 core flow       |
| 4-E3       | Reference photo upload (§3)                          | 1d     | 4-E2                   |
| 4-E4       | Prep & aftercare content delivery (§4)               | 3d     | Epic 4 core notifications |
| 4-E5       | Direct booking links + embed widget (§5)             | 4d     | Epic 4 core flow       |
| 4-E6       | Round-robin assignment strategies (§6)               | 2d     | Availability engine (Epic 3) |
| 4-E7       | Medspa gating questions (§7, vertical-scoped)        | 2d     | 4-E2                   |

Total added effort: **~21 working days**, or about 4 weeks for one frontend + one backend running in parallel. None of these items block the existing Epic 4 deliverables; they layer on top.

---

## Updates needed to existing docs

| Doc                              | Update                                                         |
|----------------------------------|----------------------------------------------------------------|
| `02-onboarding-flow.md`          | Add booking-page content step, starter question packs per vertical, slug field for the public URL, link campaign primer |
| `04-booking-flow.md`             | Insert Step 3a (triage questions) into Flows A/B/C; update confirmation screen with prep section; add reference to direct-link routing |
| `09-dev-handoff.md`              | Insert sub-epics 4-E1 through 4-E7 into Epic 4                |
| `mindbody-rebuild-master-spec.md`| Cross-reference the booking-page content + question schemas as additions to the Catalog domain |
| `006-booking-design-refresh.md`  | (New, see companion doc) — visual treatment for the new surfaces |
| `06-review-system.md`            | (New, dependency for §1 testimonials) — design the review capture system referenced in `04-booking-flow.md` |

---

## Open questions

1. **Should triage answers be visible to subcontractor staff on shared client records?** Default proposal: yes, when answers are tied to an appointment they're working. Subcontractor isolation rules in `mindbody-rebuild-master-spec.md` 5.4.1 should be cross-checked.
2. **Where do `prep_instructions_markdown` defaults come from per vertical?** Proposal: ship a content library matching the starter question packs in §2. Authoring effort is one-time and lives in the seed migration.
3. **For the embed widget, do we ship a Shopify / Squarespace / WordPress plugin in MVP, or just the iframe + JS bundle?** Proposal: iframe + JS bundle only at MVP; CMS-specific plugins are P2 unless a launch partner requests them.
4. **Privacy review for booking-page testimonials** — when pulling a Google review, we display name and quote. Should we trim the surname automatically, or leave that to the tenant? Proposal: trim by default, tenant can opt in to full name per testimonial.

---

## Reviewed by

- [ ] Product owner — reviewed scope, scoring, deferrals
- [ ] Design lead — reviewed flow placement of new steps, ensures fit with `01-design-system.md`
- [ ] Engineering tech lead — reviewed schema additions, build order, cost estimates
- [ ] Operations — confirmed staff visibility of triage answers fits the morning-brief workflow
- [ ] Legal/compliance — reviewed medspa gating copy and testimonial display defaults

---

*End of spec. Companion document `006-booking-design-refresh.md` covers the visual treatment for these surfaces, including a critique of the current LUXE Wellness booking mockup and concrete design upgrades.*
