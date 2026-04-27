# 09 — Dev Handoff Spec
**Project:** Wellness Platform Rebuild (MINDBODY Alternative)
**Version:** 1.2
**Date:** April 26, 2026
**Audience:** Solo developer or small agency
**Companion docs:** 01 — Architecture Decisions, (pending) 02 — Database Schema, 05 — API Integrations, 06 — Security Review, 08 — Product Flows, `textlink-integration-guide.md`, `textlink-api-reference.md`

**Changelog**
- v1.2 (Apr 26, 2026) — Added "Accounts and services setup" section between Stack summary and MVP Epic Index. Covers all 16 service accounts the dev needs to provision, organized into 5 tiers by when they're needed. Includes consolidated env var reference, webhook endpoint table, and total MVP monthly cost summary (~$12–25/mo).
- v1.1 (Apr 25, 2026) — Swapped messaging stack: Twilio → TextLink (3 SIMs, paid), Resend → Postmark (existing Clarity Labs USA paid account, dedicated Server). Epic 8 rewritten to cover the SIM-based throughput model, recipient–SIM pinning, multi-tenant sender identity strategy, compliance ownership, and provider abstraction layer. Launch checklist and Phase 2 AI receptionist epic updated accordingly.

---

## How to read this document

This is the translation layer between architecture and code. It is organized as **epics** — high-level feature clusters that each represent roughly 1–3 weeks of work for a single senior developer. Each epic includes:

- **Why it exists** — the business problem and the pain point being solved
- **What to build** — scope boundaries, with explicit exclusions
- **Technical approach** — the short path from decision doc to implementation
- **Done looks like** — acceptance criteria written as observable behavior
- **Expand later** — the deeper tickets that should be broken out when work begins on that epic

Epics are not stand-alone tickets. Each one will need to be decomposed into individual tickets when it reaches the top of the queue. That decomposition is deferred on purpose — breaking everything into tickets up front creates stale work that has to be rewritten when the preceding epic reveals something unexpected. The better pattern for a small team is: finish the current epic, review what was learned, then break down the next one.

Read this doc in order for the first time. After that, treat the epic index as a menu.

---

## Context the developer needs before writing any code

The rebuild exists because three market leaders — Mindbody, Vagaro, and GlossGenius — all share the same operational failures in wellness/massage/therapist-led workflows:

1. Checkout UX breaks in subtle ways (triple-tip bug, cart timeouts, tips calculated on the wrong base amount).
2. Intake forms fail because they rely on third-party iframes or email redirects that break silently.
3. SMS and phone integration is bolted on, not native — so therapists end up using personal phones for ETAs and follow-ups.
4. Calendar sync is limited to 1–2 platforms, so therapists using Apple Calendar or anything else fall through.
5. Training is locked behind "universities" and annual conventions instead of being contextual inside the product.
6. Staff reminders (day-before schedules, arrival confirmations) are inconsistent or missing.

Every MVP epic in this document traces back to one of those six problems. If an epic doesn't trace back to one, it belongs in Phase 2 or later. The single most important thing for a solo dev to internalize: **this product wins by being boring and correct in places where the incumbents are flashy and broken**. Checkout that never triple-charges a tip is worth more to the customer than any AI feature.

---

## Stack summary (from doc 01)

The developer should not re-litigate these. They are locked.

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind |
| Backend | Node.js + Fastify + TypeScript |
| DB | PostgreSQL via Supabase |
| ORM | Prisma |
| Cache/Queue | Upstash Redis + BullMQ |
| Auth | Clerk or Auth.js (see Epic 1) |
| Payments | Stripe Connect + Terminal + Payment Element |
| SMS | TextLink (SIM-based, 3 SIMs at MVP — see `textlink-integration-guide.md`) |
| Email | Postmark + React Email (using existing Clarity Labs USA paid account, dedicated Server) |
| Storage | Supabase Storage |
| Hosting | Vercel (frontend) + Railway (backend) |

Repo layout is a single monorepo with `apps/web`, `apps/api`, and `packages/shared`. No microservices at MVP. The domain modules listed in doc 01 become folders inside `apps/api/src/modules`.

---

## Accounts and services setup

Before writing a line of code, every account below needs to exist and the credentials need to live in a shared password manager (1Password recommended). Some have approval delays — start the ones marked **(approval delay)** on day 1 even if they aren't needed until week 2 or 3.

**Operational rules for every account:**
- One shared `founder@<platform-domain>` email used for all signups. Never personal email.
- 2FA enabled on every account, especially Stripe, Postmark, Supabase, Railway, Cloudflare, and the domain registrar.
- API keys/tokens stored in 1Password, never in `.env` files committed to git, never pasted in Slack/Discord.
- Production and staging credentials are separate. Where the provider supports it (Postmark, Stripe, TextLink), use sandbox/test mode for staging.

### Tier 1 — Required to deploy anything (Week 1)

| # | Service | Purpose | Plan / Cost | Action item |
|---|---|---|---|---|
| 1 | **GitHub** | Code repo + CI/CD via Actions | Free | Create org, add team, set branch protection on `main` |
| 2 | **Cloudflare** | DNS + registrar (cheapest, at-cost) | Free | Register platform domain, point nameservers, enable proxying for the apex |
| 3 | **Railway** | Backend hosting (Fastify API + BullMQ worker) | Hobby ~$5/mo + usage; expect **$5–15/mo** at MVP | Connect GitHub, create project, add env vars |
| 4 | **Supabase** | Postgres + Storage + Auth fallback | Free tier (500 MB DB, 1 GB storage); $25/mo Pro when outgrown | Create project, copy connection strings, enable RLS |
| 5 | **Upstash** | Redis for BullMQ queues + caching | Free tier (10K commands/day) | Create Redis instance, copy URL |
| 6 | **Vercel** | Next.js frontend hosting | Hobby (free) | Connect GitHub, configure custom domain |
| 7 | **Clerk** | Authentication (admin, staff, manager roles) | Free up to 10K MAU | Create application, configure roles + JWT template |

### Tier 2 — Required before charging or messaging (Week 2)

| # | Service | Purpose | Plan / Cost | Action item |
|---|---|---|---|---|
| 8 | **Stripe** | Payments + Stripe Connect (tenant payouts) + Terminal (in-person) | Pay-per-transaction (~2.9% + $0.30) | Create account, **(approval delay)** apply for Stripe Connect, request Terminal access |
| 9 | **Postmark** | Transactional email (confirmations, receipts, magic links, invites) | $0 incremental — **using existing Clarity Labs USA paid account** | Create dedicated Server: `MedSpa Platform - Production`, plus a separate Sandbox Server for staging. Add sending domain `mail.<platform-domain>`, configure DKIM/SPF/Return-Path, enable Bounce + Spam Complaint webhooks pointing at `api.<platform-domain>/webhooks/postmark/*` |
| 10 | **TextLink** | SMS (booking confirmations, reminders, OTP, waitlist) | Paid plan with **3 SIMs provisioned at MVP** | Already paid. Provision 3 SIMs, copy API key, configure Sent/Failed/Received/Tag-change webhooks pointing at `api.<platform-domain>/webhooks/textlink/*`. See `textlink-integration-guide.md` for SIM allocation strategy |

### Tier 3 — Observability and ops (Week 2–3, free tiers)

| # | Service | Purpose | Plan / Cost | Action item |
|---|---|---|---|---|
| 11 | **Sentry** | Error tracking (frontend + backend) | Free tier (5K errors/mo) | Create projects for `web` and `api`, install SDK, wire source maps |
| 12 | **PostHog** | Product analytics + session replay | Free tier (1M events/mo) | Create project, add to web app, define key events (booking_completed, checkout_failed, etc.) |
| 13 | **BetterStack** *or* **Uptime Robot** | Uptime monitoring + status page | Free tier (10 monitors) | Add monitors for `app.<platform-domain>`, `api.<platform-domain>/health`, Postmark + TextLink webhook endpoints |

### Tier 4 — Business + legal (whenever ready to take real money)

| # | Service | Purpose | Plan / Cost | Action item |
|---|---|---|---|---|
| 14 | **Google Workspace** | Business email on platform domain | ~$7/user/mo | Create `founder@`, `support@`, `noreply@` (the latter aliased; not used for sending — Postmark handles that) |
| 15 | **Mercury** *or* **Relay** | Business banking, integrates with Stripe payouts | Free | Open business account, connect to Stripe |
| 16 | **Termly** *or* **Iubenda** | ToS + Privacy Policy generator (required before launch) | Free tier or ~$10/mo | Generate ToS, Privacy Policy, Cookie Policy; embed on marketing site |

### Tier 5 — Phase 2 / when you outgrow Railway

These are **not** needed at MVP. Listed here so the dev knows what comes next when usage triggers a migration off the managed PaaS path:

- **DigitalOcean** — Droplets, Managed Postgres, Spaces, Container Registry. Migration trigger: Railway compute > $80/mo, or compliance requires VM control. Playbook lives in `push-to-production.md` and `digitalocean-droplets.md`.
- **Apple Developer** ($99/yr) — only if native iOS app ships in Phase 3.
- **Google Play** ($25 one-time) — only if native Android app ships in Phase 3.

### Total MVP monthly cost

| Service | Cost |
|---|---|
| Railway | $5–15 |
| Supabase | $0 (free tier) |
| Upstash | $0 (free tier) |
| Vercel | $0 (Hobby) |
| Clerk | $0 (free up to 10K MAU) |
| Stripe | Pay-per-transaction (no minimum) |
| Postmark | $0 incremental (existing Clarity Labs account) |
| TextLink | $0 incremental (3-SIM plan already paid) |
| Cloudflare | $0 |
| Sentry / PostHog / BetterStack | $0 (free tiers) |
| Google Workspace | ~$7/user/mo |
| **Total** | **~$12–25/mo** + Stripe transaction fees |

That's the real number. The DigitalOcean playbook in `push-to-production.md` is the Phase 2 migration target, not the starting point. Don't burn a week setting up nginx and Docker when `git push` would have shipped the same code.

### Environment variables required (consolidated reference)

The dev should put these into Railway env vars (backend) and Vercel env vars (frontend). Each is sourced from the corresponding account in the table above.

```bash
# Database (Supabase)
DATABASE_URL=
DIRECT_URL=                       # for Prisma migrations
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # backend only — never expose to client

# Cache + queue (Upstash)
REDIS_URL=                        # used by BullMQ + cache layer

# Auth (Clerk)
CLERK_PUBLISHABLE_KEY=            # frontend
CLERK_SECRET_KEY=                 # backend
CLERK_WEBHOOK_SECRET=             # for user.created → DB sync webhook

# Payments (Stripe)
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=           # frontend
STRIPE_WEBHOOK_SECRET=
STRIPE_CONNECT_CLIENT_ID=         # for tenant onboarding to Stripe Connect

# Email (Postmark)
POSTMARK_SERVER_TOKEN=            # the per-Server token, NOT the account token
POSTMARK_FROM_EMAIL=noreply@mail.<platform-domain>
POSTMARK_TRANSACTIONAL_STREAM=outbound       # default Postmark stream
POSTMARK_BROADCAST_STREAM=broadcast          # for future marketing sends
POSTMARK_WEBHOOK_SECRET=

# SMS (TextLink)
TEXTLINK_API_KEY=
TEXTLINK_WEBHOOK_SECRET=
TEXTLINK_SIM_TRANSACTIONAL=       # SIM ID per allocation strategy
TEXTLINK_SIM_REMINDERS=           # see textlink-integration-guide.md §3
TEXTLINK_SIM_MARKETING=

# Observability
SENTRY_DSN_WEB=
SENTRY_DSN_API=
POSTHOG_API_KEY=
POSTHOG_HOST=https://us.posthog.com

# App config
APP_URL=https://app.<platform-domain>
API_URL=https://api.<platform-domain>
JWT_SECRET=                       # for magic link signing
NODE_ENV=production
```

### Webhook endpoints to configure

After deploying the API, configure these webhook URLs inside each provider's dashboard:

| Provider | Event | URL |
|---|---|---|
| Stripe | `payment_intent.*`, `charge.*`, `account.*` (Connect) | `api.<platform-domain>/webhooks/stripe` |
| Clerk | `user.created`, `user.updated`, `user.deleted` | `api.<platform-domain>/webhooks/clerk` |
| Postmark | Bounce | `api.<platform-domain>/webhooks/postmark/bounce` |
| Postmark | Spam Complaint | `api.<platform-domain>/webhooks/postmark/complaint` |
| TextLink | Sent | `api.<platform-domain>/webhooks/textlink/sent` |
| TextLink | Failed Message | `api.<platform-domain>/webhooks/textlink/failed` |
| TextLink | Received Message | `api.<platform-domain>/webhooks/textlink/inbound` |
| TextLink | Tag Update | `api.<platform-domain>/webhooks/textlink/tag` |

All webhook handlers must verify provider signatures before processing. No exceptions.

---

## MVP Epic Index

| # | Epic | Est. effort (solo senior dev) | Depends on |
|---|---|---|---|
| 1 | Foundation & auth | 1 week | — |
| 2 | Client + staff data model and admin CRUD | 1 week | 1 |
| 3 | Booking engine — availability and appointments | 2–3 weeks | 2 |
| 4 | Login-free client booking portal | 1–2 weeks | 3 |
| 5 | First-party intake forms + e-sign | 1–2 weeks | 2 |
| 6 | Stripe checkout (the one that doesn't break) | 2 weeks | 3 |
| 7 | Calendar sync (Google, Outlook, Apple, .ics) | 1–2 weeks | 3 |
| 8 | Notifications & reminders via BullMQ | 1 week | 3, 6 |
| 9 | Staff-facing app views | 1 week | 3, 8 |
| 10 | Admin dashboard + reporting basics | 1 week | all above |
| 11 | Observability, error tracking, and launch hardening | 0.5–1 week | all above |

Total MVP estimate: **12–16 weeks for a solo senior dev**, or **8–10 weeks for a small agency with 2 devs working in parallel after Epic 2**. The architecture doc's 8–12 week estimate assumes the latter.

---

## Epic 1 — Foundation & auth

**Why it exists**
Before anything else works, the team needs a deployable skeleton: monorepo, database, auth, CI, and a way to deploy a staging URL in under 5 minutes. Skipping this and "just starting" is the single most common reason solo-dev projects become unmaintainable by week 4.

**What to build**
A monorepo with a working Next.js frontend, Fastify API, Prisma connected to Supabase Postgres, and authentication for three user types: admin, staff (therapist), and office manager. Clients do not log in during MVP — they use magic links (see Epic 4).

**Technical approach**
- Use `pnpm` workspaces. Resist the urge to use Nx or Turborepo at this size.
- Auth choice between Clerk and Auth.js: pick **Clerk** if the budget allows the ~$25/mo cost, because it eliminates an entire category of security mistakes (session handling, password reset flows, MFA). Pick **Auth.js** only if self-hosting is a hard requirement. The architecture doc leaves this open; this handoff recommends Clerk for solo dev sanity.
- RBAC is three roles at MVP: `admin`, `staff`, `manager`. Store the role on the user record in Postgres, not in Clerk metadata — this keeps authorization logic close to the data it protects.
- Set up GitHub Actions with a single workflow: lint, typecheck, test, deploy-preview. Nothing fancy.
- Seed script must create at least one admin user so the team can log in to a fresh environment.

**Done looks like**
- A developer can clone the repo, run `pnpm install && pnpm dev`, and land on a working login page connected to a real Postgres instance in under 10 minutes.
- Pushing to `main` deploys to staging automatically.
- A logged-in admin sees a different UI than a logged-in staff member.
- Trying to hit a staff-only API route as an admin (or vice versa) returns 403 with a consistent error shape.

**Expand later**
- Invite flow for new staff members (email with activation link)
- MFA toggle per role
- Audit log for login events
- Password reset copy review
- Staff impersonation for support (admin-only, logged)

---

## Epic 2 — Client and staff data model, admin CRUD

**Why it exists**
Every other module reads from or writes to clients and staff. Getting the schema wrong here means rewriting queries across the entire system later. This is the foundation for booking, intake, payments, and reporting.

**What to build**
Prisma schema and admin UI for creating, reading, updating, and soft-deleting:

- **Client** — name, email, phone, date of birth, address, emergency contact, intake status, tags, notes
- **Staff** — name, email, role, services they can perform, working hours template, hourly rate/commission rate, active/inactive
- **Service** — name, duration, base price, color, which staff can perform it

Soft delete is mandatory — hard deletes break every report, every audit trail, and every "why did this client disappear" investigation.

**Technical approach**
- Every table gets `id` (cuid2), `createdAt`, `updatedAt`, `deletedAt` (nullable). Prisma middleware to auto-filter `deletedAt IS NULL` on all reads unless explicitly opted out.
- Tags on clients are a separate `ClientTag` table with a many-to-many join. Do not store tags as a JSON array. This pays off the first time the admin wants to filter by tag.
- Email and phone are **not** unique at the database level. Two people can share an email (family members), and a phone number can change hands. Uniqueness is a UI-level duplicate warning, not a DB constraint. This is counterintuitive but is the single most common migration pain point in wellness software.
- Staff working hours template is stored as a JSON column for MVP — day-of-week + start/end times. The booking engine reads this to compute availability. A normalized schedule table is a Phase 2 upgrade.

**Done looks like**
- Admin can create a client with all fields, edit them, and soft-delete them.
- Admin can create a staff member, assign services, set working hours, and toggle active.
- Admin can create a service, set duration and price, and assign eligible staff.
- Soft-deleted records disappear from all lists but remain queryable for reports.
- Attempting to save a client with no name returns a validation error with a clear message.

**Expand later**
- Bulk import from CSV (most customers migrating from Mindbody will need this)
- Client relationships (family, household)
- Custom fields per client
- Staff certifications + expiry tracking
- Service categories and display ordering

---

## Epic 3 — Booking engine: availability and appointments

**Why it exists**
This is the hardest module in the product. Every competitor gets 80% of this right and 20% painfully wrong, and the 20% is where customer churn lives. Recurring appointments, buffers, time zones, resource conflicts, and daylight saving transitions are all places where bugs silently corrupt revenue.

**What to build**
An availability engine that, given a service, a staff member (or "any"), and a date range, returns bookable time slots. An appointment model that can be created, rescheduled, cancelled, and marked no-show. A waitlist table that records clients who want an earlier slot if one opens.

**Technical approach**
- **Store all times in UTC** in Postgres. Convert to local time zone only at render time. The business time zone is a setting on the tenant.
- Availability is computed, not stored. Do not materialize slots into a table — that creates DST bugs and stale-slot bugs. The algorithm is: start with the staff member's working hours template for the requested day, subtract existing appointments, subtract buffers, subtract blackout periods, snap to the service's duration grid.
- Use `luxon` or `date-fns-tz` for time zone math. Do not use raw JS `Date` for anything beyond `new Date()`.
- Appointments have a state machine: `scheduled` → `confirmed` → `checked_in` → `in_progress` → `completed`, with forks to `cancelled` and `no_show`. Enforce transitions in the service layer, not the UI.
- Double-booking prevention: use a Postgres `EXCLUDE` constraint on staff + time range (tstzrange). This is a database-level guarantee that no two confirmed appointments can overlap for the same staff member — the UI cannot bypass it.
- Recurring appointments at MVP: support weekly recurrence only. Monthly and custom recurrence are Phase 2.

**Done looks like**
- Requesting availability for a staff member returns a list of slots that respect their working hours, existing appointments, and buffers.
- Booking the same slot twice in parallel (simulate with two API calls 50ms apart) results in exactly one success and one clear error.
- An appointment crossing a DST transition shows the correct local start and end time on both sides of the transition.
- Cancelling an appointment frees the slot immediately in availability queries.
- Marking an appointment as no-show does not free the slot for other bookings (this is a reporting distinction, not an availability one).

**Expand later**
- Resource scheduling (rooms, equipment)
- Class and group appointments
- Multi-service bookings (stacked services in one visit)
- Pick-a-spot for classes
- Buffer rules per service type, not per staff
- Travel time between off-site appointments

---

## Epic 4 — Login-free client booking portal

**Why it exists**
Making a new client create an account before booking is the single largest drop-off point in every competitor's funnel. GlossGenius's booking conversion is materially higher than Mindbody's largely because of this one choice. The rebuild should ship with login-free booking from day one.

**What to build**
A public booking flow at a per-tenant URL (e.g., `book.yourbrand.com`) where a prospective client picks a service, a staff member or "any," a time slot, and enters their name, email, phone, and card on file. No password. Returning clients are recognized by email — they receive a magic link if they want to view or change their booking.

**Technical approach**
- Magic links are single-use, signed JWTs with 24-hour expiry, delivered via Postmark (transactional Server, see Epic 8 for setup).
- Card on file at booking time uses Stripe's SetupIntent — no charge is made, but the card is saved to a Stripe Customer object created for that client. Deposits and no-show fees are captured later via PaymentIntent.
- The flow is a single route with multiple steps driven by URL search params (`?step=time` etc.) so the browser back button works and the URL is shareable. Do not use a modal-stack pattern — it breaks on mobile.
- The booking form must function without JavaScript for the first two steps (service + staff selection) to preserve SEO and accessibility. Use Next.js server actions.
- Duplicate client detection happens server-side: if the email matches an existing client, attach the booking to that client instead of creating a new one. The client does not need to confirm — this is silent.

**Done looks like**
- A new visitor can complete a booking in under 90 seconds on mobile, with one thumb, without creating an account.
- The booking confirmation page shows the appointment, a magic link button to manage it, and an add-to-calendar link.
- A returning client (same email) booking a second appointment does not create a duplicate client record.
- Opening the booking URL with no tenant context (wrong subdomain) returns a branded 404, not a server error.

**Expand later**
- Service filtering by category
- Staff bios and photos on the selection page
- Upsells ("Add a hot stone for $15")
- Deposit collection at booking time
- Custom intake questions inline in the booking flow
- Referral tracking (where did this booking come from)

---

## Epic 5 — First-party intake forms and e-sign

**Why it exists**
This is pain point #2, and it is the one customers complain about the loudest because broken intake forms cost therapists actual session time — the client arrives and has to fill paperwork during their billable hour. Every competitor has this problem because they all use third-party form tools connected by email or iframe. The fix is to own the form infrastructure.

**What to build**
A form engine where an admin can define forms with text, long-text, date, yes/no, multi-select, signature, and file-upload fields. Forms are attached to services — booking a deep tissue massage triggers the deep tissue intake form. Clients receive a link via SMS or email, open it in their mobile browser (no app, no login), fill it out, sign, and submit. The submission is immediately visible to the therapist in the staff app.

**Technical approach**
- Form definitions are JSON in Postgres — an array of field objects. Versioned — editing a form creates a new version so old submissions remain renderable against the version they were filled under.
- Form rendering is a React component that reads the JSON definition. Do not use a form-builder library like Form.io at MVP — the abstraction is more complex than the problem.
- Signatures are captured with a simple canvas component, converted to PNG, stored in Supabase Storage with restricted access.
- The form link is a signed token in the URL. No login. Token expires 7 days after appointment or after submission, whichever comes first.
- E-sign legal requirement: log the IP address, user agent, timestamp, and the full form version that was signed. Store this as a `FormSubmissionAudit` record that is never updated — append only.

**Done looks like**
- An admin can create a new form with at least five field types and attach it to a service.
- A client receives the form link within 2 seconds of booking, works in Safari on iPhone, and submits successfully.
- The therapist sees the submission in the appointment detail view before the appointment starts.
- A signed form cannot be edited after submission — only a new submission can be created.
- The audit log captures enough metadata to defend the signature in a liability dispute.

**Expand later**
- Conditional fields (show X only if Y is checked)
- Form templates library
- SOAP note forms for medspa use case
- Photo upload for before/after
- Multi-page forms with progress indicator
- PDF export of completed forms

---

## Epic 6 — Stripe checkout that doesn't break

**Why it exists**
This is pain point #1, and it is the feature most likely to generate word-of-mouth growth. The triple-tip bug, pre-built cart timeout, and tip-on-wrong-amount bugs are so common across competitors that building a checkout that quietly does not have them is a real marketing asset.

**What to build**
A staff-facing checkout UI on tablet or phone that closes out an appointment: shows the service(s) rendered, lets the staff add retail items, applies a single tip (percentage or custom amount), calculates tax, and charges the card on file or a new card via Stripe Terminal. Sends a receipt via email or SMS.

**Technical approach**
- The cart is a server-side resource — a `Cart` row in Postgres, owned by a staff member and linked to an appointment. Not a session cookie. Not localStorage. Every action (add item, change tip, apply discount) is an API call that updates the cart row and returns the new totals. This is the architectural decision that kills the "cart timeout" class of bugs.
- **Tip is a single field with a single state**. The UI shows percentage buttons (15/18/20/custom) but they all write to one `tipAmountCents` field on the cart. Clicking 20% after 18% overwrites — it does not add. This sounds trivially obvious; it is the bug that exists in production at every competitor because their cart state is split across client and server.
- Tip base is `subtotalCents` (services + retail), not per-line-item. Enforced in the service layer with a single function that computes totals from the cart row. Never compute totals in the UI.
- Tax is computed by the same function. Discounts apply before tax. Tip is on post-discount subtotal, pre-tax. Write these rules down in a `CartTotals` utility with unit tests covering at least 20 combinations including edge cases (100% discount, tip only, negative adjustments).
- Use Stripe PaymentIntent with `off_session: true` for card-on-file charges. Use Stripe Terminal SDK for in-person card taps. Webhook handler must be idempotent — Stripe will retry, and double-charging is worse than any other bug this product can have.
- Receipt email is a React Email component. Variables are typed props. There is no "find and replace phrases" step, ever.

**Done looks like**
- A staff member can close out an appointment in under 30 seconds: open cart, confirm service, pick a tip, tap charge, done.
- Rapidly tapping the tip percentage buttons 10 times in a row results in exactly one tip value on the cart, matching the last tap.
- Refreshing the checkout page mid-flow shows the same cart with the same totals — no state is lost.
- A network failure during charge shows a clear error state and does not create a duplicate charge when the staff member retries.
- Every charge has exactly one matching webhook-confirmed payment record, verified by a reconciliation query.

**Expand later**
- Split payment (part card, part gift card, part cash)
- Tip distribution across multiple staff for group services
- Gift card sales and redemption
- Deposits and no-show fee capture
- Refund and partial refund flows
- Stripe Terminal BBPOS WisePOS E hardware support

---

## Epic 7 — Calendar sync

**Why it exists**
Pain point #4. Every competitor supports Google and Outlook. Many therapists use Apple Calendar. None of them support Apple well, and none support the long tail (Fantastical, Yahoo, Proton). The rebuild ships with four at launch.

**What to build**
Two-way sync with Google Calendar, Outlook (Microsoft Graph), and Apple Calendar (CalDAV). Read-only `.ics` feed for anything else.

**Technical approach**
- Google and Outlook sync via OAuth, stored per staff member. Sync is push — when an appointment is created/updated/cancelled, push to the external calendar via API. Pull — periodic poll (every 15 min) to detect external calendar events that should block availability.
- Conflict resolution: the MINDBODY rebuild is the source of truth for appointments. External events only create **busy blocks** in our availability engine — they do not become appointments. This prevents a Google Calendar event titled "lunch" from showing up as a client appointment.
- Apple CalDAV is trickier — there's no consumer OAuth. Use app-specific passwords. Document this clearly in the UI.
- The `.ics` feed is a tokenized URL per staff member. No auth. The token is long and unguessable. Regenerating the token invalidates the old URL.

**Done looks like**
- A staff member connects Google Calendar in under 60 seconds and sees appointments appear in Google within 30 seconds.
- Creating an event in Google Calendar during a booked slot does not create a double-booking in our system, but does block that time from new bookings within 15 minutes.
- Disconnecting calendar sync removes the staff member's tokens and stops all future pushes, without deleting previously synced events.
- The `.ics` feed validates against an RFC 5545 validator.

**Expand later**
- Two-way sync with external events becoming appointments (opt-in per staff member)
- Google Calendar color matching by service
- Outlook shared calendars
- Conflict notifications when external events overlap booked time

---

## Epic 8 — Notifications and reminders via BullMQ

**Why it exists**
Pain points #3 and #6. Day-before schedule reminders, arrival check reminders, and post-appointment messaging all require jobs that fire at specific future times. BullMQ on Redis is the right tool; the scope of this epic is wiring it up cleanly.

**What to build**
A notification system that schedules and sends:

- Client booking confirmation (immediate)
- Client appointment reminder (24h before)
- Staff schedule digest (5pm day before, listing tomorrow's appointments)
- Staff arrival-check nudge (10 min after appointment start if not checked in)
- Client post-appointment thank-you (configurable, default 2h after completion)

All deliverable via SMS (TextLink), email (Postmark), or both.

**Technical approach**

*Provider abstraction first.* Wrap both providers behind interfaces (`SmsProvider`, `EmailProvider`) in `packages/shared/notifications`. The TextLink and Postmark adapters are thin shims that translate between our internal job payload and the provider's API. The orchestrator (BullMQ workers) does the heavy lifting: tenant scoping, opt-out filtering, template rendering, retry policy, idempotency keys. **Do not inline provider SDK calls inside business logic.** This pattern is non-negotiable because it lets us swap or add providers (international SMS via Twilio, marketing email via SendGrid) without rewriting the worker.

*SMS via TextLink.* Read `textlink-integration-guide.md` before writing any SMS code. The short version of what makes this different from a typical Twilio integration:

- TextLink sends from real Android phones with physical SIM cards, not from carrier shortcodes. We have **3 SIMs at MVP**.
- Per-SIM throughput is roughly one message every 3–6 seconds. Plan for ~1,500 marketing sends per hour as a working ceiling across all 3 SIMs.
- BullMQ concurrency on the SMS queue is throttled per SIM, not per queue. Use named workers, one per `sim_card_id`, each with concurrency 1.
- Recipient–SIM consistency is the non-negotiable rule: a given client phone number must always receive messages from the same SIM. Pin on first contact in a `recipient_sim_pinning` table; never invalidate.
- Use the `custom_id` field on every send, set to the internal `notification_id`. The failed-message webhook returns this so we know which row to mark `failed` without any matching gymnastics.
- Use TextLink's hosted OTP endpoints (`/api/send-code` + `/api/verify-code`) for client phone verification at booking. No need to store codes in our DB.

*Email via Postmark.* Setup is one-time and lives in `digitalocean-droplets.md` / deployment runbook, but the developer needs to know:

- We use the existing **Clarity Labs USA paid Postmark account**. Create a dedicated Server inside it called `MedSpa Platform - Production` (and a separate Sandbox Server for staging/dev). Account-level token never lives in our codebase; only the per-Server token does.
- Sending domain is `mail.<platform-domain>`. DKIM, SPF, and Return-Path (custom tracking domain) configured at Server creation.
- For MVP, all emails send from `noreply@mail.<platform-domain>` with `From Name = "<Tenant Name> via <Platform>"` and `Reply-To = <tenant_reply_to_email>`. This avoids per-tenant DNS configuration on day one.
- A `tenant_email_settings` table holds `from_name`, `reply_to_email`, and a nullable `postmark_sender_signature_id` for the eventual "verified sender" upgrade path. Phase 2 brings per-tenant Sender Signatures (one-click email verification); Phase 3 brings full per-tenant DKIM-signed sending domains.
- Use Postmark **Message Streams** to separate transactional (booking confirmations, receipts, magic links, password resets) from broadcast (any future marketing). At MVP we only use the transactional stream, but tag jobs with the stream type now to avoid a future migration.

*Queues and job structure.*

- Two BullMQ queues: `sms-queue` and `email-queue`. Jobs include all data needed to render the message — do not fetch from DB at send time, because a cancelled appointment should not send a reminder.
- Schedule jobs at appointment creation time using BullMQ's `delay` option. When an appointment is cancelled or rescheduled, remove and re-queue. Keep job IDs in a column on `appointment` so removal is `O(1)`.
- SMS templates are simple tagged template strings; email templates are React Email components. Both receive the same typed props. Template registration is centralized (one file per channel) so the QA pass is finite.
- Idempotency: every job has a deterministic `notification_id` derived from `(appointment_id, notification_type, scheduled_for_iso)`. Redrives never duplicate-send.
- The staff digest is a batch job: one SMS per staff member with up to 20 appointments formatted cleanly, not 20 separate SMS. Throttle to a single send per staff member per day.

*Webhooks (both providers).* All four webhook handlers live under `apps/api/src/webhooks/` and share a verification middleware:

- **Postmark Bounce** → mark `client.email_status = 'bounced'`, suppress further sends.
- **Postmark Spam Complaint** → suppress immediately, treat as opt-out, log for review.
- **TextLink Failed Message** → mark notification `failed`, increment retry counter; after 3 attempts, surface in admin "failed notifications" view.
- **TextLink Received Message** → parse for `STOP / UNSTOP / HELP` keywords first; if it matches, update opt-out status and reply per TCPA. Anything else gets routed to the inbound message handler (Phase 2: AI receptionist).

*Compliance & opt-out.* This is **our responsibility**, not the provider's. Unlike Twilio's A2P 10DLC system, TextLink does not enforce carrier-level compliance for us:

- Maintain `sms_optouts` and `email_optouts` tables, scoped per tenant. Check before every send.
- Inbound webhook auto-handles STOP/UNSTOP/HELP keywords.
- Quiet hours: enforce no-send between 9 PM and 8 AM in the recipient's local timezone. Worker checks and reschedules to 8 AM if outside the window.
- Every SMS template ends with "Reply STOP to opt out" on first send to a recipient. Subsequent sends omit it for character efficiency.

**Done looks like**
- A booked appointment schedules 3 future jobs: reminder, post-appointment, and a staff digest slot.
- Cancelling the appointment removes all 3 future jobs within 1 second.
- The staff digest is a single SMS with up to 20 appointments formatted cleanly, not 20 separate SMS.
- A client who texts STOP stops receiving SMS within 1 minute and the system records the opt-out, scoped to the tenant they booked with.
- A failed TextLink send retries 3 times with exponential backoff, then surfaces in an admin "failed notifications" view with the failure reason from the webhook payload.
- A bounced email triggers a `bounced` status on the client record, and no further emails attempt to send to that address until manually re-validated.
- All transactional emails from any tenant land in inbox (not spam) on Gmail and Outlook test accounts.
- An OTP verification flow at booking time uses TextLink's hosted verification — no codes stored locally.

**Expand later**
- Custom reminder timing per service
- Post-appointment product recommendations (therapist triggers from their phone, sends to client)
- Missed call → auto-text-back
- AI receptionist for inbound SMS (Phase 2 epic)
- Review request automation
- Per-tenant verified Sender Signatures in Postmark (Phase 2)
- Per-tenant DKIM-signed sending domains for full email white-labeling (Phase 3)
- 4th SIM provisioned when sustained throughput hits 60% of 3-SIM ceiling

---

## Epic 9 — Staff-facing app views

**Why it exists**
The therapist's experience is the operational core of this product. If the staff app is clunky, they'll work around it on their personal phone, and all the data the business owner needs to run the business goes missing. The staff app must be as good as the client booking app.

**What to build**
Staff views (same Next.js app, role-scoped routes) for:

- Today's schedule (list + timeline)
- Appointment detail (client, intake submission, notes from last visit)
- Check-in / mark arrival / start session / complete session
- Checkout launcher (hands off to Epic 6)
- My calendar for the week
- My upcoming appointments

Mobile-first. This is where staff live all day. Every tap matters.

**Technical approach**
- Design for one-handed use on a phone. Primary actions are at the bottom of the screen, not the top.
- Swipe gestures: swipe right on an appointment to check in, swipe left to see client notes.
- Offline-tolerant reads: cache today's schedule in localStorage so a lost network signal doesn't break the therapist's day. Writes require network and show a clear "syncing" state.
- No push notifications in MVP — everything comes via SMS or in-app badges. Push requires native apps, which is Phase 3.

**Done looks like**
- A therapist can open the app, see their next appointment, and check in a client in 3 taps or fewer.
- The appointment detail page loads the intake submission without an additional tap.
- All staff actions (check-in, start, complete) are logged with timestamps for later reporting.
- The app is usable on a 4-year-old iPhone SE.

**Expand later**
- Native mobile wrapper (React Native) for background notifications
- Staff chat / internal messaging
- Shift swap requests
- Tip reporting view
- Commission statement view

---

## Epic 10 — Admin dashboard and reporting basics

**Why it exists**
The business owner needs to see revenue, utilization, and client activity without waiting for a Phase 2 BI integration. "Basics" means enough to replace the day-to-day Mindbody dashboard, not enough to replace a data warehouse.

**What to build**
An admin dashboard with:

- Today's revenue, appointments count, no-show count
- This week vs last week comparison
- Staff utilization (booked hours / available hours) per staff member
- Top services by revenue (this month)
- Active client count and new-client count

A few basic reports downloadable as CSV: appointment list, payment list, client list.

**Technical approach**
- All dashboard queries are pre-computed in a nightly job, stored in a `DashboardSnapshot` table. Real-time queries on an OLTP database get slow fast.
- "Today" numbers are the exception — computed live because stale "today" numbers are worse than slow ones. Cap the query cost with appropriate indexes.
- CSV exports are generated server-side and streamed, not loaded into memory. A salon with 3 years of data will hit memory limits on a naive implementation.
- Do not build charts with a heavy library. Use `recharts` or a simple SVG renderer. The dashboard is numbers + trends, not analytics-platform depth.

**Done looks like**
- The admin dashboard loads in under 2 seconds on a cold cache.
- A business owner can answer "how did we do this week" without clicking more than twice.
- CSV exports of 10,000+ records complete without the browser tab crashing.
- The numbers reconcile with the underlying data — a spot-check of a week's revenue matches the sum of payments for that week.

**Expand later**
- Full BI via Metabase or Superset connected to a read replica
- Scheduled email reports ("Every Monday send me last week's revenue")
- Multi-location rollups
- Predictive no-show scoring
- Client lifetime value

---

## Epic 11 — Observability, error tracking, and launch hardening

**Why it exists**
You cannot fix what you cannot see. The single biggest difference between a rebuild that outlasts the incumbent and one that limps into obsolescence is whether the team can diagnose production issues in minutes rather than days.

**What to build**
- Error tracking with Sentry across frontend and backend
- Structured logging with `pino` on the API
- Uptime monitoring with a simple external pinger (BetterStack or UptimeRobot)
- A single `/health` endpoint on the API that checks DB, Redis, and Stripe connectivity
- Database backups verified — Supabase has them, but restore them to a scratch instance once before launch to confirm they work
- A written runbook for the top 5 most likely production incidents: DB down, Redis down, Stripe webhook failing, TextLink delivery failing (SIM offline / device unreachable), Postmark bounce-rate spike, payment discrepancy

**Done looks like**
- A deliberately thrown error in staging shows up in Sentry within 30 seconds with a stack trace and user context.
- The `/health` endpoint returns a detailed status object that a human can read.
- Uptime monitor alerts the on-call developer within 2 minutes of the staging environment going down.
- The runbook exists, is committed to the repo, and has been read end-to-end by whoever is on call.

**Expand later**
- Distributed tracing with OpenTelemetry
- Synthetic user journey monitoring
- On-call rotation and PagerDuty integration
- SLO / SLI tracking
- Chaos engineering drills

---

## Cross-cutting concerns

These are not epics because they don't fit a single time window — they touch every epic and need to be enforced continuously.

**Security**
- All client PII (intake forms, notes, phone, email) is encrypted at rest via Supabase's default encryption. No additional field-level encryption at MVP, but the schema should be structured to add it later without a migration (i.e., PII in dedicated tables, not mixed with non-PII).
- All API routes validate input with Zod. No `any` types on request bodies.
- Stripe webhooks must verify the signature header. Reject unsigned requests with 401, not 400.
- Magic link tokens are HS256-signed JWTs with short TTL and single-use flag.
- Full security review is doc 06 — do not deploy to production until that review is complete.

**Testing**
- Unit tests for all cart/total calculations in Epic 6. Non-negotiable.
- Unit tests for the availability engine in Epic 3. Non-negotiable.
- Integration tests for Stripe webhook idempotency.
- Playwright tests for the client booking happy path and the staff checkout happy path.
- Skip unit tests for UI components. The ROI is low at this team size.

**Documentation**
- Every API route has a short JSDoc block describing what it does and who can call it.
- The `README.md` at the repo root tells a new developer how to run the app in under 10 minutes.
- Customer-facing help content is a separate concern (knowledge-base-builder skill) and is not a dev responsibility.

**Performance**
- No page should take longer than 2 seconds to render at the 95th percentile on 4G.
- No API endpoint should take longer than 500ms at p95 for authenticated routes.
- Add a database index the first time a query shows up in slow query logs. Do not pre-optimize.

---

## What the dev should ask before starting

1. Is Clerk acceptable as an auth provider, or is self-hosted required? (Blocks Epic 1)
2. What is the tenant model for launch — single salon, or multi-location from day one? (Affects schema decisions in Epic 2)
3. Is there an existing Stripe account, or does one need to be created under Stripe Connect? (Affects Epic 6 setup time)
4. What's the brand name and domain, so staging URLs can be set up correctly? (Blocks deployment)
5. Is there an existing customer database to migrate from (Mindbody export, spreadsheet, nothing)? (Affects Epic 2 scope)

These five answers should come back before the dev writes a line of code. Every hour spent answering them up front saves a day of rework later.

---

## Appendix A — Phase 2 (Growth) epic outlines

Phase 2 begins after MVP launch and has its own real customers. Do not pre-build Phase 2 features during MVP — they will be designed differently once real customer behavior is visible.

**P2-1 AI text and phone receptionist**
TextLink inbound message webhook → GPT-4o with a tool-calling layer that can check availability and book appointments. Office manager flagged when AI cannot resolve. Voice handling (separate provider, e.g. Twilio Voice or Vapi) is a later phase since TextLink is SMS-only. Estimated 3–4 weeks solo.

**P2-2 Post-appointment recommendations**
Therapist triggers a product/supplement/exercise suggestion from their phone after checkout. BullMQ schedules delivery. Template library maintained by admin. Estimated 1–2 weeks.

**P2-3 MileIQ mileage integration**
OAuth connection per staff profile. Daily pull of trip data. Appears on staff profile and commission statements. Estimated 1 week assuming MileIQ Partner API access is granted.

**P2-4 Memberships, packages, gift cards**
Recurring billing via Stripe Billing. Package entitlements as a balance model. Gift card sales via retail checkout, redemption at payment time. Estimated 3–4 weeks.

**P2-5 Contextual training videos**
Loom or Cloudflare Stream embeds, keyed by feature ID. An admin CMS maps videos to features. Each feature in the UI has a small "?" button that opens the relevant video. Estimated 1 week.

**P2-6 Instagram/Facebook/Google booking integration**
Google Reserve API, Meta Graph API. External traffic flows through the existing login-free booking portal with attribution tracking. Estimated 2–3 weeks.

**P2-7 Commissions and payroll export**
Commission rules engine (percentage of service, percentage of retail, tiered, etc.). Payroll export as CSV for Gusto/QBO import at first; direct integration later. Estimated 2–3 weeks.

**P2-8 Metabase reporting**
Read-replica of Postgres. Pre-built dashboards for revenue, utilization, retention, churn. Shared with business owner via email or embedded. Estimated 1–2 weeks.

---

## Appendix B — Phase 3 (Full platform) epic outlines

Phase 3 is feature parity and differentiation against enterprise incumbents. Timing depends on customer growth — none of these should be built before customer demand is clear.

- **P3-1 Branded native mobile apps** — React Native, shared business logic, App Store / Play Store submission. Estimated 8–10 weeks.
- **P3-2 Public API and webhooks** — API gateway, versioning, developer portal, webhook signing. Estimated 4–6 weeks.
- **P3-3 Multi-location and franchise tooling** — Tenant → region → location hierarchy, cross-location memberships, franchise fees, centralized pricing. Estimated 6–10 weeks.
- **P3-4 Medspa SOAP notes and HIPAA compliance** — BAA with all vendors, separate protected-data schema, stricter audit logging, photo capture. Estimated 6–8 weeks including compliance work.
- **P3-5 Advanced marketing automation** — Audience segmentation, drip campaigns, abandoned booking recovery, review request flows. Estimated 4–6 weeks.
- **P3-6 Data lake / warehouse export** — Nightly Parquet export to S3, optional BI connector templates (Power BI, Tableau). Estimated 3–4 weeks.

---

## Sign-off checklist before development begins

- [ ] Architecture decisions (doc 01) read and accepted
- [ ] Database schema (doc 02) reviewed by dev
- [ ] API integration details (doc 05) reviewed by dev
- [ ] Security review (doc 06) complete
- [ ] Product flow doc (doc 08) reviewed for checkout and booking flows specifically
- [ ] This handoff doc read end-to-end
- [ ] Five pre-start questions answered
- [ ] Repo created and initial commit pushed
- [ ] Staging environment provisioned
- [ ] All Tier 1 + Tier 2 accounts provisioned per the **Accounts and services setup** section, credentials in 1Password, 2FA enabled
- [ ] All webhook endpoints configured in each provider's dashboard with signature verification working end-to-end
- [ ] Sandbox/test environments separate from production for Stripe, Postmark, and TextLink
- [ ] Weekly check-in cadence agreed with stakeholder
- [ ] First epic (Foundation & auth) scheduled with target end date

Once these are checked, start on Epic 1. Do not start Epic 3 before Epic 2 is done. The whole point of the epic sequencing is to prevent the solo-dev failure mode of having 6 half-finished features and no shippable product.
