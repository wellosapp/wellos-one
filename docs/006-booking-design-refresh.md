# Booking Design Refresh — Visual & UX Upgrades

**Project:** Velura (Mindbody / Vagaro / GlossGenius Rebuild)
**Document:** 006 — Booking Design Refresh
**Status:** Draft
**Version:** 1.0
**Date:** April 25, 2026
**Author:** Claude (in conversation with Johnathan)
**Companion docs:** `01-design-system.md`, `04-booking-flow.md`, `05-booking-enhancements.md`, `10-design-system-buildout.md`
**Reference artifact:** "LUXE Wellness — A Seamless Booking Experience" (5-screen mockup, attached)

---

## How to read this document

The current LUXE Wellness mockup is good. It is mobile-first, the type hierarchy is clear, the primary CTAs are unmistakable, and the tone matches `01-design-system.md`'s "warm professional" target. Nothing in this document throws that work away.

What this document does is layer in the surfaces required by `05-booking-enhancements.md` — branded content, triage questions, prep info, direct links — and mark up specific moments in the existing five screens where small design changes will measurably improve trust, scannability, and conversion. Every recommendation is paired with a rationale and references the existing design tokens; no new colors or fonts are introduced.

The document is structured as:

1. **Critique of current mockup** — what's working, what's missing, what's structurally weak.
2. **Refresh plan, screen by screen** — the same five screens with targeted upgrades plus three new screens for the triage/prep flow.
3. **New components** — reusable primitives required by the refresh.
4. **Brand & content guidelines** — image, copy, and photography standards.
5. **Accessibility & motion** — final layer of polish.

Brand rationale: the LUXE mockup uses a deep teal/forest accent and a warm cream background. The official `01-design-system.md` accent is `--accent: #3D7A5E` (warm sage). For this document I assume the LUXE design tokens are an alternative theme on the same component system, which is the architecture `10-design-system-buildout.md` already supports via CSS custom properties. All recommendations work for both palettes.

---

## 1. Critique of the current mockup

### What's working

**Hierarchy and rhythm.** Each screen has one clear primary CTA at the bottom thumb zone. Each screen leads with a numbered step indicator, which orients the user without visible progress bars. The numbered circles + step label + helper subline pattern is doing real work — it converts a 5-step flow into one that *feels* short.

**Brand voice.** The headers ("Designed to delight. Built to convert.") and per-step microcopy ("Add-ons that make it even better", "Fast, secure checkout") match the `01-design-system.md` direction: warm framing, precise facts. The "You're all set!" celebratory script font is restrained — used once, on the success state, where it earns its place.

**Photography.** Service cards use full-width imagery with consistent crops and warm color grading. This is correct for the wellness vertical. The provider avatar in Step 2 is small but high-quality.

**Touch targets.** All primary CTAs and chips are clearly above the 44px minimum. Slot-time chips on Step 2 are well-spaced.

### What's structurally missing

These map directly to the gaps identified in `05-booking-enhancements.md`:

1. **No trust block before service selection.** A first-time visitor sees five service cards and a back button. There is no social proof, no business intro, no review snippet, no FAQ link. The mockup assumes the booking decision is already made; in reality, 60–70% of public-link clicks include at least some "should I book here?" deliberation.

2. **No service detail.** Tapping a service card advances directly to time selection. The client never sees a longer description, sample photos of the room, the provider gallery, or a representative review. The card has a one-line description, which is the entire content surface. For services priced over ~$100, this is too thin.

3. **No provider context.** Step 2 shows a single avatar + name + service summary, with a small "Choose specific provider" link at the bottom. There's no path to read about the provider before committing — only after. For wellness services where rapport matters, this inverts the trust-building order.

4. **No pre-booking preferences.** Step 3 (Add-ons) is the only "personalization" step before payment. It asks the client to upsell themselves before asking what kind of session they actually want. Pressure level, focus areas, music preference — all of this is missing from the visible flow and ends up in the "Notes for your provider" field if at all.

5. **No prep instructions.** The confirmation screen jumps directly from "You're all set!" to "Add to calendar / Get directions / Need to reschedule". A first-time client does not know: how early to arrive, where to park, what to wear, what to bring. This is exactly the gap §4 of `05-booking-enhancements.md` addresses.

6. **No share / referral / save action.** Confirmation is a closed loop. There's no "share with a friend", no "add to wallet" (Apple/Google Pay), no "save your favorite services for next time".

### What's structurally weak (but not broken)

7. **The "Choose specific provider" affordance is too hidden.** It sits as a small pill at the bottom of Step 2 below the slot grid. Many users will not see it. The provider preference should be a clearly toggleable choice at the top of Step 2 — even if "Best Available Provider" remains the default — so the user understands they have a choice.

8. **The summary panel in Step 4 doesn't show the cancellation policy timestamp.** `04-booking-flow.md` is explicit: every booking confirmation must show *exactly when* the cancellation window closes and *exactly what* fee applies. The mockup's Step 4 "Booking Summary" shows price and duration but no policy line. This is a copy + layout fix.

9. **The membership upsell on Step 5 is good but small.** A returning customer who books 6+ times a year is the highest-value cohort in the entire business. The "Explore Memberships →" link is a passing aside. A more present surface — without crossing into pushy — converts measurably more.

10. **Add-on selection has no inline duration warning.** Step 3 shows total time and total price at the bottom, but if an add-on extends the appointment past the originally selected slot's available window, the slot needs to change. The current mockup has no visual signal for this case. `05-booking-enhancements.md` §2 "Watch-outs" calls this out: do not silently shift the user's time.

---

## 2. Refresh plan — screen by screen

### Screen 1 — CHOOSE SERVICE (refreshed)

**Current state:** Header, category chip rail, 4 visible service cards.

**Changes:**

- **Add a collapsible About panel above the category rail.** When collapsed (default on mobile), it occupies one row: business name + 5-star summary (e.g., `★★★★★ 4.9 · 247 reviews`) + a chevron. Tapping expands it to show: hero image / video, one-paragraph story, 3 testimonial cards in a horizontal scroll, parking/access info, and a `[ View FAQ ]` link.
- **Swap the category chip rail to icon-led chips** on tablet+. Mobile keeps the text-only chips for thumb width but adds a small leading icon per category (a leaf for facials, a steam-curl for body, etc.). These come from Lucide and require no custom illustration work.
- **Add a "Most booked" badge** on the highest-volume service of the previous 30 days. One badge per screen, no more — too many rankings nullify them. The badge uses `--accent-pale` background with `--accent` text, matching the design system's Badge primitive.
- **Tapping a service card now opens a service detail sheet** (full-screen on mobile, side-sheet on desktop), not the time selection step. Inside the sheet:
  - Swipeable hero gallery (3–6 images)
  - Long description in body-lg
  - "What to expect" — a list of 3–5 bullets pulled from `services.what_to_expect_markdown`
  - Highlighted review card with star rating + first name + service-specific quote
  - Two CTAs: primary `[ Book this service ]`, secondary `[ Back ]`
- **Add a small "Have a referral code?" link** at the very bottom of the screen, below "View all services". Hidden in plain sight; a self-reactivation surface for repeat buyers and an incentive lever for the marketing team.

**Tokens used:** `--surface-2` for the collapsed About panel background; `--accent-pale` for the "Most booked" badge; `--shadow-sm` on the service detail sheet.

**Copy adjustments:**

- Header subtitle gains a humanizing line: "Book in under a minute. Cancel anytime up to 24 hours before."
- Each category chip uses sentence case ("Facials", "Massage") not title-case; matches the warm-professional voice rule.

---

### Screen 2 — PICK A TIME (refreshed)

**Current state:** Service summary card, day strip, "Earliest available" hero slot, "Other times" grid, "Choose specific provider" pill.

**Changes:**

- **Move the provider toggle to the top of the screen, not the bottom.** Place it directly under the service summary as a two-button segmented control: `[ Best available ]` (default) vs `[ Choose provider ]`. This makes the choice explicit without forcing a second screen.
- **When "Choose provider" is selected**, the day strip and slot grid are temporarily hidden and a horizontal-scroll provider gallery appears: avatar (60×60), name, tagline (one line), and a small "View profile" link. Tapping a name selects the provider; tapping "View profile" opens a provider detail sheet (mirroring the service detail sheet) with full bio, gallery, and reviews. Selection inside that sheet returns to the slot grid filtered to that provider.
- **Add a timezone label** above the day strip in `--ink-soft` body-sm: "Times shown in [Pacific Time / Los Angeles]". `04-booking-flow.md` requires this; the current mockup omits it.
- **The "Earliest available" hero slot is good** — keep it. Add a small caption beneath the time: "Recommended — fits your provider's schedule and yours." This makes the recommendation feel intentional rather than algorithmic.
- **Add a slot-hold timer** that appears the moment the user taps any slot: a thin ribbon at the top of the screen reading "Holding this time for you — 6:42 remaining". Uses `--amber-pale` background. This is from `04-booking-flow.md` and the mockup currently has no representation of it.

**Tokens used:** `--accent` for the segmented control's active state; `--amber-pale` for the slot-hold ribbon; `--surface-3` for the segmented control's inactive border.

---

### Screen 2.5 — QUICK PREFERENCES (NEW)

This screen is new per `05-booking-enhancements.md` §2. It only renders when the selected service has questions configured.

**Layout:**

- Top: thin progress bar segmented to show 1-of-N questions
- Centered content: question label in display-md, helper text below in body-sm `--ink-soft`
- Question rendering varies by `question_type`:
  - **chips_single / chips_multi:** 2–4 large chips per row, 56px tall, `--surface-2` default state and `--accent-pale` selected state with `--accent` border
  - **slider:** range from 1–10 with anchored labels (e.g., "Light" at 1, "Firm" at 10) and a value bubble that follows the thumb
  - **photo_upload:** 3 dotted-line slots, 100×100, with a camera icon in the empty state
  - **short_text / long_text:** standard input/textarea primitive from the design system
  - **yes_no:** two equal-width buttons, `--green-pale` for "Yes" and `--red-pale` for "No" only when the no answer is the safe default; otherwise neutral
- Bottom: primary `[ Continue ]` (wide, `--accent` filled) and secondary `[ Skip ]` (text-only `--ink-soft`) — Skip is hidden when the question is required
- The progress bar increments as the client answers

**Copy:** label and helper come from `service_booking_questions.question_label` and `helper_text`. No additional chrome copy on the screen — the design's restraint is the message.

**Motion:** when advancing to the next question, the current question's content slides left -200ms, easing-out; the next question slides in from the right -200ms, easing-in. No bounce. This is a respectful pace, not a gamified one.

**Skipping all questions:** the entire step renders nothing if the service has no questions. The client never sees an empty screen.

---

### Screen 3 — ENHANCE YOUR EXPERIENCE (refreshed)

**Current state:** Service summary, three add-on cards with checkboxes, total at bottom, Continue CTA.

**Changes:**

- **Add a duration-shift warning** that appears inline when an add-on extends the appointment past the originally selected slot. Format: a small `--amber-pale` banner above the total reading "Adding LED Therapy extends your time to 4:15 PM. Want to keep your 9:00 AM start, or pick a new time?" with a `[ Pick new time ]` button. This addresses critique #10 above.
- **Replace checkboxes with toggle-style cards.** The entire add-on card is tappable; tapping toggles a check icon in the top-right corner with `--accent-pale` background fill on selection. This is the same pattern used on the new triage chip questions in Screen 2.5 — visual consistency reinforces the message that personalization is one connected motion, not a series of distinct forms.
- **Group add-ons by category if more than 4 exist.** Most spas have 6+ add-ons; the current 3-card cap is appropriate for most flows but flexible. Show 3 prominent "Recommended" add-ons by default, with a `[ View all enhancements ]` expander beneath. Recommendations come from a simple rule: most-attached add-ons for this service over the last 30 days at this tenant.
- **Improve the total panel.** Currently shows just "Total — 105 min · $174". Refresh:
  ```
  Your visit
  Signature Glow Facial    90 min   $129
  + LED Light Therapy      15 min    $25
  + Lymphatic Drainage     +0 min    $20
  ─────────────────────────────────────
  105 min                          $174
  ```
  This itemization removes ambiguity about what's being added and prepares the client for the price they'll see in Step 4.

**Tokens used:** `--amber-pale` for duration-shift warning; `--accent-pale` for selected add-on card fill; `--surface-3` divider line in the total panel.

---

### Screen 4 — YOUR DETAILS & PAYMENT (refreshed)

**Current state:** Booking summary card, contact form (name/email/phone), payment selector with Apple Pay default, primary CTA.

**Changes:**

- **Add the cancellation policy line to the booking summary.** Below the price line, in body-sm `--ink-soft`: "Free to cancel until Wed, May 16 at 9:00 AM. After that, $50 cancellation fee applies." This is non-optional per `04-booking-flow.md`.
- **Add a small "Preferred contact for reminders" radio row** below the phone field: `( ) SMS  ( ) Email  ( ) Both`. Defaults to Both. Lunacal calls out that some clients dislike SMS reminders; respecting the preference is a small touch with disproportionate retention impact. Note: the SMS-opt-in checkbox required by 10DLC compliance still appears separately, lower in the form.
- **Add an "Anything we should know?" line** above payment, with a small `[ + Add a note ]` link that expands to a short textarea (max 500 chars). Distinct from triage questions: this is the catch-all field, intentionally optional.
- **The membership upsell card** (currently on Screen 5) should appear here too as a quiet inline option *if* the booking total is over the membership break-even threshold. Format: a small `--accent-pale` card with copy "Save $39 today by joining the membership ($69/mo, 20% off all services). [ Add membership ]". Tapping it adds the membership SKU to the cart and recalculates the total. If the user doesn't tap, nothing changes — no nag.
- **Show last-4 of saved card** if the client is returning and has a card on file. Format: "Card ending 4242 will be charged for any cancellation fees." Currently the mockup is single-state for new clients; the returning-client variant must surface this clearly.

**Copy refinements:**

- Replace "Your information" with "Your details" — matches the step header.
- Replace "Add card" placeholder text with "Use a different card" when a saved card is present.
- The pay button changes contextually: `Book & Pay $50` for deposit, `Save card & Book` for card-on-file with no deposit, `Book appointment` if neither (degraded mode without payments).

---

### Screen 5 — YOU'RE ALL SET (refreshed)

**Current state:** Hero check, scripted celebration, appointment card, three actions, membership upsell pill.

**Changes:**

- **Add a "Before your visit" prep panel** between the appointment card and the three action rows. Format:
  ```
  Before your visit
  • Arrive 10 minutes early
  • Skip caffeine 2 hours before
  • Free parking on Main Street
  ```
  Pulled from `services.prep_instructions_markdown` (rendered as a 3-bullet list maximum on this screen — full content arrives in the prep notification). Hidden entirely if the service has no prep authored. This addresses critique #5 above.
- **Add an "Add to Apple Wallet / Google Wallet" action** to the action stack. Renders only on supported devices (iOS Safari, Android Chrome). The pass includes appointment time, location, provider name, and a barcode for quick check-in. This single feature meaningfully reduces no-shows.
- **Add a "Share with a friend" action** with a single-tap share sheet that includes the tenant's direct booking link (per `05-booking-enhancements.md` §5). Default copy: "I just booked a [Service] at [Business]. They have great availability — [link]". The tenant can customize this in settings.
- **The membership upsell** keeps its placement but the copy strengthens slightly. Current: "Want to save on your next visit? Join our Membership and save up to 20%." Proposed: "Today's visit + a membership = your fifth visit free. [ See how it works ]" — more concrete, more visible math, less generic. The exact framing should A/B test.
- **Add a `Booking confirmation #VEL-A4F2C3 — keep this number for your records` line** at the bottom in caption style. Provides reassurance and makes phone-based service requests easier.

**Tokens used:** `--surface-2` for the prep panel background; `--accent-pale` for the membership upsell card; `--green` and `--green-pale` for the success check.

---

## 3. New components required

The refresh introduces three components that don't exist in `10-design-system-buildout.md` yet. Each is small enough to ship inside the booking refresh sub-epic without spilling into a separate design-system release.

### `<TrustPanel>` — collapsible business intro

Renders the booking-page content from `booking_page_content` (per `05-booking-enhancements.md` §1).

```tsx
<TrustPanel
  businessName="LUXE Wellness"
  reviewSummary={{ rating: 4.9, count: 247 }}
  storyMarkdown={...}
  testimonials={[...]}
  faqUrl="/faq"
  defaultCollapsed={true}
/>
```

**States:** collapsed (one-row summary), expanded (full content), no-content fallback (just business name + tagline, no rating block).

**Variants:** `density="compact"` (Screen 1 default), `density="hero"` (used on a future booking page header / standalone marketing page).

### `<ProgressiveQuestionForm>` — triage flow runner

Drives Screen 2.5 from a question array.

```tsx
<ProgressiveQuestionForm
  questions={serviceQuestions}
  onComplete={(answers) => advanceFlow(answers)}
  onSkipAll={() => advanceFlow({})}
  allowSkipAll={true}
/>
```

Internally manages: current index, answer state, progress bar, slide animation, gating-rule checks. Renders the appropriate primitive per `question_type`. Emits a single `onComplete` callback with the full answer map.

### `<PrepInstructions>` — bullet panel

Tiny but used in 4+ surfaces (confirmation screen, reminder email, magic-link reschedule view, calendar `.ics` description).

```tsx
<PrepInstructions
  bullets={["Arrive 10 minutes early", "Skip caffeine 2 hours before", ...]}
  variant="confirmation" // or "reminder", "compact"
/>
```

**Why a component, not just markdown:** the bullets need a consistent visual treatment across surfaces, and the `compact` variant truncates to 3 bullets with "+ 2 more" overflow handling.

---

## 4. Brand & content guidelines

### Photography

The LUXE mockup shows a photography style worth codifying:

- **Treatment photos:** product/service in soft natural light, neutral linens, neutral backgrounds. No people's faces in service shots.
- **Provider photos:** waist-up portraits, neutral background, eye contact, soft shadow.
- **Room photos:** wide-angle but not fisheye; furniture-forward; one warm focal element (a candle, a plant, a textured throw).
- **Avoid:** harsh flash, busy backgrounds, dated wellness clichés (rocks balanced on backs, lotus poses, anything with the word "bliss" overlaid).

Tenants who self-upload photos should see a small inline guide in Settings → Booking page → Photos showing 4 examples of "this works" and 4 examples of "this doesn't" — the cheapest content QA mechanism in the product.

### Copy voice extension

`01-design-system.md` and `04-booking-flow.md` already establish the voice: warm framing, precise facts. Two extensions for the new surfaces:

- **Triage questions should never sound clinical.** "How firm do you like your massage?" — not "Pressure preference (required)". The label *is* the design.
- **Prep instructions should be specific and short.** "Skip caffeine 2 hours before" — not "It is recommended that clients consider abstaining from caffeinated beverages prior to their appointment". Three bullets max on the confirmation screen; the full content lives in the reminder.

### Empty states

For every new surface, the empty state has been specified above (TrustPanel without content shows just business name; QuickPreferences without questions doesn't render; PrepInstructions without bullets doesn't render). The pattern: **silence when there's nothing to say**. Empty illustrations and "Start by..." prompts belong in the staff app, not the public booking flow.

---

## 5. Accessibility & motion

### Touch targets

All new interactive elements (chip questions, segmented controls, slot-hold ribbon, share buttons) meet the 44×44 minimum from `01-design-system.md`. The `<ProgressiveQuestionForm>` chip-style answers are 56px tall to comfortably accept thumbs in motion (the screen is meant to be tapped through quickly).

### Color contrast

All new copy on `--accent-pale` and `--amber-pale` backgrounds uses `--ink` for text, which meets WCAG AA at body-sm sizes per the contrast values published in `01-design-system.md`. The "Most booked" badge specifically: `--accent` on `--accent-pale` is 4.9:1 — passing for body-sm but should be paired with the badge's caption-weight text (12px / 600). Same rule applies to the slot-hold timer ribbon.

### Screen reader behavior

- The `<TrustPanel>` collapsed/expanded state uses `aria-expanded` on the trigger and `aria-controls` on the content region.
- The `<ProgressiveQuestionForm>` advances using `aria-live="polite"` on the question container so screen readers announce each new question on transition.
- The slot-hold ribbon uses `role="status"` so the timer doesn't ratchet up screen reader noise — only critical changes (under 1 minute remaining, expired) trigger the `aria-live` polite region.

### Motion preferences

`prefers-reduced-motion: reduce` is honored across all new transitions:

- Question slide-in/out animations collapse to immediate cross-fade (50ms).
- Service detail sheet skips the slide-up animation and appears instantly.
- The slot-hold timer's pulsing red state in the final 60 seconds is replaced with a static color change.

This matches the existing reduce-motion handling in `10-design-system-buildout.md` and requires no new tokens.

---

## 6. Build order

The design refresh slots into the same sub-epics defined in `05-booking-enhancements.md` §"Updated MVP build order":

| Design deliverable                                  | Aligns with sub-epic | Effort |
|-----------------------------------------------------|----------------------|--------|
| `<TrustPanel>` component + Screen 1 panel placement | 4-E1                 | 1.5d   |
| Service detail sheet + provider detail sheet         | 4-E1                 | 2d     |
| Screen 2 provider toggle + slot-hold ribbon          | 4-E1                 | 1d     |
| `<ProgressiveQuestionForm>` + Screen 2.5             | 4-E2                 | 2d     |
| Add-on card refresh + duration-shift warning         | 4-E2                 | 1d     |
| Screen 4 cancellation policy line + contact preference | 4-E1               | 0.5d   |
| Screen 5 prep panel + wallet/share actions           | 4-E4                 | 1.5d   |
| `<PrepInstructions>` component                       | 4-E4                 | 0.5d   |

Total design-side effort: **~10 working days** for one frontend engineer with strong CSS skills, including review cycles. This sits inside the 21-day total in `05-booking-enhancements.md` rather than adding to it.

---

## 7. Open questions

1. **Should the `<TrustPanel>` be expanded by default on desktop?** Proposed: yes on desktop ≥1024px, collapsed on mobile. Test post-launch and adjust.
2. **Should referral codes be visible on Screen 1 from the first visit, or only show for clients who arrive via a referral link?** Proposed: only show when arriving via a `?ref=` URL parameter; otherwise hide. Adding it to every booking flow looks like a marketing tactic; appearing only when relevant feels intentional.
3. **Membership upsell placement** — Screen 4 inline + Screen 5 card may be too much. A/B test: Screen 4 only vs Screen 5 only vs both. Default to Screen 5 only at MVP.
4. **For Apple Wallet pass design**, do we use the tenant's logo and accent color, or a Velura-branded pass? Proposed: tenant's logo and brand color. The pass belongs to the relationship between client and tenant; Velura's role is invisible.
5. **Should provider detail sheets show provider's calendar density** ("Books up 3 weeks out — book early")? Useful social proof, but easy to misuse. Proposed: defer to Phase 2.

---

## Reviewed by

- [ ] Design lead — reviewed component additions, token usage, photography guidelines
- [ ] Engineering tech lead — reviewed component contracts, accessibility approach, motion handling
- [ ] Product owner — reviewed flow changes, A/B test list, MVP scope
- [ ] Tenant pilot group — reviewed against real tenant content (3+ tenants of varying maturity)

---

*End of design refresh. This document and `05-booking-enhancements.md` should ship together as a paired addition to the MVP scope.*
