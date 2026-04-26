# MINDBODY Rebuild — Master Engineering Spec

> Internal Engineering Reference · MINDBODY Rebuild Project · v1.4 April 2026
> Audience: Engineering (architects, backend, frontend, mobile, data, DevOps)
> Scope: Multi-vertical booking/payments/CRM platform competitive with Mindbody, Vagaro, and GlossGenius
> Companion docs: `deep-research-report.md` (competitive analysis), `textlink-integration-guide.md` (SMS gateway), `digitalocean-droplets.md`, `digitalocean-api.md`, `push-to-production.md`

> **Purpose.** This is the single source of truth for what we are building, how it is structured, and the order in which it gets built. It merges the competitive research on Mindbody, Vagaro, and GlossGenius with the concrete SMS notification architecture defined in the TextLink integration guide, and translates both into an opinionated engineering plan covering architecture, domain model, APIs, code patterns, vertical variance, and delivery phasing.

---

## Table of Contents

1. [Product Positioning & Build Philosophy](#part-1)
2. [Multi-Vertical Strategy](#part-2)
3. [System Architecture](#part-3)
4. [Canonical Domain Model](#part-4)
5. [Core Module Specifications](#part-5)
6. [API Surface & Public Developer Platform](#part-6)
7. [Event Bus & Webhook Infrastructure](#part-7)
8. [Notification Architecture (TextLink + Resend)](#part-8)
9. [Payments Architecture (Multi-Provider)](#part-9)
10. [Data Platform & Reporting](#part-10)
11. [Tech Stack Recommendations](#part-11)
12. [Deployment Architecture — DigitalOcean Droplet](#part-12)
13. [Delivery Phases & MVP Cut Lines](#part-13)
14. [Non-Functional Requirements](#part-14)
15. [Open Questions & Risks](#part-15)
16. [Appendix — Reference Tables](#appendix)

---

## PART 1 — Product Positioning & Build Philosophy {#part-1}

### 1.1 The Strategic Frame

The three competitors converge on the same commercial core — booking, clients, payments, reminders, memberships, staff, reporting — and diverge on philosophy. Mindbody is enterprise- and API-first. Vagaro is modular with aggressive add-on monetization. GlossGenius is design-led with a tighter, more opinionated product. Our rebuild does not pick one lane; it combines the strongest aspects of each.

| Borrow from | What we take | Why |
|---|---|---|
| Mindbody | Enterprise-capable data model, public API/webhooks, multi-location/franchise hierarchy | These are where rebuilds fail when they aim too small |
| Vagaro | Modular packaging, add-on monetization, explicit feature toggles, BI/data-lake connectors | Lets us sell the MVP cheaply and upsell later without rewrites |
| GlossGenius | Booking UX, flat-rate payments, mobile polish, AI-forward positioning, login-free booking | This is what makes the product feel modern on day one |

### 1.2 Core Engineering Principles

These principles govern every architectural decision in the rest of this document. When a tradeoff is unclear, fall back to these.

1. **Modular monolith first, event-driven platform second.** One main application boundary for booking, clients, staff, payments, and basic reporting during MVP. A durable event stream from day one so we can peel off notifications, warehouse sync, payroll, and public APIs later without rewriting core booking logic.
2. **Consistency beats cleverness.** The hardest domain is not calendar UI — it is consistency across bookings, ledgers, memberships, notifications, and reporting. Every module must treat the operational database as the single source of truth and emit events for everything else.
3. **Multi-tenant and multi-location from day one.** Even if the MVP ships to single-location SMBs, the schema must support tenant → brand → location → staff hierarchy. Retrofitting this later is a rewrite.
4. **Protected data is partitioned, not bolted on.** Medspa/healthcare-adjacent records (SOAP notes, before/after photos, consent history) live in a separate protected data domain with stricter audit logging. Build the partition early even if the feature ships later.
5. **Feature flags everywhere.** Every module behind a per-tenant feature flag so we can ship vertically (fitness tenants get classes; salon tenants get formulas) without branching the codebase.
6. **Webhooks are a first-class product, not an afterthought.** The event bus that powers internal features is the same event bus that powers the public webhook surface. Build one, expose both.
7. **Idempotency is non-negotiable.** Every write operation — booking, payment, notification, webhook delivery — must be safely retryable. Client-provided `idempotency_key` on all mutating public API endpoints.

### 1.3 What We Are Explicitly Not Building in MVP

Scope protection is as important as scope definition. The following are confirmed out-of-scope for the MVP phase and deferred to Growth or Full Platform phases:

- Branded mobile app wrappers (responsive web + PWA only in MVP)
- Consumer marketplace/discovery surface (MVP is direct booking only)
- Franchise/enterprise royalty accounting
- Medspa protected-records partition and HIPAA-scoped clinical notes (schema stub in MVP; basic non-clinical SOAP notes in 5.2.5 are MVP — the protected partition and clinical-only features ship in Growth/Full)
- Public API + webhook developer portal (internal event bus only in MVP)
- BI warehouse connectors / data lake export
- AI receptionist / AI growth analyst
- Commissions and full payroll (tracked in MVP, calculated in Growth)

---

## PART 2 — Multi-Vertical Strategy {#part-2}

Multi-vertical from day one means the **data model and booking engine are vertical-neutral**, and vertical behavior is expressed through configuration, feature flags, and optional modules — not through branching schema or forked codebases.

### 2.1 Supported Verticals at Launch

| Vertical | Representative customer | Primary booking unit | Critical modules |
|---|---|---|---|
| Salon / Beauty | Independent stylist, small salon | Appointment | Client formulas, product retail, commissions |
| Massage / Wellness | Therapist-led practice, mobile therapists | Appointment | SOAP notes, intake forms, ETA messaging |
| Medspa / Aesthetics | Injector, aesthetician, clinic | Appointment | Protected records, consent, before/after imagery |
| Fitness / Studio | Yoga, Pilates, CrossFit, boutique fitness | Class occurrence | Class templates, pick-a-spot, waitlists, memberships |
| Personal Training | 1:1 trainer, small gym | Appointment or session package | Packages, session tracking |

### 2.2 Vertical Variance Matrix

Every vertical uses the same core objects. What differs is which modules are enabled, which fields are required, and which UI affordances show up.

| Capability | Salon | Massage | Medspa | Fitness | PT |
|---|:---:|:---:|:---:|:---:|:---:|
| Appointments | ✓ | ✓ | ✓ | ✓ | ✓ |
| Classes / events | — | — | — | ✓ | optional |
| Pick-a-spot / reserved seating | — | — | — | ✓ | — |
| SOAP notes | — | optional | ✓ required | — | — |
| Protected records partition | — | optional | ✓ required | — | — |
| Formula/recipe tracking (hair color, etc.) | ✓ | — | optional | — | — |
| Before/after photos | — | — | ✓ | — | optional |
| Intake forms / waivers | optional | ✓ | ✓ | ✓ | ✓ |
| Product retail / inventory | ✓ | optional | ✓ | optional | optional |
| Memberships (recurring) | optional | optional | optional | ✓ | ✓ |
| Packages (session bundles) | optional | ✓ | ✓ | optional | ✓ |
| Commissions | ✓ | optional | ✓ | — | optional |
| Therapist ETA messaging | — | ✓ (mobile) | — | — | — |
| Room / resource allocation | ✓ | ✓ | ✓ | ✓ | optional |

### 2.3 Configuration-Driven Vertical Behavior

A tenant is created with a **vertical profile** that seeds its initial feature flags, required fields, and UI defaults. The profile is not a permanent tag — any flag can be toggled after creation.

```typescript
type VerticalProfile = 'salon' | 'massage' | 'medspa' | 'fitness' | 'pt' | 'custom';

interface TenantConfig {
  verticalProfile: VerticalProfile;
  features: {
    classes: boolean;
    pickASpot: boolean;
    soapNotes: boolean;
    protectedRecords: boolean;
    formulas: boolean;
    beforeAfterPhotos: boolean;
    intakeForms: boolean;
    productRetail: boolean;
    memberships: boolean;
    packages: boolean;
    commissions: boolean;
    therapistEta: boolean;
    roomResources: boolean;
  };
  requiredClientFields: ('firstName' | 'lastName' | 'email' | 'phone' | 'dateOfBirth' | 'emergencyContact')[];
}
```

Vertical profile presets are declarative configuration in code — not database rows — so the engineering team owns the defaults. Customers can customize after provisioning.

### 2.4 Booking Engine Neutrality

The booking engine operates on two primitive types: **Appointment** (1:1 or 1:many with a specific client) and **ClassOccurrence** (N:1 with many clients registering into finite capacity). Every vertical is expressible as combinations of these two primitives. The scheduling engine does not know what vertical it is serving.

---

## PART 3 — System Architecture {#part-3}

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                       CLIENT CHANNELS                                │
│  Consumer Web · Staff Web · Mobile (PWA) · Widgets · Kiosk          │
└────────┬──────────────┬──────────────┬──────────────┬──────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    EDGE LAYER (Fastify + CDN)                        │
│  Auth · Rate Limiting · Request Routing · Static Asset Serving      │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│ CORE PLATFORM  │   │ PUBLIC API     │   │ WEBHOOK        │
│ (Modular       │   │ GATEWAY        │   │ SERVICE        │
│  Monolith)     │   │                │   │                │
└───────┬────────┘   └───────┬────────┘   └───────┬────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    EVENT BUS (Redis Streams / Kafka)                 │
└──┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┘
   │          │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼          ▼
┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────────┐
│ SMS  │  │Email │  │Data  │  │Search│  │AI    │  │External  │
│Worker│  │Worker│  │Sync  │  │Index │  │Jobs  │  │Integra-  │
│      │  │      │  │      │  │      │  │      │  │tions     │
└──────┘  └──────┘  └──────┘  └──────┘  └──────┘  └──────────┘
```

### 3.2 Service Boundaries

The MVP ships as a **modular monolith** — one deployable application with strict internal module boundaries. Each module owns its domain tables, exposes a typed internal API, and emits events via the shared bus. Services get extracted only when a specific scaling or deployment need forces the split.

| Module | Responsibility | Owns tables |
|---|---|---|
| `auth` | Tenancy, users, sessions, RBAC | `tenants`, `users`, `sessions`, `role_assignments` |
| `catalog` | Services, classes, pricing, resources | `services`, `class_templates`, `resources`, `price_lists` |
| `scheduling` | Availability, appointments, class occurrences, waitlists | `appointments`, `class_occurrences`, `registrations`, `availability_rules`, `waitlist_entries` |
| `clients` | Client records, relationships, tags, preferences | `clients`, `client_relations`, `client_tags`, `client_notes` |
| `payments` | Carts, sales, payment intents, ledger, payouts, refunds | `carts`, `sales`, `payment_intents`, `ledger_entries`, `payouts`, `refunds` |
| `memberships` | Memberships, packages, gift cards, entitlements | `memberships`, `packages`, `gift_cards`, `entitlement_usage` |
| `inventory` | Products, SKUs, stock movements | `products`, `skus`, `stock_movements` |
| `staff` | Staff profiles, roles, schedules, time clock, commission rules | `staff_members`, `staff_schedules`, `time_entries`, `commission_rules` |
| `forms` | Form definitions, submissions, waivers, SOAP notes, builder, templates | `form_definitions`, `form_submissions`, `form_assignments`, `waivers`, `soap_notes`, `soap_note_revisions` |
| `automations` | Flow definitions, runs, schedules, n8n bridge | `automation_flows`, `automation_runs`, `automation_api_keys` |
| `marketing` | Campaigns, audience segments, review prompts | `campaigns`, `audience_segments`, `review_requests` |
| `notifications` | Outbound message orchestration, templates, delivery tracking | `notification_templates`, `message_dispatches`, `message_deliveries` |
| `files` | Files, photos, protected imagery | `files`, `protected_files` |

### 3.3 Deployment Topology

| Environment | Purpose | Infra |
|---|---|---|
| Local | Developer workstations | Docker Compose: Postgres, Redis, MinIO, MailHog |
| CI | Automated tests | Ephemeral containers per PR (GitHub Actions) |
| Staging | Pre-prod verification | 1 DigitalOcean Droplet (4 vCPU / 8 GB / 80 GB), Managed Postgres dev tier, self-hosted Redis on Droplet |
| Production | Live | 1 DigitalOcean Droplet (4 vCPU / 8 GB / 80 GB) at MVP, Managed Postgres with daily backups, Managed Redis in Growth phase, Spaces for file storage |

Full deployment infrastructure — Droplet provisioning, reverse proxy, process manager, CI/CD — is specified in PART 12. The important architectural constraint: **the MVP is single-Droplet, but the app is written stateless** so scaling to a Load Balancer + multi-Droplet pool in Growth phase is a configuration change, not a rewrite.

### 3.4 Data Flow — Booking Example

An end-to-end appointment booking exercises most of the architecture. This flow is the reference for any new feature that touches scheduling.

1. Consumer submits booking via widget → Edge layer validates and routes to `scheduling` module
2. `scheduling` consults `catalog` for service rules and `staff` for availability
3. `scheduling` writes `appointment` row with status `pending_payment`
4. `scheduling` calls `payments` to create a `payment_intent` (deposit or card-on-file)
5. On payment confirmation webhook from Stripe, `payments` updates the intent and emits `payment.succeeded`
6. `scheduling` listens for `payment.succeeded`, flips appointment to `confirmed`, emits `appointment.confirmed`
7. `notifications` worker listens for `appointment.confirmed` and dispatches SMS (TextLink) + email (Resend)
8. `data-sync` worker listens for the same event and writes to the analytics warehouse
9. Public webhook service listens for the same event and delivers to subscribed external developers

Every step is idempotent. Every event carries a unique ID. No step writes to another module's tables directly.

---

## PART 4 — Canonical Domain Model {#part-4}

### 4.1 Entity Relationship Overview

The domain model below is the minimum viable schema for a serious multi-vertical platform. Every entity has `id`, `tenant_id`, `created_at`, `updated_at`, and soft-delete `deleted_at`. Tenant isolation is enforced at the repository layer via Postgres row-level security policies.

**ID format.** Prefer UUID v7 (time-sortable, native support in Drizzle and recent Postgres driver ecosystems) for all primary keys. UUID v7 dramatically improves index locality for time-series tables like `appointments`, `ledger_entries`, `message_dispatches`, and `events`. If the team ships on Prisma/Supabase where v7 is not first-class, `gen_random_uuid()` (v4) is acceptable for MVP — migrate the high-write time-series tables to v7 before Growth phase when the index fragmentation cost becomes visible.

```
Tenant
 └── Brand
      └── Location
           ├── StaffMember ── RoleAssignment ── Role ── Permission
           ├── Resource (room, chair, equipment)
           ├── Service ─────────┐
           ├── ClassTemplate ─┐ │
           │                  │ │
           │                  ▼ ▼
           ├── ClassOccurrence ── Registration ── Client
           ├── Appointment ────────────────────── Client
           │    └── WaitlistEntry
           ├── Sale ── LineItem ── (Service | Product | Membership | Package | GiftCard)
           │    └── PaymentIntent ── LedgerEntry
           ├── Membership ── MembershipUsage
           ├── Package ── PackageUsage
           ├── Product ── Sku ── StockMovement
           ├── CommissionRule ── CommissionAccrual
           ├── FormDefinition ── FormSubmission
           └── SoapNote (protected) ── ProtectedFile

Client
 ├── ClientRelation (household/family linking)
 ├── ClientTag
 ├── PaymentMethod (tokenized via Stripe)
 ├── Note
 └── CommunicationPreference
```

### 4.2 Critical Entities — Field Specifications

Only the fields that matter for cross-module correctness are listed. Full schema lives in migrations.

**Appointment**

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key (v7 preferred, v4 acceptable — see 4.1) |
| `tenant_id` | UUID | RLS enforcement |
| `location_id` | UUID | — |
| `client_id` | UUID | — |
| `staff_member_id` | UUID | Primary provider |
| `service_id` | UUID | — |
| `resource_id` | UUID nullable | Room or equipment |
| `status` | enum | `pending_payment`, `confirmed`, `checked_in`, `in_progress`, `completed`, `no_show`, `cancelled` |
| `starts_at` | timestamptz | Always UTC |
| `ends_at` | timestamptz | Always UTC |
| `timezone` | text | IANA zone; used for display and recurrence math |
| `duration_minutes` | int | Denormalized for reporting |
| `price_cents` | int | Locked at booking time |
| `deposit_cents` | int nullable | — |
| `cancellation_policy_id` | UUID | — |
| `notes` | text nullable | Internal staff notes |
| `client_notes` | text nullable | Client-facing booking notes |
| `source` | enum | `consumer_web`, `staff_web`, `widget`, `api`, `import` |
| `idempotency_key` | text unique nullable | For retry-safe creation |

**Ledger Entry** — double-entry, append-only, never mutated

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | v7 preferred (append-only time-series table) |
| `tenant_id` | UUID | — |
| `entry_type` | enum | `sale`, `refund`, `adjustment`, `payout`, `fee` |
| `account` | enum | `revenue`, `liability`, `cash`, `processor`, `gift_card`, `membership_deferred` |
| `direction` | enum | `debit`, `credit` |
| `amount_cents` | int | Always positive; direction conveys sign |
| `currency` | text | ISO 4217 |
| `reference_type` | text | `sale`, `refund`, `payment_intent` |
| `reference_id` | UUID | Foreign key into originating domain |
| `occurred_at` | timestamptz | — |

### 4.3 Modeling Decisions That Matter

These decisions are the ones most likely to cause expensive rewrites if gotten wrong. They are non-negotiable.

1. **All timestamps stored as `timestamptz` in UTC.** Timezone is a display concern, stored separately. Recurrence rules store IANA zone; every expansion is computed fresh.
2. **Money is stored as integer cents with a currency code.** Never float. Never decimal without explicit scale.
3. **Ledger is append-only double-entry.** Refunds create new entries; they do not mutate originals. This is the only way to survive disputes and audits.
4. **Soft delete via `deleted_at` with partial indexes.** Every primary entity is soft-deletable. Indexes are partial (`WHERE deleted_at IS NULL`) so queries stay fast.
5. **Tenant isolation via row-level security.** Every table has a `tenant_id` column and an RLS policy. The application sets `SET LOCAL app.tenant_id = ...` at the start of every request transaction.
6. **Protected records live in a separate schema.** `protected.*` tables have stricter audit logging, encryption at rest beyond the default, and distinct backup/retention policies.
7. **Client identity spans locations.** A client under one brand can book at any location in that brand. Cross-brand identity is not shared without explicit merge.
8. **Idempotency keys on all mutating public API endpoints.** Stored in a dedicated `idempotency_keys` table with the response payload, TTL 24 hours.

### 4.4 Multi-Location Hierarchy

```
Tenant (billing boundary)
  └── Brand (marketing/identity boundary — default 1)
       └── Location (operational boundary — where bookings happen)
            └── StaffMember, Resource, Appointment, etc.
```

Most SMB customers will have one brand with one location. Enterprise and franchise customers may have many brands each with many locations. The hierarchy exists from day one; we bill on `tenant_id`, scope data on `location_id`, and roll up reports at `brand_id`.

---

## PART 5 — Core Module Specifications {#part-5}

This section specifies each core module's responsibilities, key algorithms, and MVP vs. full-platform scope.

### 5.1 Scheduling Engine

**Responsibilities.** Service and class availability computation, appointment creation/modification/cancellation, class registration, waitlist management, recurring appointment expansion, resource allocation.

**Key algorithm — availability computation.** Given a tenant, location, service, date range, and optional staff filter, return bookable time slots. The computation must consider:

- Staff schedules (working hours) per `staff_schedule` rows
- Existing appointments that block the staff member
- Service duration + buffer time (before and after)
- Resource/room availability (if the service requires a specific resource)
- Tenant-wide blackout dates (holidays, closures)
- Location operating hours
- Minimum booking lead time and maximum booking horizon

Implemented as a pure function over denormalized snapshots. Cache for 60 seconds keyed by `(tenant_id, location_id, service_id, date)`. Invalidate on appointment write.

**MVP scope.** Appointments with staff + service + optional resource. Recurring series via RRULE expansion. Cancellation with policy enforcement. Waitlist as ordered queue with manual promotion.

**Full-platform scope.** Class templates → occurrences with capacity. Pick-a-spot reserved seating. Auto-promote from waitlist on cancellation. Multi-provider appointments (hair color with shampoo assistant).

### 5.2 Client CRM

Client records are where this product either wins or loses against incumbents. The research on Mindbody, Vagaro, and GlossGenius is consistent: every competitor has converged on roughly the same capability set, and every competitor has at least one painful gap — SOAP notes behind a paid add-on (GlossGenius Platinum only), formulas buried under a separate subscription (Vagaro Forms), pop-up alerts missing at the wrong moments, or clinical files siloed from the booking flow. Our rebuild ships every primary capability in the MVP client record, with the advanced medspa capabilities gated behind the protected-data partition.

**Responsibilities.** Client profile CRUD, structured notes across multiple categories, pop-up alerts that fire during booking and checkout, photos and file attachments, SOAP notes linked to appointments, tags, visit history, household/family relations, communication preferences, saved payment methods (tokenized), banned-client flag, pre-appointment briefing delivery to staff.

#### 5.2.1 Client Profile Fields

The `clients` table schema carries the standard identity fields plus operational attributes. Extended data (notes, photos, formulas, forms, SOAP notes) lives in related tables for performance and access-control reasons.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | UUID | yes | v7 preferred |
| `tenant_id` | UUID | yes | RLS enforcement |
| `first_name` | text | yes | — |
| `last_name` | text | yes | — |
| `preferred_name` | text | no | Displayed in staff UI when present |
| `pronouns` | text | no | Optional; populated from intake form |
| `email` | text | no | Not unique at DB level (see 4.3) |
| `phone` | text | no | E.164 format |
| `phone_alternate` | text | no | — |
| `date_of_birth` | date | no | Required for medspa vertical; optional elsewhere |
| `address` | jsonb | no | Structured address object |
| `emergency_contact` | jsonb | no | `{ name, relationship, phone }` |
| `referral_source` | text | no | Populated from booking flow "How did you hear about us?" |
| `occupation` | text | no | Useful context for injectors, trainers |
| `status` | enum | yes | `active` \| `inactive` \| `banned` \| `deceased` |
| `banned_reason` | text | no | Required when `status = 'banned'`; surfaced to staff |
| `preferred_staff_member_id` | UUID | no | Default provider for this client |
| `communication_preferences` | jsonb | yes | SMS opt-in, email opt-in, marketing opt-in, reminder channel preference |
| `first_visit_at` | timestamptz | no | Set on first completed appointment |
| `last_visit_at` | timestamptz | no | Set on every completed appointment |
| `total_visits` | int | yes | Denormalized counter; rebuilt nightly as a reconciliation check |
| `lifetime_value_cents` | bigint | yes | Denormalized; rebuilt nightly |
| `tags` | — | — | Separate `client_tags` + `client_tag_assignments` tables |

**Protected fields (medspa vertical only, `protected.*` schema):**

| Field | Type | Notes |
|---|---|---|
| `height_cm`, `weight_kg` | int | Optional clinical measurements |
| `allergies_structured` | jsonb | Normalized allergies (see 5.2.2) in addition to free-text allergy notes |
| `medications_structured` | jsonb | Current medications with dose and frequency |
| `conditions_structured` | jsonb | Active medical conditions |
| `last_soap_at` | timestamptz | Most recent SOAP note — drives the "clinical overdue" alert |

The protected fields are strictly medspa/clinical. A salon tenant does not see these fields in the UI and does not have them in their `clients` rows. The partition is schema-level, not feature-flag-level.

#### 5.2.2 Structured Notes Model

Notes are not one free-text field. Every competitor has learned this lesson painfully. Notes live in a typed `client_notes` table with categories, visibility, priority, and appointment linkage.

```sql
CREATE TABLE client_notes (
  id                    UUID PRIMARY KEY,
  tenant_id             UUID NOT NULL,
  client_id             UUID NOT NULL,
  category              TEXT NOT NULL,       -- see enum below
  priority              TEXT NOT NULL,       -- 'normal' | 'alert'
  title                 TEXT NULL,           -- optional short label shown in lists
  body                  TEXT NOT NULL,
  appointment_id        UUID NULL,           -- set when note was captured during an appointment
  service_id            UUID NULL,           -- set when note applies to a specific service (e.g., formula)
  author_staff_id       UUID NOT NULL,
  visibility            TEXT NOT NULL,       -- 'location' | 'provider_only' | 'subcontractor_scoped'
  alert_triggers        TEXT[] NOT NULL DEFAULT '{}',  -- zero or more of: 'booking', 'checkout', 'check_in'
  pinned                BOOLEAN NOT NULL DEFAULT FALSE, -- pinned notes surface in pre-appointment briefing
  expires_at            TIMESTAMPTZ NULL,    -- temporary notes (e.g., "out of town until X") auto-archive
  archived_at           TIMESTAMPTZ NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX client_notes_active_idx ON client_notes (client_id, category)
  WHERE archived_at IS NULL AND (expires_at IS NULL OR expires_at > NOW());

CREATE INDEX client_notes_alert_idx ON client_notes (client_id, priority)
  WHERE priority = 'alert' AND archived_at IS NULL;
```

**Note categories (seeded defaults; tenants can add custom categories):**

| Category | Purpose | Typical content |
|---|---|---|
| `general` | Everyday operational notes | "Always arrives 10 min early", "Prefers lavender oil" |
| `preference` | Service preferences | "Hates back massage", "Cold water only for shampoo" |
| `formula` | Service-specific recipe/formula | "Wella 6N + 20 vol, 35 min processing" |
| `allergy` | Known allergies | "Nut oil sensitivity", "Reacts to nickel" |
| `medical` | Non-clinical health context | "Has lower back pain — avoid prone position" |
| `clinical` | Clinical note (medspa vertical only, stored in `protected.*`) | Protected partition — see 5.2.7 |
| `behavioral` | Behavioral notes staff should know | "Has made inappropriate comments in past — double-provider required" |
| `billing` | Billing and payment context | "Prefers to tip in cash", "Has outstanding balance" |
| `relationship` | Personal context for rapport | "Daughter's name is Sam", "Recently divorced — be thoughtful" |
| `internal` | Private staff-only notes | "Difficult client — handle with care" |

**Category behavior matrix:**

| Category | Default priority | Default alert triggers | Default visibility | Subcontractor visible? |
|---|---|---|---|---|
| `general` | normal | none | location | ✓ only on their own clients |
| `preference` | normal | none | location | ✓ only on their own clients |
| `formula` | normal | check_in | location | ✓ only on their own clients |
| `allergy` | alert | booking, check_in, checkout | location | ✓ always (safety-critical) |
| `medical` | alert | booking, check_in | location | ✓ always (safety-critical) |
| `clinical` | alert | check_in | provider_only | — (protected partition) |
| `behavioral` | alert | booking | location | ✓ always (safety-critical) |
| `billing` | normal | checkout | location | ✓ only on their own clients |
| `relationship` | normal | none | location | ✓ only on their own clients |
| `internal` | normal | none | location | ✓ only on their own clients |

Staff can override defaults when creating or editing a note — any category can be marked `alert` priority, and any note can have custom alert triggers.

#### 5.2.3 Pop-up Alerts — The Critical Moments

The research on Vagaro's pop-up alerts identified three moments where a note surfacing unprompted prevents real mistakes: at booking, at check-in, and at checkout. Our implementation fires alerts at the same three moments plus during appointment detail rendering.

**Alert-fire moments and their UX:**

1. **Booking (staff-initiated).** When staff selects a client in the appointment creation flow, any note with `priority = 'alert'` and `'booking' IN alert_triggers` renders as a modal before the booking form accepts input. Staff must acknowledge (click "I've seen this") to proceed. Acknowledgment is logged with staff ID and timestamp.
2. **Check-in.** When staff marks an appointment as `checked_in`, any alert note with `'check_in' IN alert_triggers` renders as a modal. Same acknowledgment requirement.
3. **Checkout.** When the checkout cart is opened, any alert note with `'checkout' IN alert_triggers` renders in a sidebar that persists until the sale completes. Acknowledgment logged.
4. **Appointment detail view.** Every time a staff member opens an appointment detail, a summary strip at the top of the view surfaces all alert notes for that client, regardless of trigger configuration. Not modal — visible but non-blocking.

**Safety-critical alert categories fire even for subcontractors on other providers' clients.** If a subcontractor is somehow viewing a shared client record (explicit referral, household linkage), allergy, medical, and behavioral alert notes surface. The general subcontractor isolation model in 5.4.1 still prevents them from seeing the full client record, but the alert itself fires. Safety overrides isolation.

**Alert acknowledgment audit.**

```sql
CREATE TABLE client_note_acknowledgments (
  id                UUID PRIMARY KEY,
  tenant_id         UUID NOT NULL,
  note_id           UUID NOT NULL,
  staff_member_id   UUID NOT NULL,
  acknowledged_at   TIMESTAMPTZ DEFAULT NOW(),
  trigger_context   TEXT NOT NULL,    -- 'booking' | 'check_in' | 'checkout' | 'manual'
  appointment_id    UUID NULL         -- when ack happened during an appointment context
);
```

In a liability dispute, the acknowledgment log is the evidence that staff was made aware of a known allergy or behavioral flag before the incident. This matters.

#### 5.2.4 Photo and File Attachments

Every client record can have attached files organized into folders. The folder taxonomy is tenant-editable; the MVP seeds the following folders:

- **Before/After** — service outcome imagery
- **ID & Documents** — photo ID, gift card receipts, etc.
- **Intake Forms** — completed form PDFs (also accessible from the form submissions view)
- **Consent & Waivers** — signed waivers
- **Clinical Imaging** (medspa only, protected partition) — treatment area photos
- **References** — style references, inspiration photos uploaded by client at booking time

```sql
CREATE TABLE client_files (
  id                 UUID PRIMARY KEY,
  tenant_id          UUID NOT NULL,
  client_id          UUID NOT NULL,
  folder             TEXT NOT NULL,
  file_name          TEXT NOT NULL,
  mime_type          TEXT NOT NULL,
  size_bytes         bigint NOT NULL,
  storage_path       TEXT NOT NULL,          -- DigitalOcean Spaces path
  thumbnail_path     TEXT NULL,              -- for image files
  appointment_id     UUID NULL,              -- linked to appointment when relevant
  service_id         UUID NULL,              -- linked to service (e.g., color formula reference)
  tags               TEXT[] NOT NULL DEFAULT '{}',
  uploaded_by_staff  UUID NULL,              -- NULL when uploaded by client
  uploaded_by_client BOOLEAN NOT NULL DEFAULT FALSE,
  visibility         TEXT NOT NULL,          -- 'location' | 'provider_only'
  protected          BOOLEAN NOT NULL DEFAULT FALSE,  -- if true, stored in protected Spaces bucket
  uploaded_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX client_files_folder_idx ON client_files (client_id, folder);
```

**Image-specific capabilities:**

- Thumbnails generated on upload by a BullMQ `image-processor` worker. 2× retina at 200×200 for list views.
- EXIF data stripped on upload — client-uploaded photos do not leak location metadata.
- Tagging images with free-form labels for searchable history ("acne treatment week 3", "before balayage").
- Side-by-side before/after comparison view in the client record for any two images in the Before/After folder.

**File upload paths:**

- **Staff upload** — drag-and-drop or tap-to-upload in the staff app.
- **Client upload during booking** — the booking flow offers an optional "Attach reference photo" step for services that benefit (color, style, tattoo, medspa consultations).
- **Client upload via form submission** — intake forms can include file-upload fields that attach directly to the client record.

**Storage.** Spaces bucket separation: `app-prod-uploads` for regular files, `app-prod-protected` for medspa/clinical imagery (separate encryption key, stricter access logging, shorter presigned URL TTLs).

#### 5.2.5 SOAP Notes

SOAP notes are a specialized note form used in wellness, therapy, and medspa verticals. Every SOAP note is linked to a specific appointment and stored in the standard four-field format: Subjective, Objective, Assessment, Plan. MVP ships basic SOAP note entry; the templated/advanced SOAP forms (anatomy chart overlays, treatment area mapping, macros) are a Growth-phase addition.

```sql
CREATE TABLE soap_notes (
  id                   UUID PRIMARY KEY,
  tenant_id            UUID NOT NULL,
  client_id            UUID NOT NULL,
  appointment_id       UUID NOT NULL,        -- every SOAP note is tied to an appointment
  author_staff_id      UUID NOT NULL,
  subjective           TEXT NULL,
  objective            TEXT NULL,
  assessment           TEXT NULL,
  plan                 TEXT NULL,
  additional_notes     TEXT NULL,            -- free-form "anything else" field
  template_id          UUID NULL,            -- references a custom template in Growth phase
  icd_codes            TEXT[] NOT NULL DEFAULT '{}',  -- medspa/therapy only
  cpt_codes            TEXT[] NOT NULL DEFAULT '{}',
  locked               BOOLEAN NOT NULL DEFAULT FALSE, -- once locked, creates a new revision on edit
  locked_at            TIMESTAMPTZ NULL,
  locked_by_staff      UUID NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Revision history for edits to locked notes
CREATE TABLE soap_note_revisions (
  id                   UUID PRIMARY KEY,
  note_id              UUID NOT NULL,
  revision_number      INT NOT NULL,
  subjective           TEXT NULL,
  objective            TEXT NULL,
  assessment           TEXT NULL,
  plan                 TEXT NULL,
  additional_notes     TEXT NULL,
  revised_by_staff     UUID NOT NULL,
  revision_reason      TEXT NOT NULL,
  revised_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (note_id, revision_number)
);
```

**Locking behavior.** A SOAP note can be edited freely until it is explicitly locked (manually by the author, or automatically at 72 hours post-appointment for medspa tenants). After locking, edits are not destructive — they write a new revision row preserving the full history. This is a compliance requirement for medspa and therapy verticals.

**Partition.** SOAP notes for medspa tenants live in `protected.soap_notes`, not the general `soap_notes` table. The table structure is identical; the RLS policies and encryption-at-rest keys differ.

**MVP scope for SOAP notes.** Free-form four-field entry, revision history, lock/unlock, ICD/CPT code capture. No templates, no anatomy charts — those are Growth.

#### 5.2.6 Pre-Appointment Briefing

GlossGenius's "client history is sent to you before every appointment so you never miss an important detail" framing is a real UX win that costs almost nothing to replicate. We implement it two ways.

**In-app briefing (staff calendar view).** Tapping an appointment in the staff schedule opens a briefing card that surfaces, in order:

1. All alert-priority notes for this client (allergy, medical, behavioral)
2. Pinned notes (`pinned = true`)
3. The most recent SOAP note (collapsed; tap to expand)
4. Formula notes tagged to this specific service
5. Relevant photos from Before/After folder for this service
6. Last 3 visits with dates, services, providers, and tip amount
7. Lifetime value, total visits, first-visit date (context for relationship tenure)

**Pushed briefing (SMS or email, opt-in per staff).** For providers who prefer a heads-up before their workday, a daily briefing SMS or email fires at a configurable time (default 7pm the night before) summarizing their next day's appointments with the alert-level content for each. This uses the TextLink SIM routing rule 2 (staff-sourced, see 8.6). Fresh alert notes created after the briefing was sent surface as supplementary alerts in-app.

#### 5.2.7 Visibility and Subcontractor Isolation

Client notes respect the subcontractor isolation model in 5.4.1, with safety-critical carve-outs:

| Note category | Employee provider sees | Subcontractor (on own client) | Subcontractor (on other staff's client, if somehow surfaced) |
|---|:---:|:---:|:---:|
| general, preference, formula, billing, relationship, internal | ✓ | ✓ | — |
| allergy, medical, behavioral (alert-priority) | ✓ | ✓ | ✓ (safety override) |
| clinical (protected) | ✓ if permitted | ✓ if own client | — |

**Protected-partition access control.** Clinical notes and clinical imaging in the `protected.*` schema are readable only by: the authoring provider, tenant admins with clinical-access role, and the client themselves (when we ship self-service clinical record access in Full Platform). Subcontractors never read other subcontractors' clinical notes, even on shared clients.

#### 5.2.8 Banned Client Handling

When `clients.status = 'banned'`:

- The client cannot self-book through the consumer booking portal. The attempt shows a generic error ("Please contact the business directly").
- Staff attempting to book for this client see a blocking modal with the `banned_reason` and require an owner/admin override to proceed.
- Cross-location behavior depends on the tenant's setting: single-location ban (default) vs. tenant-wide ban (Full Platform feature). Multi-brand tenants can scope to a single brand.
- Existing future appointments are not auto-cancelled — staff decides per-case.
- The ban is visible on every interaction with the client record (red banner on profile, strikethrough on name in lists).

#### 5.2.9 MVP vs. Later Scope

**MVP includes:** Full profile schema, all 10 standard note categories (excluding `clinical`), pop-up alerts at all three trigger moments with acknowledgment audit, photo and file attachments with folder organization and image thumbnails, client-uploaded photos during booking, basic SOAP notes (free-form four-field, linked to appointments, lockable, revision history), pre-appointment briefing (in-app + opt-in push), tags, banned client handling (single-location), visit history, household/family relations (basic), saved payment methods, referral source capture, communication preferences.

**Growth-phase additions:** Custom note categories, SOAP note templates with anatomy charts and macros, dual-signature consent forms, lead-pipeline stages, referral program with attribution, cross-location banned client enforcement, client-facing clinical record access, merge-duplicate-clients tooling, CSV import of historical client records (migration from Mindbody/Vagaro/GlossGenius).

**Full-platform additions:** Clinical note partition with HIPAA audit trail, ICD/CPT coding with payer claims export, before/after AI-assisted progress tracking, client-initiated record requests with audit, full household billing with shared memberships, referral partner revenue share tracking.

### 5.3 Payments & POS

**Responsibilities.** Cart assembly, checkout, tax calculation, payment intent management, refunds, deposits, no-show fees, late-cancellation fees, membership autopay, gift card redemption, ledger maintenance, provider abstraction.

See PART 9 for the multi-provider payments architecture — Stripe (platform default + BYO), Square, Clover, Authorize.net, Adyen, and custom webhook integrations. This module is the consumer of that architecture; it never talks to a payment processor directly, only through `PaymentsProvider` adapter interfaces.

**MVP scope.** Card-present and card-not-present via the provider abstraction. Deposits and no-show fees. Refunds with partial support. Tokenized cards on file. In-person support via Stripe Terminal (primary) and Clover Mini (supported). Cancellation / no-show policy engine (see 5.3.1). Stripe and Square adapters both ship in MVP; Clover and Authorize.net are Growth.

**Full-platform scope.** BNPL (Affirm, Afterpay, Klarna) via Stripe Payment Element and Square Afterpay. Tap to Pay on iPhone (Stripe-only). Split tender. Tip adjustment after close. Custom webhook escape hatch. Automated provider switching.

#### 5.3.1 Cancellation & No-Show Policy Engine

Every service has a cancellation policy attached. The policy is evaluated at two specific moments — appointment cancellation and appointment no-show — and may result in a fee being charged to the card on file. The engine is deterministic, auditable, and overrideable by staff.

**Policy fields on `services`:**

| Field | Type | Meaning |
|---|---|---|
| `cancellation_window_hours` | int | Hours before `starts_at` after which a cancellation counts as "late". `0` means no grace period. |
| `late_cancel_fee_cents` | int | Fee charged for cancellation inside the window. `0` means no fee. |
| `late_cancel_fee_pct` | numeric(5,2) nullable | Alternative: percentage of service price. Mutually exclusive with `late_cancel_fee_cents`. |
| `no_show_fee_cents` | int | Fee charged when appointment is marked `no_show`. `0` means no fee. |
| `no_show_fee_pct` | numeric(5,2) nullable | Alternative: percentage of service price. Mutually exclusive. |
| `require_card_on_file` | bool | If true, booking is blocked unless a card is saved. Required if either fee is nonzero. |

Policy fields can also be set at the `locations` level as defaults. Service-level values override location-level values. Tenant-level defaults exist in Full Platform; deferred in MVP.

**Evaluation — cancellation:**

```
When an appointment transitions confirmed → cancelled:
  1. Resolve effective policy (service > location)
  2. If no card on file → log "policy_not_enforceable", emit appointment.cancelled, done.
  3. Compute hours_until_start = starts_at - now()
  4. If hours_until_start >= cancellation_window_hours → no fee, emit appointment.cancelled, done.
  5. Otherwise, compute fee amount from late_cancel_fee_cents OR late_cancel_fee_pct * price_cents.
  6. If fee > 0 and staff_override is not set:
       a. Create PaymentIntent off_session against card on file.
       b. On success, write ledger entries, emit appointment.cancelled with fee_charged=true.
       c. On failure, emit appointment.cancelled with fee_failed=true. Handle per 5.3.2.
  7. Emit appointment.cancelled.
```

**Evaluation — no-show:** identical flow, triggered when status transitions `confirmed` or `checked_in` → `no_show`. `no_show_fee_cents` / `no_show_fee_pct` are used instead of late-cancel equivalents.

**Trigger model — who marks the status.**

| Trigger | Source | Policy evaluated |
|---|---|---|
| Client cancels via self-service link | Client web | Automatic |
| Client cancels by calling the business | Staff marks `cancelled` | Automatic, with staff override checkbox |
| Staff marks `no_show` | Staff action | Automatic, with staff override checkbox |
| System marks `no_show` after grace period | Scheduler (optional, off by default at MVP) | Deferred to Growth — MVP is manual only |

MVP explicitly ships **manual no-show marking only.** Automatic no-show state transitions are deferred because they add an entire class of disputes ("I was there, the staff just didn't check me in") before the product has a way to surface and resolve them.

**Staff override.** When a staff member is transitioning the status, the UI offers a "waive fee" checkbox. Exercising the override is recorded in the audit log with the staff member's ID and a required reason (free text, min 3 chars). Subcontractors cannot waive fees on their own appointments without owner/admin approval — this prevents self-dealing.

#### 5.3.2 Fee Charge Failure Handling

A `late_cancel_fee` or `no_show_fee` charge against a saved card can fail for several reasons (insufficient funds, expired card, card blocked, bank decline). The charge is attempted off-session, so strong-customer-authentication challenges (where applicable, such as SCA in Europe on Stripe) cannot be satisfied in the moment.

**Failure flow:**

1. The appointment status transition still completes. A cancelled appointment remains cancelled even if the fee fails.
2. The payment intent failure is recorded with the provider's native failure code (Stripe error code, Square error category, etc.) and a normalized `failure_reason` we map for reporting.
3. An `outstanding_balance` row is created on the client, referencing the appointment.
4. `notifications` dispatches an email to the client via Resend with a payment link (a hosted checkout page served by whichever provider the tenant is configured with — Stripe Checkout, Square hosted payment URL, etc.) for the outstanding amount.
5. Staff sees a balance-due indicator on the client profile until the amount is cleared.
6. Outstanding balances block future self-service booking until resolved. Staff can override at booking time.

**No-retry policy.** We do not automatically retry failed fee charges on a schedule. Retries are staff-triggered from the client profile. This is a deliberate choice: automatic retries on off-session charges against a card the bank has already declined produce chargebacks, not revenue.

**Dispute stance.** The provider-specific webhook handlers (Stripe `charge.dispute.created`, Square `dispute.created`, etc.) record every fee-charge dispute into a normalized `disputes` table. Our default stance on fee-related disputes is to concede — the cost of evidence-gathering exceeds the fee amount in nearly every case. Staff can override this per-tenant in Full Platform; MVP has a global concede-or-contest flag defaulting to concede. Actual dispute response happens in the provider's own dashboard (see 9.9).

### 5.4 Staff & Permissions

**Responsibilities.** Staff profiles, role assignments, permission checks, staff schedules, time clock, commission rules, employment-type isolation.

**RBAC model.** Roles are named bundles of permissions. Permissions are granular (`appointments.create`, `appointments.delete.own`, `reports.revenue.view`, etc.). A staff member has N role assignments scoped to N locations. The default roles seeded per tenant: `owner`, `admin`, `front_desk`, `provider`, `provider_limited`, `subcontractor`.

**Employment type is a first-class dimension, not a role name.** Every staff member has an `employment_type` attribute in addition to their role assignments. The two axes compose: a `provider` who is a `subcontractor` sees less than a `provider` who is an `employee`, even if both carry the same base permission set. This is enforced at three layers simultaneously (schema, API, UI) because any one layer alone is insufficient.

#### 5.4.1 Subcontractor Isolation Model

Subcontractors (1099 contractors, booth renters, chair renters, independent therapists) present a fundamentally different data-access pattern than employees. An employee `provider` at a location can see the full schedule, all clients served by the location, and location-wide reports. A subcontractor `provider` at the same location must see **only** their own appointments, only the clients they have personally served, and only their own earnings and payouts.

The distinction matters for legal, commercial, and product reasons. A booth-rent salon cannot legally expose its tenants' client lists to each other. A fitness studio renting a treatment room to an independent massage therapist cannot show that therapist other therapists' books. Getting this wrong is a privacy breach and a sales blocker.

**Staff schema additions:**

```sql
ALTER TABLE staff_members
  ADD COLUMN employment_type TEXT NOT NULL DEFAULT 'employee'
    CHECK (employment_type IN ('employee', 'subcontractor', 'booth_renter')),
  ADD COLUMN isolation_scope TEXT NOT NULL DEFAULT 'location'
    CHECK (isolation_scope IN ('location', 'self'));

-- Subcontractors and booth renters default to isolation_scope = 'self'.
-- Employees default to 'location'. The two fields are independent so a tenant
-- can have an employee with 'self' scope (rare) or a contractor with 'location'
-- scope (also rare, but possible for lead contractors).
```

**Row-level security — illustrative policies:**

```sql
-- Appointments: providers with isolation_scope='self' see only their own
CREATE POLICY appointments_scope ON appointments
  FOR SELECT
  USING (
    tenant_id = current_setting('app.tenant_id')::uuid
    AND (
      -- Admins and front desk see everything at their location
      current_setting('app.role') IN ('owner', 'admin', 'front_desk')
      -- Location-scope providers see all appointments at their location
      OR (
        current_setting('app.isolation_scope') = 'location'
        AND location_id = ANY(string_to_array(current_setting('app.location_ids'), ',')::uuid[])
      )
      -- Self-scope providers see only their own appointments
      OR (
        current_setting('app.isolation_scope') = 'self'
        AND staff_member_id = current_setting('app.staff_member_id')::uuid
      )
    )
  );

-- Clients: self-scope providers see only clients they have personally served
CREATE POLICY clients_scope ON clients
  FOR SELECT
  USING (
    tenant_id = current_setting('app.tenant_id')::uuid
    AND (
      current_setting('app.role') IN ('owner', 'admin', 'front_desk')
      OR current_setting('app.isolation_scope') = 'location'
      OR (
        current_setting('app.isolation_scope') = 'self'
        AND id IN (
          SELECT DISTINCT client_id FROM appointments
          WHERE staff_member_id = current_setting('app.staff_member_id')::uuid
            AND tenant_id = current_setting('app.tenant_id')::uuid
        )
      )
    )
  );
```

**API layer enforcement.** Every repository method accepts the requesting staff member's context (role, isolation scope, staff ID, location IDs). The repository issues `SET LOCAL app.isolation_scope = ...` at transaction start; RLS handles the rest. Endpoints do not hand-roll `WHERE` clauses for isolation — that path leads to the first breach.

**UI layer enforcement.** Navigation and controls are filtered by capability, not by data. A subcontractor does not see the "all appointments" tab, the "all clients" report, or the location-wide revenue dashboard. They see a personal schedule, their own client list, and their own earnings statement. The UI also suppresses features that would leak information through absence (e.g., a "location utilization" chart shown empty is itself a signal).

**Subcontractor scope — feature matrix:**

| Capability | Employee `provider` | Subcontractor `provider` |
|---|:---:|:---:|
| See own appointments | ✓ | ✓ |
| See other staff's appointments | ✓ | — |
| See location-wide calendar | ✓ | — |
| See own clients | ✓ | ✓ |
| See clients served by other staff | ✓ | — |
| See own earnings | ✓ | ✓ |
| See location revenue reports | ✓ | — |
| See inventory stock | read | — |
| Retail checkout | ✓ | own services only |
| Receive ETA messages to their clients | ✓ | ✓ |
| Receive day-before schedule digest | ✓ | ✓ (own schedule only) |
| Payout method | via location payroll | split-at-POS to subcontractor's own connected account (Stripe Connect sub-account, Square sub-merchant, etc. depending on tenant's active provider) |
| Commission / split | commission rule | revenue split at point of sale |

**Payout model.** Subcontractors are paid at point-of-sale, not via payroll. Each subcontractor has their own connected-account reference stored on `staff_members` (the concrete field is `provider_account_ref` with a companion `provider` enum so we know which processor the ref belongs to). When a sale is booked against a subcontractor, the `payments` module splits the charge via the active provider's native split mechanism — Stripe's `transfer_data` + `application_fee_amount`, Square's `app_fee_money` on `CreatePayment`, etc. The abstraction exposes a `createSplitCharge(primaryRef, splits[])` method; each adapter maps it to the provider-native primitives. If the tenant's active provider does not support splits (Authorize.net, custom webhook), subcontractors fall back to manual payroll on that configuration — the UI warns the tenant at provider-switch time. No manual payroll step is required when splits are supported.

**Audit requirement.** Every query issued under `isolation_scope = 'self'` is logged with the staff member's ID and the resulting row count. Quarterly, an automated report surfaces any subcontractor whose access patterns suggest they might be seeing data they should not (anomalous row counts, queries against tables they should never touch).

#### 5.4.2 Scope — MVP vs. Full Platform

**MVP scope.** Default roles including `subcontractor`, employment type field on staff, RLS policies enforcing self-scope on `appointments`, `clients`, `sales`, and reporting queries. Simple time clock (clock-in/clock-out, no breaks). Subcontractor payout via Stripe Connect split at point of sale.

**Full-platform scope.** Custom roles, commission rules with tiers for employees, payroll export formats (Gusto, Check, ADP, generic CSV) for employees, PTO accrual, 1099 generation for subcontractors at year-end.

### 5.5 Memberships & Packages

**Responsibilities.** Recurring-billing memberships, finite-use packages, gift cards, entitlement tracking, redemption logic.

**Entitlement model.** A purchase of a membership or package creates an `entitlement` — a bucket of credits or unlimited access of a given type. Each redemption writes an `entitlement_usage` row. Entitlements have expiration and rollover rules.

**MVP scope.** Fixed-price monthly memberships via Stripe Billing. Prepaid session packages with per-service credit counts. Gift cards with balance tracking.

**Full-platform scope.** Pause/resume memberships, membership tiers with automatic upgrade, shared-family entitlements, cross-location redemption.

### 5.6 Inventory & Retail

**Responsibilities.** Product catalog, SKU management, stock movements, retail checkout.

**MVP scope.** Product catalog with single-SKU products. Stock decrement on retail sale. Low-stock threshold alerts.

**Full-platform scope.** Multi-variant SKUs (size, color), purchase orders, receiving workflows, cycle counts, barcode scanning, Shopify headless sync for ecommerce.

### 5.7 Forms, Waivers, SOAP Notes

The form builder is a first-class product surface — not a utility sitting behind a setting. Every competitor has a form capability and each one has a specific weakness: GlossGenius's is tier-gated (Gold and above), Vagaro's sits behind a separate Forms subscription, Mindbody's relies heavily on third-party integrations (QuickerNotes, etc.) to deliver a usable experience. Ours ships a full no-code builder + template library in MVP, with advanced capabilities (conditional logic, media upload inside forms, dual-signature consent) following in Growth.

**Responsibilities.** Form definition and versioning, visual drag-and-drop builder, template library, field-type library, client-facing rendering, e-signature capture with audit evidence, service-linked required forms, magic-link delivery via email and SMS, PDF export and print, form analytics, SOAP note entry, integration with the client record.

#### 5.7.1 Magic-Link Security Model

Form links are first-party — the client taps a link in an SMS or email, lands on our domain, fills out the form, signs, and submits. No third-party redirect, no iframe embed, no email-to-web form bridge. That choice removes an entire class of failures but places the full security burden on our token design.

**Token format.**

```
https://forms.{tenant-domain}/fill/{token}

token = base64url(
  HMAC-SHA256(
    payload = "{tenant_id}.{form_assignment_id}.{issued_at}.{expires_at}"
    key = TENANT_SIGNING_KEY
  )
) + "." + base64url(payload)
```

The token is a signed envelope: payload + HMAC. No opaque random string alone — the payload carries the state we need so a compromised database row cannot be used to forge a valid token against a different tenant, and conversely a compromised signing key can be rotated without mass-invalidating in-flight links (we re-sign outstanding assignments).

**Why not JWT.** JWT would work, but the `alg: none` and algorithm-confusion vulnerability patterns in the JWT ecosystem are avoidable. A purpose-built HMAC envelope is less likely to be implemented wrongly. JWT is fine if the team already has battle-tested libraries; the contract is the same either way.

**Token lifetime.**

| Parameter | Default | Rationale |
|---|---|---|
| Default expiry | 7 days after issuance | Covers booking → appointment window for most cases |
| Maximum expiry | 30 days | Hard ceiling enforced at issuance |
| Post-submission validity | 0 (immediately invalid) | Single-use |
| Post-appointment validity | 24 hours after `starts_at` | Catches late intake in-room |

**Single-use enforcement.**

```sql
CREATE TABLE form_assignments (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  form_def_id     UUID NOT NULL,
  client_id       UUID NOT NULL,
  appointment_id  UUID NULL,
  token_hash      TEXT NOT NULL,        -- SHA-256 of token, for lookup
  issued_at       TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  opened_at       TIMESTAMPTZ NULL,     -- first GET
  submitted_at    TIMESTAMPTZ NULL,     -- form submission
  voided_at       TIMESTAMPTZ NULL,     -- explicitly cancelled
  voided_reason   TEXT NULL,
  CONSTRAINT single_use CHECK (submitted_at IS NULL OR voided_at IS NULL)
);

CREATE UNIQUE INDEX ON form_assignments (token_hash);
```

**Redemption sequence.**

1. **GET on `/fill/{token}`.** Validate HMAC. Look up `form_assignments` by `token_hash`. Reject if `submitted_at`, `voided_at`, or `expires_at <= now()` are set. On first valid GET, stamp `opened_at = now()` if null. Render the form.
2. **POST submit.** Re-validate everything from step 1. In a single transaction: insert `form_submissions` row, stamp `form_assignments.submitted_at = now()`, emit `form.submitted` event.
3. **Any subsequent GET or POST.** Rejected — form is single-use.

> **`used_at` on first load vs. on submit — why we chose submit.** A client who opens the link, loses connection, and reopens on a different device must be able to complete the form. Marking as "used" on first GET breaks this flow silently. We record `opened_at` for telemetry but bind single-use to `submitted_at`. A duplicate-submission attempt fails cleanly with a "form already submitted" page.

**Expired / invalid / used — client experience.**

| State | What the client sees | Recovery path |
|---|---|---|
| Token expired | "This form link has expired." Page shows appointment details if still upcoming, and a button: "Request a new link." | Clicking the button notifies the business and triggers a new `form_assignment` + SMS/email. |
| Token used (already submitted) | "You've already completed this form. Thank you." Shows submission timestamp. | No action needed. Staff can view submission in the portal. |
| Token invalid (HMAC mismatch) | Generic "Link not recognized" page. No details. | Contact business link displayed. Staff manually resends. |
| Appointment cancelled after link sent | "This booking has been cancelled." | No action. Link self-voids on `appointment.cancelled` event. |
| Client arrives without having filled the form | Staff sends a fresh link from the appointment detail screen; lands on the same flow. | Staff "resend form link" action generates a new assignment and invalidates the old one. |

**Staff resend flow.** When staff clicks "resend form link", the previous `form_assignments` row is voided (`voided_at` set, reason = `'superseded_by_staff_resend'`) and a new one is issued. This is an audit-visible event — we do not silently rotate tokens.

**Signature capture.** The signature field renders a canvas component. On submit, the canvas is rasterized to PNG at 2× retina, uploaded to object storage, and referenced by URL in the submission. Alongside the image we store: IP address, user agent, submission timestamp, token hash, form version hash. This bundle is the evidence packet if signature validity is ever challenged. See 5.7.6 for the full audit bundle schema.

**SOAP notes — protected path.** SOAP notes use the same form infrastructure but the `form_submissions` row lives in the `protected.*` schema with tighter RLS (only the authoring provider + tenant admins can read, never subcontractors of other providers). Clinical SOAP note forms (medspa) are Growth+; MVP ships basic free-form SOAP note entry (see 5.2.5) and standard intake/waiver forms.

#### 5.7.2 Form Definition Schema

Forms are JSON documents stored in `form_definitions` with explicit versioning. A form has a title, description, settings, and an ordered list of pages, each containing fields. A single-page form is still a valid form — the pagination exists so multi-page flows (common for medspa intake) don't require a schema change in Growth.

```sql
CREATE TABLE form_definitions (
  id                 UUID PRIMARY KEY,
  tenant_id          UUID NOT NULL,
  slug               TEXT NOT NULL,              -- human-readable identifier; used in URLs and references
  title              TEXT NOT NULL,              -- client-facing title
  description        TEXT NULL,                  -- client-facing description shown above first field
  category           TEXT NOT NULL,              -- 'intake' | 'waiver' | 'consent' | 'survey' | 'soap' | 'custom'
  vertical_tags      TEXT[] NOT NULL DEFAULT '{}', -- 'salon', 'massage', 'medspa', 'fitness' — helps filter template library
  settings           JSONB NOT NULL,             -- see below
  schema             JSONB NOT NULL,             -- the actual form definition (pages, fields, validation)
  version            INT NOT NULL DEFAULT 1,
  is_template        BOOLEAN NOT NULL DEFAULT FALSE, -- true for system-seeded templates
  parent_template_id UUID NULL,                  -- if cloned from a template, reference it
  published_at       TIMESTAMPTZ NULL,           -- null = draft
  archived_at        TIMESTAMPTZ NULL,
  created_by_staff   UUID NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, slug, version)
);

-- Submissions reference a specific version of a form; never the "current" form.
-- This is how we preserve the form as it existed when the client filled it out.
CREATE TABLE form_submissions (
  id                 UUID PRIMARY KEY,
  tenant_id          UUID NOT NULL,
  form_definition_id UUID NOT NULL,              -- always references a specific version
  form_version       INT NOT NULL,
  client_id          UUID NOT NULL,
  appointment_id     UUID NULL,
  assignment_id      UUID NULL,                  -- link back to form_assignments
  submitted_at       TIMESTAMPTZ DEFAULT NOW(),
  answers            JSONB NOT NULL,             -- { field_id: value, ... }
  signature_bundles  JSONB NULL,                 -- array of signature evidence bundles (5.7.6)
  pdf_cached_path    TEXT NULL,                  -- rendered PDF cached on first print/export request
  locked             BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX form_submissions_client_idx ON form_submissions (client_id, submitted_at DESC);
CREATE INDEX form_submissions_appointment_idx ON form_submissions (appointment_id) WHERE appointment_id IS NOT NULL;
```

**Form settings (JSONB):**

```typescript
interface FormSettings {
  delivery: {
    allowedChannels: ('email' | 'sms')[];     // which delivery methods tenant enables for this form
    defaultChannel: 'email' | 'sms';
    reminderSchedule: ReminderRule[];          // see 5.7.5
  };
  submission: {
    requireSignature: boolean;
    signatureFieldIds: string[];               // fields that must be signed
    dualSignature: boolean;                    // medspa — requires staff co-signature (Growth)
    oneTimeOnly: boolean;                      // vs. resubmittable
    expiresAfterDays: number | null;           // auto-archive submissions this old
  };
  triggers: {
    assignOnBooking: boolean;
    assignOnServiceIds: string[];              // services that require this form
    blockBookingUntilComplete: boolean;        // hard block vs. soft reminder
  };
  branding: {
    useCustomLogo: boolean;
    primaryColor: string | null;
    headerImage: string | null;
  };
  privacy: {
    protectedDataPartition: boolean;           // store in protected.* schema (medspa only)
    retentionDays: number | null;              // compliance-driven retention policy
  };
}
```

**Schema (JSONB) — form body structure:**

```typescript
interface FormSchema {
  pages: FormPage[];
}

interface FormPage {
  id: string;                                  // stable ULID, survives edits
  title: string | null;
  description: string | null;
  fields: FormField[];
  conditions?: VisibilityCondition[];          // Growth: page visible only if condition met
}

interface FormField {
  id: string;                                  // stable ULID
  type: FieldType;                             // see 5.7.3
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  defaultValue?: unknown;
  validation?: ValidationRule[];
  options?: FieldOption[];                     // for select/radio/checkbox
  config?: Record<string, unknown>;            // type-specific config
  conditions?: VisibilityCondition[];          // Growth: conditional logic
  prefillFrom?: 'client.email' | 'client.phone' | 'client.first_name' | 'client.last_name' | 'client.date_of_birth' | 'client.address';
}
```

**Versioning on edit.** Once a form has at least one submission, editing it creates a new version (`version += 1`, new row) rather than mutating the existing one. Submissions always reference the version they were filled under. This is a legal requirement for waivers and consent forms — the exact wording the client agreed to must be preservable indefinitely.

#### 5.7.3 Field-Type Library

The field library is the form builder's most visible surface. MVP ships 14 field types; Growth adds the more specialized ones. Every field type is implemented as a small React component that knows how to render itself in three modes: builder (drag-and-drop), filler (client-facing), and reader (staff view / PDF).

**MVP field types:**

| Type | Purpose | Config notes |
|---|---|---|
| `short_text` | Single-line text | `maxLength`, pattern validation |
| `long_text` | Multi-line text | `rows`, `maxLength` |
| `email` | Email address | Format validation |
| `phone` | Phone number | E.164 normalization on submit |
| `number` | Numeric | `min`, `max`, `step` |
| `date` | Date picker | `minDate`, `maxDate` (e.g., DOB range) |
| `select` | Dropdown single choice | `options` with `{ value, label }` |
| `radio` | Radio button group | Same as select, different rendering |
| `multi_checkbox` | Multiple checkboxes | Array answer |
| `yes_no` | Yes/No toggle | Rendered as paired buttons |
| `scale` | 1–5 or 1–10 rating | `range`, `labels` |
| `signature` | Canvas signature | Generates audit bundle (5.7.6) |
| `statement` | Read-only text block | No input, used for consent language and instructions |
| `section_header` | Visual section divider | Label + optional description |

**Growth-phase field types:**

| Type | Purpose | Why Growth |
|---|---|---|
| `file_upload` | Client uploads a file | Needs storage + virus scanning pipeline |
| `photo_upload` | Client takes or uploads photo | Mobile capture + EXIF strip + thumbnail |
| `initials` | Short-form signature (initials only) | Used for per-paragraph consent acknowledgment in medspa |
| `dual_signature` | Client + witness/staff signature | Medspa liability compliance |
| `drawing` | Anatomy-chart annotation | Treatment area marking for SOAP notes |
| `address_autocomplete` | Google Places address lookup | Requires third-party API integration |
| `conditional_group` | Fields shown only if condition met | Requires conditional-logic engine |
| `repeatable_section` | Repeat a field group N times | For "list all medications" style inputs |

**Validation rules (all MVP types):**

```typescript
type ValidationRule =
  | { type: 'required' }
  | { type: 'min_length'; value: number }
  | { type: 'max_length'; value: number }
  | { type: 'pattern'; value: string; message: string }
  | { type: 'min'; value: number }
  | { type: 'max'; value: number }
  | { type: 'min_date'; value: string }
  | { type: 'max_date'; value: number };
```

Validation runs both client-side (for UX) and server-side (for trust). The server is authoritative — client-side validation only exists to save the client a round-trip.

#### 5.7.4 Form Builder UX

The builder is a split-pane React app: left pane is the field library, center is the form canvas with drag-and-drop reordering, right is the field properties panel. Staff can preview the client-facing view at any time with a single toggle.

**Core builder interactions:**

- **Drag from library → drop on canvas** adds a new field at the drop position.
- **Drag field on canvas** reorders; cross-page drag moves the field between pages.
- **Click field on canvas** opens properties panel with type-specific config.
- **Duplicate field** copies with a fresh ULID.
- **Delete field** with confirmation; auto-voids in-flight form assignments that referenced the field.
- **Undo / redo** backed by a Zustand store; 50 steps of history.
- **Auto-save draft** every 10 seconds; published form is a separate action.
- **Version comparison** shows a visual diff against the previous published version.

**Keyboard shortcuts:**

| Shortcut | Action |
|---|---|
| `/` | Open field library search |
| `⌘Z` / `⌘⇧Z` | Undo / Redo |
| `⌘D` | Duplicate selected field |
| `Del` | Delete selected field |
| `↑` / `↓` | Move selection between fields |
| `⌘↑` / `⌘↓` | Reorder selected field |
| `P` | Toggle preview mode |
| `⌘S` | Save draft |
| `⌘⇧S` | Publish |

**Template library.** On first "New Form" the builder opens to a template picker, not a blank canvas. Templates seeded by vertical:

| Template | Category | Vertical |
|---|---|---|
| General Intake | intake | all |
| New Client Health History | intake | massage, medspa, fitness, pt |
| Massage Therapy Intake | intake | massage |
| Hair Consultation | intake | salon |
| Brow/Lash Consultation | intake | salon, medspa |
| Waxing Consent | waiver | salon, medspa |
| Medspa Procedural Consent | consent | medspa |
| Botox/Filler Consent | consent | medspa |
| Chemical Peel Consent | consent | medspa |
| Microneedling Consent | consent | medspa |
| General Liability Waiver | waiver | all |
| COVID Health Screening | intake | all |
| Injury History | intake | fitness, pt, massage |
| Pre-Workout Clearance | intake | fitness, pt |
| Post-Appointment Survey | survey | all |
| Cancellation Policy Acknowledgment | consent | all |

Each template is a real `form_definitions` row with `is_template = true` and tenant_id = NULL (system-scoped). Cloning a template creates a tenant-owned copy with `parent_template_id` set so future template updates can be offered as an optional merge.

**Custom templates.** A tenant can mark any of their own forms as a template for internal reuse (e.g., a multi-location tenant wants a standard intake across all locations). Same `is_template` flag, tenant-scoped.

#### 5.7.5 Distribution and Delivery

Forms reach clients through four channels. Every channel funnels into the same `form_assignments` row; the delivery method is a property of the assignment.

```sql
ALTER TABLE form_assignments ADD COLUMN delivery_channel TEXT NOT NULL;
-- 'email' | 'sms' | 'both' | 'in_person_kiosk' | 'booking_flow_inline'

ALTER TABLE form_assignments ADD COLUMN delivery_history JSONB NOT NULL DEFAULT '[]';
-- Array of { channel, sent_at, provider_message_id, delivery_status }
```

**Delivery channels:**

1. **Email.** Rendered via React Email template, sent via Resend. Contains a branded header image if the tenant configured one, plus the magic link button. The email subject defaults to `"{tenant name} — please complete: {form title}"` but is tenant-customizable.
2. **SMS.** Short message, typically under 160 characters, of the form: `"{tenant name}: Please fill out your {category} form before your appointment: {short_url}"`. Routed via TextLink per rule 4 (location default) unless the form was triggered by a specific staff member, in which case rule 2 applies (see 8.6). Short URLs live on `forms.{tenant-subdomain}.com` to keep under 160-char limits even with long form titles.
3. **In-person kiosk.** The staff app has a "Complete this form now" action that opens the form directly on a tablet the client uses on-site. The assignment is created with a much shorter expiry (2 hours) and no external URL is generated.
4. **Inline during booking.** For forms configured with `triggers.blockBookingUntilComplete = true`, the booking flow renders the form as a step in the booking process. No magic link needed — the client fills it out before the booking is confirmed.

**Reminder scheduling.** Forms can be configured to send follow-up reminders if the client hasn't submitted by a threshold.

```typescript
interface ReminderRule {
  triggerRelativeTo: 'assignment_sent' | 'appointment_start';
  offsetHours: number;                         // negative = before; positive = after
  channel: 'email' | 'sms' | 'both';
  templateSlug: string;                        // e.g., 'form.reminder.intake'
  stopIfSubmitted: true;                       // always true — no spam after submission
}
```

Defaults: first reminder 24 hours after sending (if not submitted), second reminder 4 hours before appointment. Tenants can add, remove, or replace rules per form.

**Reminder scheduling runs on BullMQ delayed jobs, not cron.** The `form-reminder-scheduler` enqueues all reminders at assignment-creation time; if the form gets submitted first, the worker reads state and no-ops. This matches the notification scheduling pattern in PART 8.

#### 5.7.6 PDF Export, Print, and Signature Audit Bundle

Every submitted form can be rendered as a PDF — for the client to keep, for staff to print, or for compliance exports.

**PDF rendering pipeline.**

1. On first request for a submission's PDF, the `pdf-render` BullMQ worker renders the form using Puppeteer (headless Chrome) against a dedicated React route (`/internal/render/submission/{id}`).
2. The route is authenticated with a short-lived internal token (not client-accessible).
3. Output is saved to Spaces (`app-prod-uploads` or `app-prod-protected` for medspa) and the path is cached in `form_submissions.pdf_cached_path`.
4. Subsequent requests stream the cached PDF directly.
5. On submission edits (if the form is unlocked and editable), the cached PDF is invalidated and re-rendered on next request.

**Why Puppeteer over a PDF library.** PDF libraries (pdfkit, pdfmake) require us to re-implement the form rendering from scratch in a PDF-specific layout engine. Puppeteer renders the exact same React components we use for the client-facing and staff-facing views — pixel-for-pixel consistent. The tradeoff is a heavier worker (Chromium is a large dependency); we accept that cost because correctness and consistency matter more than render speed for this workload.

**Print.** Staff clicks "Print" in the client record's form view; it opens the PDF in a browser print dialog. Same PDF as export.

**Signature audit bundle.** Every signature field in a submission produces a discrete audit bundle stored in `form_submissions.signature_bundles`:

```typescript
interface SignatureAuditBundle {
  fieldId: string;                             // which signature field
  imagePath: string;                           // Spaces path to the rasterized signature PNG
  imageSha256: string;                         // content hash for tamper detection
  capturedAt: string;                          // ISO 8601 with UTC offset
  tokenHash: string;                           // the form_assignments.token_hash at capture time
  formVersion: number;                         // the form version the client signed
  ipAddress: string;                           // IP the signature was submitted from
  userAgent: string;                           // full UA string
  geoHint?: { country?: string; region?: string }; // derived from IP; no precise geolocation
  deviceFingerprint?: string;                  // rough browser fingerprint; optional
}
```

**Signature evidence export.** In a liability dispute, staff can download a "signature evidence packet" for a submission — a ZIP containing: the PDF of the submitted form, the signature images, the audit bundle JSON, and a chain-of-custody log (when the form was sent, opened, submitted, and any edits). This is a Growth-phase feature; MVP exposes the fields in the UI but the ZIP export is deferred.

**Compliance retention.** Per `FormSettings.privacy.retentionDays`, submissions older than the retention period are either archived (moved to cold storage) or purged (deleted with a tombstone row). Medspa forms have a minimum 7-year retention floor enforced in code — staff cannot configure a shorter policy.

#### 5.7.7 Form Analytics

For every form, the staff admin surfaces:

- **Assignment volume** over time (sent per day/week)
- **Submission rate** (submitted / sent)
- **Median time-to-submit** (how long between send and submit)
- **Drop-off funnel** (opened but not submitted; submitted page 1 but not page 2, etc.)
- **Field-level friction** (which field had the most invalid-submission retries)

This isn't just vanity analytics — it's how tenants discover that "medical history" intake has a 30% drop-off rate and should be split into two pages. MVP ships the top four metrics; field-level friction is Growth (requires per-field telemetry we don't collect at MVP).

#### 5.7.8 Integration With Other Modules

Forms are not a silo — every relevant module reads from or writes to them.

| Module | Integration |
|---|---|
| Scheduling | Services with required forms block booking until the form is either assigned (soft) or completed (hard) depending on `settings.triggers.blockBookingUntilComplete` |
| Client CRM | Submissions appear in the client record; answer fields map to client profile fields when `prefillFrom` is set (and vice versa — name/phone/email from the client record auto-fill the form) |
| Notifications | Form magic links are dispatched through the notifications module with routing via TextLink's SIM resolver (8.6) |
| Automations (5.9) | `form.submitted` event is a trigger; form content can be used in conditions and actions |
| Payments | Forms can require a deposit before submission is accepted (medspa consent + payment combined flow — Growth) |

#### 5.7.9 MVP vs. Later Scope

**MVP includes.** Full no-code drag-and-drop builder; template library with 16 seeded templates across all verticals; 14 MVP field types including canvas signature; versioning with automatic version bump on edit-after-submission; magic-link distribution via email (Resend) and SMS (TextLink); in-person kiosk and inline-booking distribution; reminder scheduling via BullMQ; PDF export and print via Puppeteer; signature audit bundle captured and stored; basic form analytics (volume, submission rate, median time-to-submit); integration with scheduling, client CRM, notifications, automations; versioned `form_submissions` linked to a specific form version.

**Growth-phase additions.** File upload and photo upload fields; initials field; dual-signature consent (medspa); anatomy-chart drawing field; address autocomplete; conditional logic engine (`conditional_group`, page-level conditions, field-level visibility rules); repeatable sections; signature evidence packet ZIP export; field-level friction analytics; template merge offers when system templates update; clinical SOAP note templates with anatomy chart overlays.

**Full-platform additions.** ICD/CPT code fields with live lookup; payer integration for medspa; multi-language forms with translation workflow; dual signature with witness-role assignment; computed fields (calculations based on other field values); hidden fields populated from URL parameters (for pre-auth intake flows); HIPAA chain-of-custody export packets.

### 5.8 Notifications Module

See PART 8 for the full notification architecture. The module owns templates, dispatch records, delivery tracking, and opt-out state — it does not own the channel implementations (SMS via TextLink, email via Resend).

### 5.9 Automations Module

The automations module is a visual workflow builder that lets tenants create "when X happens, do Y after Z" rules without writing code. It sits on top of the event bus (PART 7) and the notifications module (PART 8), and bridges to n8n for complex flows that exceed the built-in capabilities.

The strategic reasoning is the same as the form builder's: every competitor has some automation surface (GlossGenius's AI marketing assistant, Vagaro's marketing automation, Mindbody's automated campaigns), and every one of them is limited in the same way — prebuilt flows only, no true branching, no custom triggers, no way to wire third-party tools in. Our approach is a proper visual flow builder for the 80% of use cases tenants will have, and an n8n escape hatch for the 20% that need deep integrations.

#### 5.9.1 Module Overview

**Responsibilities.** Automation definition and versioning, visual flow builder, trigger-condition-action engine, flow execution runtime, scheduling, retry and error handling, execution history and debugging, template library, n8n bridge (webhook outbound + webhook inbound), rate limiting, cost controls.

**Core concepts.**

- **Flow** — a tenant-authored automation. Has a trigger, zero or more conditions, and one or more actions. Stored as JSON, versioned.
- **Trigger** — the event that starts the flow. Can be a platform event (`appointment.confirmed`), a schedule (daily at 5pm), a manual button in staff UI, or a webhook.
- **Condition** — a boolean expression evaluated against the trigger payload and context. If false, the flow stops.
- **Action** — something the flow does: send an SMS, send an email, tag a client, add to a segment, call an n8n webhook, wait N hours, branch into sub-flows.
- **Run** — a single execution of a flow, triggered by a real event. Runs have status, logs, and retry state.

**Relationship to the event bus.** The automations engine is a first-class consumer of the internal event bus. Every platform event defined in the event catalog (Appendix B) is a valid trigger. New triggers can be added without changes to the automations engine itself — a trigger is just "this event type, filtered by this expression."

#### 5.9.2 Flow Definition Schema

```sql
CREATE TABLE automation_flows (
  id                 UUID PRIMARY KEY,
  tenant_id          UUID NOT NULL,
  slug               TEXT NOT NULL,
  title              TEXT NOT NULL,
  description        TEXT NULL,
  category           TEXT NOT NULL,              -- 'appointment' | 'client' | 'marketing' | 'operations' | 'custom'
  trigger            JSONB NOT NULL,             -- see below
  conditions         JSONB NOT NULL DEFAULT '[]',
  steps              JSONB NOT NULL,             -- ordered list of actions and branches
  settings           JSONB NOT NULL,             -- rate limits, retry policy, error handling
  version            INT NOT NULL DEFAULT 1,
  is_template        BOOLEAN NOT NULL DEFAULT FALSE,
  parent_template_id UUID NULL,
  enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  published_at       TIMESTAMPTZ NULL,
  archived_at        TIMESTAMPTZ NULL,
  created_by_staff   UUID NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, slug, version)
);

CREATE TABLE automation_runs (
  id                 UUID PRIMARY KEY,
  tenant_id          UUID NOT NULL,
  flow_id            UUID NOT NULL,
  flow_version       INT NOT NULL,
  trigger_event_id   TEXT NULL,                  -- event bus event that fired this run
  triggered_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at      TIMESTAMPTZ NULL,
  status             TEXT NOT NULL,              -- 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped_conditions' | 'cancelled'
  context            JSONB NOT NULL,             -- the trigger payload + enriched context
  step_results       JSONB NOT NULL DEFAULT '[]', -- per-step execution log
  error_message      TEXT NULL,
  retry_count        INT NOT NULL DEFAULT 0
);

CREATE INDEX automation_runs_flow_idx ON automation_runs (flow_id, triggered_at DESC);
CREATE INDEX automation_runs_status_idx ON automation_runs (tenant_id, status) WHERE status IN ('pending', 'running');
```

**Trigger JSONB structure:**

```typescript
type Trigger =
  | { type: 'event'; eventType: string; filter?: FilterExpression }
  | { type: 'schedule'; cron: string; timezone: string }
  | { type: 'manual'; staffRoles: string[] }     // "run this flow from a button in staff UI"
  | { type: 'webhook'; signingSecret: string }   // inbound webhook from third party
  | { type: 'n8n_callback'; secret: string };    // Growth — n8n-originated
```

**Steps JSONB structure:**

```typescript
type Step =
  | { type: 'action'; action: ActionSpec }
  | { type: 'condition'; if: FilterExpression; then: Step[]; else?: Step[] }
  | { type: 'wait'; durationSeconds: number }
  | { type: 'wait_until'; relativeTo: 'trigger' | 'appointment_start' | 'appointment_end'; offsetHours: number }
  | { type: 'parallel'; branches: Step[][] };    // Growth
```

**Action specs (MVP):**

| Action | Config |
|---|---|
| `send_sms` | `{ template: string, recipientPath: string, simId?: number }` |
| `send_email` | `{ template: string, recipientPath: string, subject?: string }` |
| `add_client_tag` | `{ clientIdPath: string, tagSlug: string }` |
| `remove_client_tag` | `{ clientIdPath: string, tagSlug: string }` |
| `add_client_note` | `{ clientIdPath: string, category: string, body: string }` |
| `create_task` | `{ assigneeStaffId: string, title: string, dueInHours: number }` |
| `assign_form` | `{ clientIdPath: string, formSlug: string, channel: 'email' \| 'sms' }` |
| `create_waitlist_entry` | `{ clientIdPath: string, serviceId: string }` |
| `n8n_webhook` | `{ webhookUrl: string, payload: Record<string, any> }` |
| `http_request` | `{ url: string, method: string, headers: Record<string, string>, body: any }` (Growth) |

**Condition expressions.** Conditions use a restricted expression language, not raw SQL or JavaScript. Safe by construction, easy to render back to the visual builder.

```typescript
type FilterExpression =
  | { op: 'and'; exprs: FilterExpression[] }
  | { op: 'or'; exprs: FilterExpression[] }
  | { op: 'not'; expr: FilterExpression }
  | { op: 'eq'; path: string; value: unknown }
  | { op: 'neq'; path: string; value: unknown }
  | { op: 'gt' | 'gte' | 'lt' | 'lte'; path: string; value: number | string }
  | { op: 'in'; path: string; values: unknown[] }
  | { op: 'contains'; path: string; value: string }
  | { op: 'has_tag'; clientIdPath: string; tagSlug: string }
  | { op: 'visit_count'; clientIdPath: string; compare: 'gt' | 'lt' | 'eq'; value: number };
```

`path` is a JSONPath-style accessor against the trigger context (e.g., `"appointment.service.category"`, `"client.tags"`).

#### 5.9.3 Execution Runtime

Flows execute on a dedicated `automation-runner` BullMQ worker pool. Every flow run is one top-level job; wait-steps re-enqueue with a delay; error retries use exponential backoff.

**Execution lifecycle.**

```
1. Event bus emits `{event_type}` → subscription matches one or more flows
2. For each matching flow:
     a. Create automation_runs row with status='pending'
     b. Evaluate conditions; if false → status='skipped_conditions', stop
     c. Enqueue automation-run-step job with step_index=0
3. Worker picks up step job:
     a. Load flow definition and run row
     b. Execute step N
     c. Record step result in step_results array (append-only)
     d. If step is action → execute action, advance to N+1
     e. If step is wait → enqueue delayed job for step N+1
     f. If step is condition → evaluate, branch, enqueue next applicable step
     g. On step failure → retry with exponential backoff (1min, 5min, 30min, 2h, park)
     h. On completion of last step → status='succeeded'
```

**Isolation and resource limits.** Flows run in the same process as other workers but with per-tenant rate limits enforced by Redis-backed token buckets:

- 100 flow runs per tenant per minute (soft limit; triggers alert)
- 1,000 flow runs per tenant per hour (hard limit; additional runs queue or drop based on tenant config)
- Individual actions inherit the rate limits of their underlying providers (SMS via TextLink, email via Resend)

**Error handling per step.**

```typescript
interface StepErrorPolicy {
  onError: 'retry' | 'continue' | 'stop_flow' | 'goto_step';
  retryMax: number;          // default 3
  retryBackoff: 'exponential' | 'linear';
  fallbackStepId?: string;    // for 'goto_step'
}
```

Default policy: `retry` with 3 attempts, exponential backoff, then `stop_flow` with alert to tenant admin.

#### 5.9.4 Visual Flow Builder UX

The builder is a canvas-based React app using React Flow for the graph rendering. Similar conceptual model to n8n, Zapier, Make: nodes for trigger, actions, conditions; edges connect them.

**Core builder interactions.**

- **Trigger node is always at the top**, single, cannot be deleted (only changed).
- **Action nodes are dragged from the right-side palette**, drop connects to the previous node.
- **Condition nodes create two branches** (true/false), each branch can have its own chain of actions.
- **Wait nodes** are visually distinct — hourglass icon, duration editable inline.
- **Inspector panel on the right** shows the selected node's config (template picker for SMS, recipient picker, etc.).
- **Test run** — staff can run a flow against a synthetic or real trigger and see step-by-step execution in real time.
- **Dry run** — execute the flow without performing side effects (send to a test SMS number, log email instead of sending). Critical for building flows safely.

**Template library.** Seeded automation templates for common use cases:

| Template | Trigger | Actions |
|---|---|---|
| Welcome new clients | `client.created` | Wait 1 hr → Send welcome email → Wait 48 hr → Assign intake form |
| Appointment reminder sequence | `appointment.confirmed` | Wait until appointment_start - 48h → Send SMS reminder → Wait until appointment_start - 2h → Send SMS reminder |
| No-show recovery | `appointment.no_show` | Wait 2 hr → Add client tag `no-show` → Send apology + rebook SMS |
| Post-appointment review request | `appointment.completed` | Wait 24 hr → Send review request SMS |
| Win-back inactive clients | Schedule (weekly) | Condition: last_visit > 90 days → Send reactivation email |
| Birthday offer | Schedule (daily at 9am) | Condition: client birthday is today → Send birthday SMS |
| Formula follow-up (salon) | `appointment.completed` + service is color | Wait 6 weeks → Send color maintenance reminder |
| Cancellation policy reminder | `appointment.confirmed` + service has cancel fee | Send confirmation with policy text included |
| Pre-appointment health check (medspa) | `appointment.confirmed` + service is medspa | Assign health history form |
| Follow-up for incomplete forms | `form.assignment.created` | Wait 24 hr → Condition: not submitted → Send reminder SMS |

Each template is a real `automation_flows` row with `is_template = true`, tenant_id = NULL. Cloning works identically to form templates.

#### 5.9.5 n8n Bridge

For complex flows that exceed the built-in capabilities — multi-step integrations with external tools, complex data transformations, branching across multiple external APIs — the tenant can escape to n8n. We do not replicate n8n; we bridge to it.

**Architecture decision.** We do **not** embed n8n inside our deployment. n8n is a substantial application with its own database, authentication model, and upgrade lifecycle. Running it inside our stack means owning its operational surface. Instead, we provide two integration patterns:

1. **Tenant-hosted n8n.** The tenant runs their own n8n instance (self-hosted or n8n.cloud). We expose trigger webhooks and action webhooks; their n8n calls ours to initiate actions, and we call theirs to trigger workflows.
2. **Managed n8n (Growth phase).** We offer optional managed n8n hosting as a paid add-on. Each tenant who subscribes gets an isolated n8n instance on a separate Droplet or ECS task; we handle upgrades and backups. This is a revenue stream, not free tier.

**Outbound bridge — our flow calls an n8n webhook.**

```typescript
// Action: n8n_webhook
{
  type: 'action',
  action: {
    type: 'n8n_webhook',
    config: {
      webhookUrl: 'https://tenant-n8n.example.com/webhook/abc123',
      payload: {
        client: '{{ context.client }}',      // template interpolation
        appointment: '{{ context.appointment }}',
        custom: 'value'
      },
      authentication: {
        type: 'hmac',                        // HMAC-signed payload for verification
        headerName: 'X-Signature'
      }
    }
  }
}
```

Our runner POSTs to the tenant's n8n webhook URL with the payload, signs it with the shared secret, and records the response. n8n can then do anything — call external APIs, transform data, branch further — and optionally call back into our API (see inbound bridge below).

**Inbound bridge — an n8n flow calls our API.**

We expose a subset of our public API specifically scoped for automations:

| Endpoint | Purpose |
|---|---|
| `POST /api/automations/v1/trigger/{flow_slug}` | Trigger one of our flows from n8n; payload becomes the flow context |
| `POST /api/automations/v1/send-sms` | Send an SMS via our TextLink integration (n8n's native SMS nodes don't know our SIM routing) |
| `POST /api/automations/v1/send-email` | Send email via Resend with our branding and templates |
| `POST /api/automations/v1/add-client-note` | Add a note to a client record |
| `POST /api/automations/v1/assign-form` | Assign a form to a client |
| `GET /api/automations/v1/clients/{id}` | Read client data (respects RBAC and subcontractor isolation) |
| `GET /api/automations/v1/appointments?filter=...` | Query appointments |

These endpoints use OAuth 2.0 client credentials authentication. A tenant generates an automation API key in the admin UI, which doubles as an n8n credential.

**Reference n8n workflow library.** We publish a set of pre-built n8n workflows (JSON exports) that tenants can import into their n8n instance:

- Sync appointments to Google Calendar
- Sync new clients to Mailchimp / Klaviyo
- Post new bookings to Slack
- Tag high-value clients based on lifetime value
- Trigger a Zapier Zap from an appointment event (n8n as middleware)
- Pull inventory reorder data into Google Sheets

#### 5.9.6 Observability and Debugging

Every automation run is fully traceable. The execution log is the primary debugging tool.

**Run detail view (staff UI):**

- Timeline of step executions with status, duration, input, output
- Full context object at each step (after enrichment)
- Error messages and retry history
- Link to the trigger event in the event bus log
- "Re-run" button that replays the flow against the same context (test environment only — production re-runs require admin approval)

**Tenant-visible metrics:**

- Runs per flow per day (success, failure, skipped)
- Median step duration per flow
- Action cost tracking (SMS count, email count)
- Failure rate per flow with drill-down to failing step

**Platform observability.** Automation runs emit OpenTelemetry spans, logged to Grafana. Per-tenant dashboards show automation-driven SMS/email volume against rate limits — catches runaway flows before they blow through a TextLink SIM's daily allowance.

#### 5.9.7 Safety, Rate Limits, and Cost Controls

Automations can cause real damage if misconfigured — infinite loops, mass SMS sends, runaway email volumes. The module is defended at multiple layers.

**Loop detection.** A run whose trigger event originated from a previous run of the same flow (directly or transitively) is detected via the causation chain (`automation_runs.trigger_event_id` → event → prior run). Loops are broken with `status='cancelled_loop_detected'` and an alert to tenant admins.

**Spend caps per flow.**

```typescript
interface FlowSettings {
  maxRunsPerDay?: number;                  // default: unlimited
  maxSmsPerRun?: number;                   // default: 1
  maxSmsPerDayAcrossAllRuns?: number;      // default: 100
  maxEmailPerRun?: number;                 // default: 2
  alertAdminOnCapApproach: boolean;        // default: true
}
```

Caps are enforced in the runner before actions execute. Hitting a cap fails the action with a clear status; the flow either stops or continues per the step's error policy.

**Tenant-wide ceiling.** A tenant-level daily message ceiling (sum across all flows) prevents one runaway flow from ruining multiple. Default 500 SMS/day, 2,000 emails/day; adjustable by Anthropic platform support, not by the tenant directly.

**Dry-run mandatory before enabling.** A flow cannot be set to `enabled = true` without having completed at least one successful dry run within the past 7 days. UI blocks the toggle; API returns 409.

#### 5.9.8 MVP vs. Later Scope

**MVP includes.** Flow definition schema and versioning; visual builder with drag-and-drop node composition using React Flow; 10 seeded automation templates covering the most common use cases; event-triggered flows subscribing to any platform event; schedule-triggered flows (cron-based); manual trigger (run from staff UI button); MVP action set (`send_sms`, `send_email`, `add_client_tag`, `remove_client_tag`, `add_client_note`, `create_task`, `assign_form`, `create_waitlist_entry`, `n8n_webhook`); MVP condition expression language with all the operators listed in 5.9.2; wait and wait_until steps; basic condition branching; execution runtime on BullMQ with retry and backoff; run detail view with full step-by-step debugging; dry-run mode; spend caps and loop detection; outbound n8n webhook action; inbound n8n bridge API with the endpoints listed in 5.9.5; per-tenant automation API keys.

**Growth-phase additions.** Parallel step execution; `http_request` generic action; webhook-triggered flows (third-party systems triggering our flows); n8n-callback trigger type for tighter bidirectional integration; field-level friction analytics integrated into flow runs; visual condition builder (drag-and-drop, not JSON); flow-level analytics dashboard; template merge updates when system templates change; managed n8n hosting as a paid add-on; AI-assisted flow suggestion ("we noticed you manually send X — automate it?"); cross-flow chaining (flow A's completion triggers flow B); rollback / replay for failed runs.

**Full-platform additions.** Multi-tenant shared automation marketplace (tenants publish flows for others to use); automation-as-code (define flows in YAML for version control); A/B testing built into automations (variant branches with outcome tracking); cohort-based triggers (run flow when N clients meet criteria); machine-learning-suggested flow improvements based on observed outcomes.

---

## PART 6 — API Surface & Public Developer Platform {#part-6}

### 6.1 API Layers

The platform exposes three logical API surfaces, each with different authentication, rate limits, and documentation.

| Surface | Consumers | Auth | Rate limit |
|---|---|---|---|
| Internal (private) | Our own web and mobile clients | Session cookies + CSRF | Per-session, generous |
| Public REST (v1) | External developers, customer integrations | OAuth 2.0 client credentials or static API keys | Per-key, published |
| Webhooks (outbound) | External developers | HMAC-SHA256 signed payloads | N/A (we push) |

### 6.2 Internal API — Conventions

- Resource-oriented REST under `/api/internal/v1/`
- JSON request and response bodies
- Pagination via `cursor` and `limit` (max 100)
- Filtering via explicit query parameters, never generic `?q=` expressions
- Timestamps in ISO 8601 with UTC offset
- Money returned as `{ amount_cents, currency }` objects
- Errors follow `{ error: { code, message, details } }` shape

### 6.3 Public API — MVP Coverage

The public REST API is not an MVP deliverable. In MVP we expose only read-only endpoints for the booking widget and embedded booking flows. The full public API ships in Growth phase.

**MVP public read endpoints:**

- `GET /public/v1/locations`
- `GET /public/v1/services`
- `GET /public/v1/staff`
- `GET /public/v1/availability?location_id=&service_id=&date=`
- `POST /public/v1/appointments` (consumer booking, with anonymous-identity token)

**Growth phase public API expansion:**

- Full CRUD on clients, appointments, classes, sales
- Webhook subscription management
- OAuth 2.0 authorization code flow for third-party apps
- Developer portal with auto-generated docs, API key management, usage metering

### 6.4 Webhook Product

Webhooks are sold as a paid feature (mirroring Vagaro's model — $10/month including N events). Customers subscribe to event types via the developer portal. See PART 7 for delivery infrastructure.

**Public webhook event catalog (launch set):**

- `appointment.created`, `appointment.updated`, `appointment.cancelled`, `appointment.completed`
- `class.occurrence.created`, `registration.created`, `registration.cancelled`
- `client.created`, `client.updated`
- `sale.completed`, `sale.refunded`
- `membership.started`, `membership.renewed`, `membership.cancelled`
- `form.submitted`, `form.assignment.created`, `form.assignment.expired`
- `automation.run.succeeded`, `automation.run.failed`
- `waitlist.entry.created`, `waitlist.entry.promoted`

### 6.5 Idempotency Contract

Every mutating public endpoint accepts an `Idempotency-Key` header. Values are stored for 24 hours. Repeat requests with the same key and a matching body return the original response. Repeat requests with the same key and a different body return `409 Conflict`.

---

## PART 7 — Event Bus & Webhook Infrastructure {#part-7}

### 7.1 Internal Event Bus

The event bus is the backbone of the modular monolith. Every significant state change emits an event. Internal workers and the public webhook service subscribe to those events.

**Technology choice.** Redis Streams for MVP (already required for BullMQ; same cluster). Migrate to Kafka or AWS Kinesis if event volume exceeds 10k/sec sustained or if stream retention requirements exceed 7 days.

**Event envelope:**

```json
{
  "id": "01HX7K2M8N...",            // ULID, globally unique
  "tenant_id": "uuid",
  "type": "appointment.confirmed",
  "version": 1,
  "occurred_at": "2026-04-20T17:32:11.482Z",
  "actor": { "type": "user|system|api_key", "id": "uuid" },
  "data": { /* event-specific payload */ },
  "metadata": {
    "correlation_id": "uuid",
    "causation_id": "uuid"
  }
}
```

**Emission contract.** Every domain module publishes events via a thin `eventBus.publish(type, data)` helper. Events are written to Redis Streams with `MAXLEN ~ 1000000` per stream. Consumer groups track their own offsets.

### 7.2 Public Webhook Delivery

The public webhook service is a dedicated worker that subscribes to the internal event bus and delivers to customer-configured endpoints.

**Delivery requirements:**

- HMAC-SHA256 signature in `X-Signature` header, computed over `timestamp + "." + raw_body` with a per-subscription secret
- `X-Event-Type`, `X-Event-Id`, `X-Delivery-Attempt` headers
- Expect HTTP 2xx within 10 seconds
- Retry on non-2xx or timeout: 1min, 5min, 30min, 2h, 12h, 24h (6 attempts, then park)
- Parked events visible in developer portal for manual replay
- At-least-once delivery; customers responsible for idempotency

**Signature verification example (for customer docs):**

```javascript
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyWebhook(rawBody, signatureHeader, timestampHeader, secret) {
  const expected = createHmac('sha256', secret)
    .update(`${timestampHeader}.${rawBody}`)
    .digest('hex');
  return timingSafeEqual(
    Buffer.from(signatureHeader),
    Buffer.from(expected)
  );
}
```

### 7.3 Internal Worker Patterns

Every worker that subscribes to the event bus follows the same pattern to guarantee correctness.

```javascript
// src/workers/notifications/appointment-confirmed.worker.js
import { consumerGroup } from '../../lib/event-bus.js';

export async function runAppointmentConfirmedWorker() {
  await consumerGroup.subscribe({
    stream: 'events:scheduling',
    group: 'notifications-worker',
    types: ['appointment.confirmed'],
    handler: async (event) => {
      // Idempotency check — have we already processed this event ID?
      const alreadyProcessed = await db.processedEvents.exists(event.id);
      if (alreadyProcessed) return 'ack';

      try {
        await dispatchAppointmentConfirmation(event.data);
        await db.processedEvents.record(event.id);
        return 'ack';
      } catch (err) {
        // Log, let the stream retry up to N times, then DLQ
        logger.error({ err, event }, 'worker failed');
        throw err;
      }
    },
    maxRetries: 5,
  });
}
```

---

## PART 8 — Notification Architecture (TextLink + Resend) {#part-8}

This section is the concrete integration plan that connects the notifications module to the two channel providers. It assumes familiarity with the TextLink integration guide; only the integration-specific details are repeated here.

### 8.1 Channel Responsibilities

| Channel | Provider | Use cases |
|---|---|---|
| SMS | TextLink | Appointment confirmations, reminders, therapist ETA, arrival nudges, post-service messages, OTP, inbound auto-reply |
| Email | Resend | Receipts, intake form links, long-form marketing, report exports, password reset |
| In-app | Internal push | Staff calendar updates, inbox messages |

### 8.2 Notification Templates

Templates are versioned rows in `notification_templates`. Each row has a channel, a locale, a subject (for email), a body with Handlebars-style placeholders, and metadata. Templates are tenant-overridable — the tenant can clone the system default and edit.

```sql
CREATE TABLE notification_templates (
  id              UUID PRIMARY KEY,
  tenant_id       UUID NULL,              -- NULL = system default
  slug            TEXT NOT NULL,          -- e.g. 'appointment.confirmation.sms'
  channel         TEXT NOT NULL,          -- 'sms' | 'email' | 'push'
  locale          TEXT NOT NULL DEFAULT 'en-US',
  subject         TEXT NULL,              -- email only
  body            TEXT NOT NULL,
  version         INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, slug, locale, version)
);
```

### 8.3 Dispatch Flow

```
┌─────────────────────┐
│ Domain Event        │  e.g. appointment.confirmed
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Notifications       │  Resolves: recipient, channel,
│ Orchestrator        │  template, opt-out state, locale
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Record Dispatch     │  INSERT message_dispatches
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Queue Job           │  BullMQ: sms.send or email.send
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Channel Worker      │  TextLink or Resend API call
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Record Delivery     │  INSERT message_deliveries on
│ (via webhook)       │  provider webhook
└─────────────────────┘
```

### 8.4 Dispatch Record Schema

```sql
CREATE TABLE message_dispatches (
  id                  UUID PRIMARY KEY,
  tenant_id           UUID NOT NULL,
  channel             TEXT NOT NULL,       -- 'sms' | 'email'
  template_slug       TEXT NOT NULL,
  recipient_id        UUID NULL,           -- client_id or staff_member_id
  recipient_address   TEXT NOT NULL,       -- phone or email
  subject             TEXT NULL,
  body                TEXT NOT NULL,
  status              TEXT NOT NULL,       -- 'queued' | 'sent' | 'delivered' | 'failed' | 'suppressed'
  provider            TEXT NOT NULL,       -- 'textlink' | 'resend'
  provider_message_id TEXT NULL,
  custom_id           TEXT NULL,           -- our correlation id, passed to TextLink
  source_event_id    TEXT NULL,           -- triggering event
  error_message       TEXT NULL,
  queued_at           TIMESTAMPTZ DEFAULT NOW(),
  sent_at             TIMESTAMPTZ NULL,
  delivered_at        TIMESTAMPTZ NULL,
  failed_at           TIMESTAMPTZ NULL
);
```

### 8.5 TextLink Integration — Engineering Patterns

This subsection integrates the TextLink guide into the notifications module. Critical details from the guide that affect our code:

- All TextLink responses return HTTP 200; check `ok: true` in the body.
- The endpoint `/api/update-contect-tag` has an intentional typo — do not correct it.
- Failed messages fire two webhooks (sent then failed). Dedupe on `textlink_id`.
- No programmatic device status API — rely on failed-webhook rate as health signal.
- Per-SIM throughput is ~1 message per 3–6 seconds; throttle accordingly.

**Outbound send worker (BullMQ):**

```javascript
// src/workers/notifications/textlink-send.worker.js
import { Worker } from 'bullmq';
import { TextLinkService } from '../../modules/notifications/channels/textlink.service.js';
import { db } from '../../db/index.js';

export const textlinkSendWorker = new Worker('sms.send', async (job) => {
  const { dispatchId, phone, text, simId, customId } = job.data;

  const result = await TextLinkService.sendSms(phone, text, simId, customId);

  if (!result.ok) {
    await db.messageDispatches.update(dispatchId, {
      status: 'failed',
      error_message: result.message,
      failed_at: new Date(),
    });
    throw new Error(result.message ?? 'textlink send failed');
  }

  await db.messageDispatches.update(dispatchId, {
    status: result.queued ? 'queued' : 'sent',
    sent_at: result.queued ? null : new Date(),
  });
}, {
  connection: redis,
  concurrency: 4,                          // 4 × 1-per-3s ≈ carrier-safe across SIMs
  limiter: { max: 1, duration: 3000 },     // 1 send / 3s per worker
});
```

**Inbound webhook handler (Fastify):**

```javascript
// src/routes/webhooks/textlink.route.js
export async function textlinkWebhookRoute(fastify) {
  fastify.post('/webhooks/textlink', async (request, reply) => {
    const { secret, ...payload } = request.body ?? {};

    if (secret !== process.env.TEXTLINK_WEBHOOK_SECRET) {
      return reply.status(401).send({ ok: false });
    }

    const type = detectWebhookType(payload);

    // Dedupe: failed webhooks arrive after a sent webhook for the same message.
    // Idempotency key is (textlink_id || custom_id) + type.
    const idempotencyKey = `${payload.textlink_id ?? payload.custom_id ?? payload.phone_number}:${type}:${payload.timestamp ?? ''}`;

    await textlinkWebhookQueue.add(type, { payload, idempotencyKey }, {
      jobId: idempotencyKey,   // BullMQ dedupe on job id
      removeOnComplete: 1000,
    });

    return reply.send({ ok: true });
  });
}

function detectWebhookType(payload) {
  if (payload.textlink_id !== undefined) return 'failed';
  if (payload.tag !== undefined && payload.text === undefined) return 'tag_change';
  if (payload.timestamp !== undefined) return 'sent';
  return 'received';
}
```

### 8.6 TextLink Multi-SIM Routing Logic

TextLink supports a pool of Android devices, each holding one SIM. Routing the right message to the right SIM is a first-class concern — the device sending an ETA from a therapist must be the same number the client already recognizes, and the AI receptionist replying to an inbound message must reply on the SIM that received it. Leaving this to individual developers produces the kind of bugs that are obvious in retrospect and hard to reproduce in testing.

**Schema — SIM assignment:**

```sql
-- Tenant-level default SIM (used when nothing more specific is assigned)
ALTER TABLE locations
  ADD COLUMN default_textlink_sim_id INT NULL;

-- Per-staff SIM assignment (used for therapist-to-client messaging)
ALTER TABLE staff_members
  ADD COLUMN textlink_sim_id INT NULL;

-- Tracks which SIM originally handled an inbound conversation
CREATE TABLE sms_conversations (
  id                UUID PRIMARY KEY,
  tenant_id         UUID NOT NULL,
  client_phone      TEXT NOT NULL,
  bound_sim_id      INT NOT NULL,
  last_inbound_at   TIMESTAMPTZ NOT NULL,
  last_outbound_at  TIMESTAMPTZ NULL,
  UNIQUE (tenant_id, client_phone)
);
```

**Routing decision tree.** The notifications orchestrator applies these rules in order; the first match wins.

```
1. Is this an AI reply to an inbound message?
     → Use the SIM that received the inbound (sms_conversations.bound_sim_id).

2. Is this a message from a specific staff member to their client
   (ETA, personal follow-up, post-service product recommendation)?
     → Use staff_members.textlink_sim_id for that staff member.
     → If null, fall through to rule 4.

3. Is this a message in an ongoing conversation with a client
   (e.g., a two-way thread not tied to a specific staff member)?
     → Use sms_conversations.bound_sim_id if one exists for this client.
     → If none exists, fall through to rule 4.

4. Default.
     → Use locations.default_textlink_sim_id for the message's location.
     → If null, use the tenant's first available SIM.
     → If no SIMs are configured, fail-fast with a clear error.
```

**Conversation stickiness.** TextLink's Chat App has native sticky routing — subsequent messages to a contact default to the first SIM used. We replicate this explicitly in our schema (`sms_conversations.bound_sim_id`) so our routing does not depend on TextLink's opaque internal state. When a new inbound message arrives from a phone we don't have a conversation for, we stamp the `bound_sim_id` to whatever SIM received it.

**Message type → routing rule mapping:**

| Template slug | Routing rule | Notes |
|---|---|---|
| `appointment.confirmation` | Rule 4 (location default) | Booking system is the sender |
| `appointment.reminder.24h` | Rule 4 | Scheduled reminder |
| `appointment.reminder.2h` | Rule 4 | Scheduled reminder |
| `appointment.cancellation` | Rule 4 | Booking system is the sender |
| `staff.schedule.day_before` | Rule 2 (staff SIM, recipient is the staff member themselves — fall through to default if unset) | Outbound to staff |
| `appointment.arrival_check` | Rule 2 | Outbound to staff |
| `therapist.eta` | Rule 2 (staff SIM required) | Must appear from therapist's number so the client recognizes it |
| `waitlist.promoted` | Rule 4 | Booking system |
| `review.prompt` | Rule 4 | Booking system |
| `ai.receptionist.reply` | Rule 1 (inbound SIM) | Reply must match inbound |
| `form.intake_link` | Rule 4 | Booking system |
| `manual.staff_to_client` | Rule 2 | Therapist-initiated |
| `manual.business_to_client` | Rule 4 | Front-desk-initiated |

**Validation at send.** The outbound send worker verifies the resolved SIM ID is configured before calling TextLink. A `therapist.eta` with no staff SIM configured fails the precondition check and surfaces a staff-visible error ("Your phone number is not configured for ETAs — contact your admin"), rather than silently falling back to the location default. This is deliberate: sending an ETA from the wrong number looks like a scam to the client.

**Implementation — resolver:**

```typescript
// src/modules/notifications/routing/sim-resolver.ts
export async function resolveSimId(ctx: {
  tenantId: string;
  templateSlug: string;
  locationId: string;
  staffMemberId?: string;
  clientPhone?: string;
  inboundSimId?: number;
}): Promise<{ simId: number; rule: string }> {
  // Rule 1: AI reply to inbound
  if (ctx.templateSlug === 'ai.receptionist.reply' && ctx.inboundSimId) {
    return { simId: ctx.inboundSimId, rule: 'inbound_sticky' };
  }

  // Rule 2: staff-sourced messages
  if (STAFF_SOURCED_TEMPLATES.has(ctx.templateSlug) && ctx.staffMemberId) {
    const staff = await db.staffMembers.get(ctx.staffMemberId);
    if (staff.textlink_sim_id) return { simId: staff.textlink_sim_id, rule: 'staff_sim' };
    if (REQUIRES_STAFF_SIM.has(ctx.templateSlug)) {
      throw new Error(`Template ${ctx.templateSlug} requires staff SIM; none configured for ${staff.id}`);
    }
  }

  // Rule 3: conversation stickiness
  if (ctx.clientPhone) {
    const conv = await db.smsConversations.findByPhone(ctx.tenantId, ctx.clientPhone);
    if (conv) return { simId: conv.bound_sim_id, rule: 'conversation_sticky' };
  }

  // Rule 4: location default
  const loc = await db.locations.get(ctx.locationId);
  if (loc.default_textlink_sim_id) return { simId: loc.default_textlink_sim_id, rule: 'location_default' };

  // Final fallback: tenant's first SIM
  const firstSim = await db.textlinkSims.findFirstForTenant(ctx.tenantId);
  if (firstSim) return { simId: firstSim.id, rule: 'tenant_fallback' };

  throw new Error(`No TextLink SIM available for tenant ${ctx.tenantId}`);
}

const STAFF_SOURCED_TEMPLATES = new Set([
  'staff.schedule.day_before',
  'appointment.arrival_check',
  'therapist.eta',
  'manual.staff_to_client',
]);

const REQUIRES_STAFF_SIM = new Set([
  'therapist.eta',
  'manual.staff_to_client',
]);
```

**Observability.** Every dispatch logs the resolved `rule` so SIM-attribution bugs are diagnosable from Grafana without code changes.

### 8.7 Resend Integration — Engineering Patterns

Resend is straightforward compared to TextLink. API is standard REST, webhooks are signed, deliverability tracking is built in. Key details:

- Use the React Email library for template rendering (SSR to HTML).
- Send via `/emails` endpoint; the response includes a persistent `id`.
- Subscribe to `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked` webhooks.
- Verify webhook signatures via Svix (Resend's webhook provider).

```javascript
// src/modules/notifications/channels/resend.service.js
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const ResendService = {
  async send({ to, from, subject, html, text, tags }) {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
      tags: tags?.map(t => ({ name: t.name, value: t.value })),
    });

    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true, providerMessageId: data.id };
  },
};
```

### 8.8 Opt-Out & Compliance

- Every outbound SMS to a consumer number includes `Reply STOP to unsubscribe` on first send of a campaign-type message.
- Inbound messages matching `STOP|UNSUBSCRIBE|CANCEL|END|QUIT` (case-insensitive, trimmed) flip the client's `sms_opt_in` to `false` immediately.
- Inbound `START|YES|UNSTOP` re-opts the client in.
- The notifications orchestrator checks opt-in state before every send and writes `status = 'suppressed'` if the recipient is opted out.
- Transactional messages (appointment confirmations, password resets) are exempt from opt-out in jurisdictions where legally allowed — but the opt-out is still logged and surfaced in staff UI.

### 8.8 Notification Trigger Map

The authoritative list of platform events that trigger notifications in MVP.

| Trigger event | Recipient | Channel | Template slug | Timing |
|---|---|---|---|---|
| `appointment.confirmed` | Client | SMS + Email | `appointment.confirmation` | Immediate |
| `appointment.confirmed` | Staff | In-app | `appointment.assigned.staff` | Immediate |
| (scheduled) | Client | SMS | `appointment.reminder.24h` | 24h before `starts_at` |
| (scheduled) | Client | SMS | `appointment.reminder.2h` | 2h before `starts_at` (configurable) |
| (scheduled) | Staff | SMS | `staff.schedule.day_before` | 5pm the day before |
| (scheduled) | Staff | SMS | `appointment.arrival_check` | 10 min after `starts_at` if not checked in |
| `appointment.cancelled` | Client | SMS + Email | `appointment.cancellation` | Immediate |
| `appointment.cancelled` | Staff | In-app | `appointment.cancellation.staff` | Immediate |
| `sale.completed` | Client | Email | `sale.receipt` | Immediate |
| `client.password_reset.requested` | Client | Email | `client.password_reset` | Immediate |
| `form.required` | Client | SMS + Email | `form.intake_link` | On booking or manual trigger |
| `client.review_requested` | Client | SMS | `review.prompt` | 24h after `appointment.completed` |
| `waitlist.entry.promoted` | Client | SMS | `waitlist.promoted` | Immediate |
| `membership.payment_failed` | Client | Email | `membership.payment_failure` | Immediate |

---

## PART 9 — Payments Architecture (Multi-Provider) {#part-9}

The payments layer is the single most load-bearing module in the platform. The decision to support multiple payment processors — not just Stripe — is deliberate and has cascading consequences across the data model, the UI, the ledger, and the compliance posture. This section specifies how that works.

### 9.1 Strategic Frame

The three competitors (Mindbody, Vagaro, GlossGenius) all bundle payment processing as a mandatory, proprietary part of their product. That is a large source of their margin and a larger source of customer complaints about being locked in. Our differentiator is that **tenants choose their processor** — either by connecting an existing account they already have, or by signing up for our platform default during onboarding.

**The product posture:**

- **Bring-your-own (BYO) existing processor.** A tenant migrating from another platform with an existing Stripe, Square, Clover, or similar account connects it during onboarding via OAuth or API key entry. They keep their rates, their dispute history, their existing Stripe dashboard, and their existing payout cadence. We are not in the middle.
- **Platform default (one-click Stripe Connect).** A tenant with no existing processor signs up in minutes through our embedded Stripe Connect onboarding. We charge a platform fee via `application_fee_amount`. This is our payments-managed revenue tier.
- **Custom webhook escape hatch.** A tenant using a processor we don't have an official adapter for can configure a generic webhook integration — we emit payment intent events in a documented format, they respond with success/failure. They take on implementation responsibility; we provide the contract.

### 9.2 Provider Support Matrix

| Provider | Onboarding method | In-person hardware | Card-on-file | Recurring | BNPL | MVP |
|---|---|---|---|---|---|:---:|
| **Stripe (platform default)** | Embedded Stripe Connect Standard or Express | Stripe Terminal (BBPOS WisePOS E, M2) | ✓ | Stripe Billing | Stripe Payment Element (Afterpay, Klarna, Affirm) | ✓ |
| **Stripe (BYO)** | OAuth with tenant's existing Stripe account | Stripe Terminal | ✓ | Stripe Billing | Stripe Payment Element | ✓ |
| **Square** | OAuth with tenant's existing Square account | Square Reader (S3, SR-028), Square Terminal, Square Stand | ✓ (Card on File API) | Square Subscriptions | Square Afterpay | ✓ |
| **Clover** | API token from tenant's Clover dashboard | Clover Mini, Clover Flex, Clover Go | ✓ (Ecommerce SDK tokens) | Limited (requires Clover Developer Plans) | — | Growth |
| **Authorize.net** | API Login ID + Transaction Key | Not supported (CNP only via our platform) | ✓ (Customer Information Manager) | ARB (Automated Recurring Billing) | — | Growth |
| **Adyen** | OAuth or Adyen Platforms | Adyen POS terminals | ✓ | Adyen Subscriptions | Adyen BNPL | Full platform |
| **Custom webhook** | Manual config in admin | No (CNP only, tenant-managed) | Opaque token pass-through | Tenant-managed | — | Growth |

**MVP coverage.** The MVP ships with **Stripe (both modes) and Square**. Clover and Authorize.net ship in Growth. Adyen is a Full Platform consideration for enterprise tenants with international footprints. The custom webhook escape hatch ships in Growth — MVP is adapter-only so we don't support a format we then have to break.

### 9.3 Provider Abstraction Layer

Every payment provider is accessed through a single typed interface. The interface represents the union of operations we need — every adapter implements the full surface, returning a clear `UnsupportedOperationError` when the underlying processor doesn't support something.

```typescript
// packages/payments/src/provider.interface.ts

export interface PaymentsProvider {
  readonly name: 'stripe' | 'square' | 'clover' | 'authorize_net' | 'adyen' | 'custom_webhook';
  readonly capabilities: ProviderCapabilities;

  // Onboarding
  initiateOnboarding(ctx: TenantContext): Promise<OnboardingResult>;
  finalizeOnboarding(ctx: TenantContext, callbackPayload: unknown): Promise<ConnectedAccount>;
  getAccountStatus(ctx: TenantContext): Promise<AccountStatus>;

  // Customer / card-on-file
  createCustomer(ctx: TenantContext, client: ClientInput): Promise<CustomerRef>;
  attachPaymentMethod(ctx: TenantContext, customerRef: string, setupIntent: SetupIntentPayload): Promise<PaymentMethodRef>;
  listPaymentMethods(ctx: TenantContext, customerRef: string): Promise<PaymentMethodRef[]>;
  detachPaymentMethod(ctx: TenantContext, pmRef: string): Promise<void>;

  // Charges
  createCharge(ctx: TenantContext, input: ChargeInput): Promise<ChargeResult>;
  createOffSessionCharge(ctx: TenantContext, input: OffSessionChargeInput): Promise<ChargeResult>;
  capturePreAuth(ctx: TenantContext, chargeRef: string, amountCents: number): Promise<ChargeResult>;
  voidPreAuth(ctx: TenantContext, chargeRef: string): Promise<void>;

  // Refunds
  createRefund(ctx: TenantContext, chargeRef: string, amountCents: number, reason?: string): Promise<RefundResult>;

  // Recurring (if supported)
  createSubscription(ctx: TenantContext, input: SubscriptionInput): Promise<SubscriptionRef>;
  cancelSubscription(ctx: TenantContext, subscriptionRef: string, when: 'immediate' | 'period_end'): Promise<void>;

  // In-person / terminal (if supported)
  listTerminalReaders(ctx: TenantContext): Promise<TerminalReader[]>;
  createTerminalCharge(ctx: TenantContext, readerId: string, input: ChargeInput): Promise<ChargeResult>;

  // Webhook verification
  verifyWebhook(rawBody: Buffer, signature: string, secret: string): boolean;
  parseWebhook(rawBody: Buffer): ProviderWebhookEvent;
}

export interface ProviderCapabilities {
  supportsCardOnFile: boolean;
  supportsOffSessionCharges: boolean;
  supportsPreAuthCapture: boolean;
  supportsRecurring: boolean;
  supportsTerminal: boolean;
  supportsBnpl: boolean;
  supportsTapToPay: boolean;
  supportsMultiCurrency: boolean;
  requiresOwnDashboardForDisputes: boolean;
  webhookSignatureScheme: 'hmac_sha256' | 'svix' | 'custom';
}
```

**Capability-gated UI.** The staff-facing UI reads `tenant.payments.capabilities` on every render and disables features the tenant's provider doesn't support. A tenant on Authorize.net sees no Terminal tab. A tenant on Clover sees a warning on the memberships page that recurring support is limited. This is the single biggest UX consequence of multi-provider support — features are not universal.

**No leaky abstractions.** Provider-specific quirks do not bleed into domain modules. The `scheduling` module calls `payments.createDeposit(appointment, amount)`, not `stripe.paymentIntents.create(...)`. The abstraction either supports the operation through every adapter or returns a clear error through the same interface.

### 9.4 Tenant Payment Configuration

Every tenant has exactly one **active** payment configuration at a time. Historical configurations are retained for ledger reconciliation but cannot serve new charges.

```sql
CREATE TABLE tenant_payment_configurations (
  id                      UUID PRIMARY KEY,
  tenant_id               UUID NOT NULL,
  location_id             UUID NULL,           -- NULL = tenant-wide; set = location-specific override
  provider                TEXT NOT NULL,       -- 'stripe' | 'square' | 'clover' | 'authorize_net' | 'custom_webhook'
  provider_mode           TEXT NOT NULL,       -- 'platform' | 'byo'
  connected_account_ref   TEXT NOT NULL,       -- e.g. Stripe acct_..., Square merchant_id
  oauth_refresh_token     TEXT NULL,           -- encrypted at rest
  api_credentials         JSONB NULL,          -- encrypted JSONB for providers using API keys
  webhook_endpoint_secret TEXT NOT NULL,       -- per-config secret for verifying inbound webhooks
  status                  TEXT NOT NULL,       -- 'pending' | 'active' | 'restricted' | 'disconnected'
  onboarding_completed_at TIMESTAMPTZ NULL,
  activated_at            TIMESTAMPTZ NULL,
  deactivated_at          TIMESTAMPTZ NULL,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Only one active config per tenant (or per location, if location-scoped)
CREATE UNIQUE INDEX tenant_payment_config_active_idx
  ON tenant_payment_configurations (tenant_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'active';
```

**Secrets handling.** `oauth_refresh_token` and `api_credentials` are encrypted at rest using envelope encryption — a per-tenant data key wrapped by a master key held in the secrets manager. Plain-text keys never hit the database or logs.

**Location-level override.** A multi-location tenant can assign different processors per location. This is unusual but necessary for enterprise tenants with regional processor requirements (e.g., a chain with one EU location that needs Adyen while the rest run on Stripe).

### 9.5 Onboarding Flows

**Flow A — Platform Default Stripe Connect (new tenants, no existing processor):**

1. Tenant reaches "Set up payments" step in admin onboarding.
2. Single button: **"Connect with Stripe"** → Stripe Connect embedded onboarding component.
3. Stripe collects identity, bank account, tax info inline.
4. On Stripe webhook `account.updated` with `charges_enabled=true`, we flip `tenant_payment_configurations.status` to `active` and enable checkout across the app.
5. Our platform fee is applied via `application_fee_amount` on every charge. Tenant sees their own Stripe dashboard for disputes and payouts.

**Flow B — BYO Stripe (tenants migrating with an existing Stripe account):**

1. Tenant chooses "I already have a Stripe account."
2. OAuth redirect to Stripe → they authorize our app.
3. We receive `stripe_user_id` and refresh token; store encrypted.
4. We verify the account can `charges_enabled=true` via API and flip status to `active`.
5. **No platform fee** on BYO. We charge them a SaaS subscription fee instead (separate invoicing, not tied to their payment processor).

**Flow C — BYO Square:**

1. Tenant chooses "Connect Square."
2. OAuth redirect to Square's authorization URL with required scopes (`MERCHANT_PROFILE_READ`, `PAYMENTS_READ`, `PAYMENTS_WRITE`, `ORDERS_WRITE`, `CUSTOMERS_WRITE`).
3. Square returns an access token + merchant ID; store encrypted.
4. We verify merchant status via `GET /v2/merchants/me` and flip status to `active`.

**Flow D — Custom Webhook (Growth phase):**

1. Tenant selects "Other processor."
2. Tenant provides: a webhook URL we POST events to, an HMAC secret we use to sign outbound payloads, and a URL we POST inbound payment events from them.
3. They implement their side of the contract (see 9.10 for the event shapes).
4. We run a test charge end-to-end before flipping to `active`. If their endpoint doesn't respond correctly to the test suite, onboarding is blocked.

### 9.6 Charge Flow — Neutral Version

The charge flow below is the canonical version that every domain module uses. Provider-specific behavior stays behind the adapter.

```
1. Domain module (scheduling, memberships, etc.) assembles a Cart with line items.
2. Cart totals computed by the pure CartTotals function (see 5.3).
3. Payments module resolves the tenant's active configuration.
4. Payments module calls provider.createCharge(ctx, { amount, currency, customerRef, paymentMethodRef, metadata }).
5. Adapter translates this to provider-native call:
     - Stripe: PaymentIntent.create with `on_behalf_of = tenant_connected_account`
     - Square: Payments.createPayment with source_id = card-on-file token
     - Clover: Orders + Payments API calls
     - Authorize.net: createTransactionRequest with authCaptureTransaction
6. Adapter returns a ChargeResult with: provider_charge_ref, status, amount_cents,
   processor_fee_cents (if available synchronously), raw_response.
7. Payments module writes PaymentIntent row + initial LedgerEntry rows.
8. Payments module emits payment.succeeded / payment.failed event.
9. Downstream modules listen and act (appointment confirms, membership starts, etc.).
```

**Idempotency.** Every call to `provider.createCharge` passes an `idempotency_key` derived from the cart ID + a salt. Repeat calls with the same key return the original result — the provider enforces this for us. We store the key in our `payment_intents` table too, as a defensive measure.

**Processor fee capture.** Providers vary in how they report processor fees. Stripe exposes them on the `balance_transaction` object, which arrives asynchronously; Square returns them inline on `CreatePayment`. The ledger handles this: the initial ledger write uses the charge amount; when the provider webhook confirms the final fee, a reconciliation job adds a `fee` ledger entry that balances to the gross. We do not block checkout waiting for the fee to resolve.

### 9.7 Terminal / In-Person Hardware

Card-present is a requirement for salons, spas, and retail-adjacent verticals. The abstraction supports the same three SDK families used in production by our target customers.

| Provider | SDK / hardware | Integration model |
|---|---|---|
| Stripe Terminal | `@stripe/terminal-js` (web) or native iOS/Android SDK | We emit a `reader_id` → client SDK connects to a paired reader → we call `createTerminalCharge` server-side → client confirms on the reader |
| Square | Square Reader SDK (iOS/Android) | Mobile SDK is native-only; web integration uses Square Virtual Terminal which is a separate redirect — not suitable for seamless POS. **Square Terminal support in MVP requires our React Native shell (Growth), or Growth phase web-only.** |
| Clover | Cloud Pay Display + REST | Clover Mini runs Android with our app (or a pay-display app) installed directly on device; server coordinates via Clover REST |

**MVP reality check.** Square Terminal support in a pure web/PWA MVP is not clean — Square's card-present SDKs assume a native mobile host. The honest MVP position is:

- **Stripe Terminal works fully in MVP** via web + a paired reader. This is the primary in-person path.
- **Square Terminal ships in Growth** alongside our React Native staff app.
- **Clover Mini works in MVP** because the terminal itself runs the integration — we only need to expose the REST endpoints for it to call.

Document this clearly in the tenant onboarding UX. A tenant who insists on Square terminal hardware in MVP either waits for our RN app or uses Square's own POS alongside ours (with booking-only integration, no unified checkout).

### 9.8 Recurring Billing

Memberships require recurring charges. Support varies by provider.

| Provider | Recurring support | What we do |
|---|---|---|
| Stripe (both modes) | Stripe Billing — full featured | Use Subscriptions + Prices tied to tenant's connected account |
| Square | Square Subscriptions | Use Square Subscriptions API; simpler than Stripe, sufficient for flat memberships |
| Clover | Limited (developer plans) | Block memberships at config time if tenant is on Clover without an upgraded plan; show clear error in UI |
| Authorize.net | ARB | Supported but older API; works for fixed-price monthly memberships |
| Custom webhook | Tenant-managed | We fire `recurring.charge.due` webhooks on schedule; tenant responds with success/fail |

**Capability gating.** When a tenant's active provider does not support recurring, the Memberships module is hidden in the UI and the API endpoints return `409 Provider does not support recurring billing`. Tenants see an in-app message explaining why and offering to connect a recurring-capable provider.

### 9.9 Dispute and Chargeback Handling

**Disputes stay with the provider.** Every supported provider has its own dispute tooling (Stripe Dashboard, Square Disputes, Clover Disputes, Authorize.net iProcess). We do not replicate these. We receive dispute webhooks, surface them in our staff UI as read-only "heads up" notifications, and link deep into the provider's dispute resolution UI.

**Why this matters for BYO.** A tenant on BYO Stripe handles their own disputes in their own Stripe dashboard — we never interpose. A tenant on platform-default Stripe Connect also handles disputes in their Stripe dashboard (Stripe Connect exposes dispute UI to connected accounts automatically). Either way, we don't become the customer service layer for disputes.

**Default stance for platform-triggered fee disputes.** When a no-show fee or late-cancel fee gets disputed (see 5.3.2), the default is to concede. The platform setting that governs this lives on the tenant, not on the provider config — so it applies uniformly regardless of which processor is active.

### 9.10 Custom Webhook Contract (Growth Phase)

For processors we don't officially adapt, the custom webhook contract is the escape hatch. We emit events in a documented shape; the tenant's integration responds.

**Outbound events (we POST to tenant's endpoint):**

| Event | Payload |
|---|---|
| `charge.requested` | `{ payment_intent_id, amount_cents, currency, customer_ref, payment_method_ref, metadata }` |
| `refund.requested` | `{ refund_id, charge_ref, amount_cents, reason }` |
| `subscription.charge.due` | `{ subscription_id, amount_cents, currency, period_start, period_end }` |
| `setup_intent.requested` | `{ setup_intent_id, customer_ref, return_url }` |

Every outbound event carries `X-Signature: t={timestamp}, v1={hmac_sha256(timestamp + '.' + body, secret)}`. Tenants verify this the same way they would a Stripe webhook.

**Inbound events (tenant POSTs to our endpoint):**

| Event | Required fields |
|---|---|
| `charge.succeeded` | `payment_intent_id`, `provider_charge_ref`, `amount_cents`, `processor_fee_cents` |
| `charge.failed` | `payment_intent_id`, `failure_code`, `failure_message` |
| `refund.succeeded` | `refund_id`, `provider_refund_ref`, `amount_cents` |
| `dispute.created` | `provider_charge_ref`, `dispute_ref`, `amount_cents`, `reason` |

**Enforcement of the contract.** A tenant who does not acknowledge an outbound `charge.requested` with a valid inbound `charge.succeeded` or `charge.failed` within 60 seconds sees the payment intent auto-fail on our side. We surface this as a clear error to the client ("Payment could not be processed — please contact the business") and alert tenant admins.

**We publish a reference implementation** in Node.js and Python in our docs. Tenants without engineering bandwidth should not choose the custom webhook path — they should use an official adapter or hire an integrator.

### 9.11 Ledger Invariants (Provider-Neutral)

The ledger is the same regardless of which provider processed the charge. Invariants verified by the nightly reconciliation job:

1. For every completed sale, ledger entries sum to zero (debits = credits).
2. For every refund, reversing entries reference the original via `reversal_of_entry_id`.
3. Provider-reported balance transactions reconcile to our ledger entries within a 48-hour window, per-tenant, per-provider.
4. No ledger entry is ever mutated; corrections are new reversing entries.
5. Processor fees are recorded as `fee` entries against the `processor` account, separate from the gross charge entries.

**Reconciliation per provider.** The nightly job pulls each tenant's provider balance transactions (Stripe `balance_transactions.list`, Square `ListPayments`, etc.) and compares to our `ledger_entries`. Drift triggers a Slack alert with tenant ID and amount. Multi-provider tenants are reconciled per-provider.

### 9.12 Security and Compliance per Provider

| Provider | PCI posture | Key handling |
|---|---|---|
| Stripe (platform + BYO) | SAQ-A via Stripe Elements / Terminal tokenization | No raw card data ever on our servers |
| Square | SAQ-A via Square Web Payments SDK / Reader | Same — tokens only |
| Clover | SAQ-A via Clover Ecommerce SDK | Same — tokens only |
| Authorize.net | SAQ-A-EP if we host the payment form; SAQ-A if we use Accept.js | Use Accept.js to stay in SAQ-A |
| Custom webhook | **Tenant's responsibility** — our contract accepts only tokens, never PAN | We contractually prohibit sending raw card data over the webhook |

**Absolute rule.** The provider abstraction never accepts raw PAN, CVV, or track data — only tokens and references. Every adapter's `ChargeInput` type enforces this at the type level. The custom webhook contract's event payloads are defined so raw card data simply has no field to live in.

### 9.13 Alternatives and When to Add Them

| Alternative | When to consider | Impact |
|---|---|---|
| Adyen as MVP provider | If we sign an enterprise tenant with multi-country operations before MVP closes | Adds ~2–3 weeks to MVP; skip until it's a deal-blocker |
| Braintree | If PayPal is a commonly requested payment method by our tenants | Add as Growth-phase adapter |
| Worldpay / FIS | Enterprise salon chains sometimes have Worldpay legacy contracts | Full Platform consideration |
| ACH-only providers (Plaid, Dwolla) | If wellness/therapy verticals request bank debit | Can layer on top of any primary provider |

### 9.14 Module Scope — MVP vs. Later

**MVP scope (weeks 0–30).**

- Provider abstraction layer with typed interface, capability matrix, error handling.
- Stripe adapter (both platform-default and BYO modes), including Stripe Terminal.
- Square adapter (BYO only, no platform-default for Square), including Clover Mini for terminal needs that can't wait for Square RN.
- Tenant payment configuration UI: connect Stripe (platform or BYO), connect Square, view status, disconnect.
- Cart + cancellation/no-show fee engine (see 5.3) calls only through the abstraction.
- Reconciliation job per provider.

**Growth scope (weeks 30–46).**

- Clover adapter (full), Authorize.net adapter.
- Custom webhook escape hatch with published contract and reference implementations.
- Square Terminal in React Native staff app.
- Location-level processor overrides.
- Tap to Pay on iPhone (Stripe-only).

**Full Platform scope (weeks 46–60).**

- Adyen adapter for enterprise tenants.
- BNPL (Afterpay, Klarna, Affirm) via Stripe Payment Element and Square Afterpay.
- Stripe Capital offer surfacing.
- Automated provider switching (tenant can move from BYO Square to platform Stripe with orderly transition of card-on-file, historical reconciliation preserved).

---

## PART 10 — Data Platform & Reporting {#part-10}

### 10.1 Operational vs. Analytical Data

- **Operational data** lives in Postgres. Every read from the app layer goes here.
- **Analytical data** lives in the warehouse, populated by the event bus and nightly Postgres CDC.
- **No direct OLAP queries on the operational DB.** Staff dashboards that need complex aggregations query the warehouse through an internal read API.

### 10.2 Warehouse Stack

| Layer | Tool | Alternative |
|---|---|---|
| Warehouse | ClickHouse | Snowflake (if tenant BI customers prefer it), BigQuery |
| Ingestion | Event bus consumer + Debezium CDC from Postgres | Fivetran, Airbyte |
| Transformation | dbt | SQL models in-repo |
| BI (internal) | Metabase | Superset |
| BI (customer-facing) | Embedded Metabase or custom charts powered by warehouse read API | — |

### 10.3 Reporting — MVP vs. Growth vs. Full

**MVP reports (served from Postgres, cached):**

- Daily revenue (by tenant, by location)
- Appointments by staff / day
- No-show rate
- Top services by revenue
- Retention cohort placeholder (simple % returning in 30/60/90 days)

**Growth reports (warehouse-backed):**

- Service utilization
- Staff productivity
- Membership churn
- LTV by acquisition source
- Inventory turnover

**Full-platform (data lake product, Vagaro-style):**

- Customer-facing warehouse export (Parquet on S3/GCS/Azure Blob)
- Power BI and Tableau template apps
- Multi-location rollups for enterprise tenants
- Tokenized external read access

---

## PART 11 — Tech Stack Recommendations {#part-11}

The research establishes that all three competitors run production workloads on well-understood stacks. We align with Node.js/Fastify because it is the stack specified for the TextLink integration work already in-flight. Alternatives are noted where the choice is genuinely fungible.

### 11.1 Recommended Stack

| Layer | Recommendation | Alternatives |
|---|---|---|
| Language / runtime | TypeScript on Node.js 20 LTS | Kotlin (GlossGenius precedent), Ruby on Rails (Mindbody precedent), .NET (Vagaro precedent) |
| HTTP framework | Fastify | NestJS (more batteries-included), Hono (edge-ready) |
| Database | Postgres 16 | — |
| Cache / queue | Redis 7 (Streams + BullMQ) | Memcached + RabbitMQ |
| ORM / query builder | Drizzle ORM (preferred for type safety + migration control) | Prisma, Kysely |
| Auth | Lucia + custom RBAC | Clerk, Auth0, WorkOS (for enterprise SSO later) |
| Email | Resend + React Email | Postmark, SendGrid |
| SMS | TextLink (per integration guide) | Twilio (A2P-compliant) when scale demands |
| Payments | Multi-provider abstraction (PART 9): Stripe + Square adapters in MVP; Clover, Authorize.net, custom webhook in Growth; platform default is Stripe Connect | Single-provider (Stripe-only) if BYO is dropped; Adyen-first for enterprise |
| File storage | DigitalOcean Spaces (S3-compatible) | AWS S3, Cloudflare R2, Azure Blob, GCS |
| CDN | CloudFront or Cloudflare | Fastly |
| Search | OpenSearch for MVP marketplace | Typesense, Meilisearch, Algolia |
| Warehouse | ClickHouse | Snowflake, BigQuery |
| BI | Metabase (embedded) | Superset |
| Frontend web | Next.js 15 (App Router) + React 19 + Tailwind | Remix, SvelteKit |
| Mobile | PWA in MVP; React Native in Growth | Flutter, native Swift/Kotlin |
| Forms | Internal form engine; Form.io as reference | Tally for customer-built forms |
| Observability | OpenTelemetry → Grafana Cloud or Datadog | New Relic, Honeycomb |
| Error tracking | Sentry | Rollbar |
| CI/CD | GitHub Actions | GitLab CI, CircleCI |
| IaC | Terraform | Pulumi, CDK |
| Hosting | DigitalOcean Droplet (MVP) + Managed Postgres + Spaces; add Load Balancer + pool in Growth (see PART 12) | AWS (ECS Fargate + RDS + ElastiCache), Fly.io, Render, Railway |

### 11.2 Why These Choices

- **TypeScript/Fastify/Postgres/Redis** matches the TextLink integration work and gives a single-language full-stack with excellent type safety end-to-end.
- **Drizzle over Prisma** because Drizzle's migration story is safer for a booking platform where schema correctness matters more than developer ergonomics on day one.
- **Multi-provider payments with Stripe as platform default.** The payments architecture (PART 9) is a provider abstraction — Stripe and Square both ship in MVP, with Clover / Authorize.net / custom webhooks in Growth. The reason to offer BYO processors is customer-side: the incumbents lock tenants into proprietary processing at a fat margin, and "bring your own Stripe/Square" is a material competitive differentiator. The reason to still have Stripe as the platform default is conversion-side: a tenant with no processor must be able to start charging within an hour of signup, and Stripe Connect's embedded onboarding is the only option that delivers that today.
- **Resend** over Postmark/SendGrid because React Email templates ship with the platform and the developer ergonomics are markedly better for a TypeScript codebase.
- **ClickHouse** because GlossGenius's public hiring evidence validates it works at this scale, and it's dramatically cheaper than Snowflake for event-heavy workloads.
- **PWA over native in MVP** because a well-built PWA covers 90% of what staff need on mobile and defers the RN app complexity to Growth phase.

### 11.3 Repository Structure

Monorepo managed by pnpm workspaces or Turborepo.

```
mindbody-rebuild/
├── apps/
│   ├── api/              # Fastify app
│   ├── web/              # Next.js staff + consumer web
│   ├── widget/           # Embeddable booking widget (isolated build)
│   └── workers/          # BullMQ worker processes
├── packages/
│   ├── db/               # Drizzle schema + migrations
│   ├── core/              # Domain modules (scheduling, clients, payments, etc.)
│   ├── notifications/    # Channel-agnostic notification orchestration
│   ├── textlink-client/  # TextLink SDK wrapper
│   ├── event-bus/        # Redis Streams producer/consumer
│   ├── emails/           # React Email templates
│   └── ui/               # Shared React components
├── infra/
│   ├── terraform/
│   └── docker/
└── docs/
    ├── deep-research-report.md
    ├── textlink-integration-guide.md
    └── mindbody-rebuild-master-spec.md  # this file
```

---

## PART 12 — Deployment Architecture — DigitalOcean Droplet {#part-12}

This section is the operational contract between engineering and the environment the code actually runs in. It assumes familiarity with the companion docs `digitalocean-droplets.md`, `digitalocean-api.md`, and `push-to-production.md` — the content here is the master-spec distillation with master-spec-level specificity, not a replacement.

### 12.1 Droplet Target Specification

The MVP production environment is a single DigitalOcean Droplet. The app is written stateless so that scaling to a Load Balancer + multi-Droplet pool in Growth phase is a configuration change, not a rewrite.

| Attribute | Value | Notes |
|---|---|---|
| Size | 4 vCPU / 8 GB RAM / 80 GB SSD | `s-4vcpu-8gb` slug (shared CPU) at MVP; `s-4vcpu-8gb-intel` or `-amd` for predictable performance |
| OS | Ubuntu 24.04 LTS | Long-term support through April 2029 |
| Region | Match customer geography | `nyc3` / `sfo3` for US primary |
| VPC | Private network enabled | All internal traffic (app ↔ DB, app ↔ Redis) stays on VPC |
| IPv6 | Enabled | Free, no reason to skip |
| Monitoring | Enabled | Free metrics agent + alert policies |
| Backups | Enabled | ~20% of Droplet cost; non-negotiable |
| SSH | Key-only, no password | Keys managed at DigitalOcean account level, not on the Droplet |

**Resource budget.** The Droplet hosts the app runtime, background workers, reverse proxy, and local Redis. It does NOT host Postgres — Postgres runs on DigitalOcean Managed Databases from day one. Hosting the DB on the Droplet creates a single point of failure and blocks every scaling move.

| Component | CPU target | RAM target |
|---|---|---|
| OS + system daemons | 0.25 vCPU | 500 MB |
| Reverse proxy (nginx) | 0.25 vCPU | 200 MB |
| App runtime (Fastify, PM2 cluster) | 2.0 vCPU | 3.5 GB |
| Background workers (BullMQ) | 1.0 vCPU | 1.5 GB |
| Redis (local at MVP) | 0.25 vCPU | 512 MB |
| Docker / build headroom | 0.25 vCPU | 500 MB |
| Reserved for spikes | — | ~1.3 GB |

### 12.2 Droplet Hardening

Every Droplet is provisioned identically via cloud-init user data at create time. Manual post-hoc hardening does not happen — if it needs to be on the Droplet, it's in the bootstrap script.

**Bootstrap responsibilities (cloud-init):**

1. Create `deploy` sudo user with team SSH keys. Disable root password login (`PermitRootLogin prohibit-password`).
2. Install baseline packages: `ufw`, `fail2ban`, `curl`, `git`, `nginx`, `certbot`, `python3-certbot-nginx`, `nodejs` (v20 LTS via NodeSource), `unattended-upgrades`.
3. Install Node.js process manager PM2 globally: `npm install -g pm2`.
4. Configure UFW: deny inbound by default; allow 22/tcp from team IPs only, 80/tcp and 443/tcp from anywhere.
5. Configure fail2ban with `sshd` jail (5 retries, 24h ban) and an `nginx-botsearch` jail for common WP/phpmyadmin probes.
6. Configure `unattended-upgrades` for security patches only; manual review for other updates.
7. Provision 2 GB swap file (safety net; app should not rely on swap).
8. Create `/opt/app/` owned by `deploy` with subdirectories `releases/`, `shared/`, `current` (symlink to active release).
9. Install `doctl` with a deploy-scoped DigitalOcean token (Container Registry read only).
10. Install Postgres client tools for migration scripts.

**UFW rules (concrete):**

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <team-cidr-1> to any port 22 proto tcp comment 'SSH team'
sudo ufw allow from <team-cidr-2> to any port 22 proto tcp comment 'SSH team'
sudo ufw allow 80/tcp  comment 'HTTP (redirects to HTTPS)'
sudo ufw allow 443/tcp comment 'HTTPS'
sudo ufw enable
```

A DigitalOcean Cloud Firewall applies the same rules at the network edge by tag (`app-web`). The two-layer defense is intentional — if either layer is misconfigured during a change, the other catches it.

**fail2ban configuration (`/etc/fail2ban/jail.local`):**

```ini
[DEFAULT]
bantime  = 86400
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = 22
logpath  = %(sshd_log)s

[nginx-botsearch]
enabled  = true
port     = http,https
logpath  = /var/log/nginx/access.log
```

**SSH rules.**

- SSH on port 22, restricted to team IPs at both UFW and DO Cloud Firewall layers.
- No password login, ever. Key-only.
- `deploy` user is sudo-enabled for specific commands only (`systemctl`, `nginx`, `certbot`, `pm2`), not a blanket sudo grant.
- Root login is `prohibit-password` so the only path to root is via an `authorized_keys` entry that we explicitly place there (we don't — break-glass is via the DigitalOcean Droplet Console).

### 12.3 Reverse Proxy — nginx

nginx is the public-facing HTTP listener. It terminates TLS, serves static assets directly, and proxies dynamic requests to the app running on `127.0.0.1:3000`. The app never binds to a public port.

**Directory layout:**

```
/etc/nginx/
├── nginx.conf                 # Untouched OS default
├── conf.d/
│   └── security-headers.conf  # Shared HSTS, X-Frame-Options, etc.
└── sites-available/
    ├── app.conf               # Main app
    ├── booking.conf           # Booking widget subdomain
    └── webhooks.conf          # Webhook receivers (relaxed rate limits)
/etc/nginx/sites-enabled/      # Symlinks to sites-available
```

**Reference config (`sites-available/app.conf`):**

```nginx
# Upstream app cluster (PM2 runs 4 instances; nginx load-balances across them)
upstream app_cluster {
    least_conn;
    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3002 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3003 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

# Rate limit zones
limit_req_zone $binary_remote_addr zone=general:10m rate=20r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=booking:10m rate=10r/s;

# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name app.example.com;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

# Main app (HTTPS)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name app.example.com;

    ssl_certificate     /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;

    include /etc/nginx/conf.d/security-headers.conf;

    # Body size limit (form submissions with signatures/photos)
    client_max_body_size 25M;

    # Static assets — Next.js emits hashed filenames, cache aggressively
    location /_next/static/ {
        alias /opt/app/current/apps/web/.next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Auth endpoints — tighter rate limit
    location ~ ^/api/.*/auth/ {
        limit_req zone=auth burst=10 nodelay;
        proxy_pass http://app_cluster;
        include /etc/nginx/conf.d/proxy-common.conf;
    }

    # Public booking endpoints — medium rate limit
    location ~ ^/public/v1/(availability|appointments) {
        limit_req zone=booking burst=20 nodelay;
        proxy_pass http://app_cluster;
        include /etc/nginx/conf.d/proxy-common.conf;
    }

    # Everything else — general rate limit
    location / {
        limit_req zone=general burst=40 nodelay;
        proxy_pass http://app_cluster;
        include /etc/nginx/conf.d/proxy-common.conf;
    }

    # Healthcheck — no rate limit, no logs
    location = /healthz {
        proxy_pass http://app_cluster;
        access_log off;
    }
}
```

**Shared `conf.d/proxy-common.conf`:**

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_read_timeout 60s;
proxy_connect_timeout 10s;
proxy_send_timeout 60s;
```

**Shared `conf.d/security-headers.conf`:**

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

**Webhook endpoints — relaxed limits.** Stripe, TextLink, and Resend webhooks cannot be rate-limited the same way as user traffic. A separate `webhooks.example.com` subdomain routes to a dedicated `webhooks.conf` with no rate limiting and a 30-second `proxy_read_timeout`.

### 12.4 TLS — Let's Encrypt via Certbot

TLS certificates are issued by Let's Encrypt and renewed automatically. We use the nginx plugin for certbot — it edits nginx configs during issuance then reverts them.

**Initial issuance (run once per domain):**

```bash
sudo certbot --nginx -d app.example.com -d booking.example.com -d webhooks.example.com \
  --email ops@example.com \
  --agree-tos \
  --no-eff-email \
  --redirect
```

**Auto-renewal.** Certbot installs a systemd timer (`certbot.timer`) that runs twice daily and renews certs within 30 days of expiry. Verify with:

```bash
sudo systemctl list-timers certbot.timer
sudo certbot renew --dry-run
```

**Renewal hook** (`/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`):

```bash
#!/bin/bash
systemctl reload nginx
```

Set executable: `sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`.

**Wildcard certificates — deferred.** Multi-tenant per-tenant subdomains (`tenant1.booking.example.com`) eventually require a wildcard cert, which requires DNS-01 challenge and a DigitalOcean DNS API token. Deferred to Growth phase; MVP uses a single shared booking domain.

### 12.5 Process Manager — PM2

PM2 supervises the Node.js app and worker processes. It provides clustering (one worker per vCPU), zero-downtime reloads, and structured log management.

**`ecosystem.config.js` (checked into repo, deployed to Droplet):**

```javascript
module.exports = {
  apps: [
    {
      name: 'app-web',
      script: './apps/api/dist/server.js',
      instances: 4,                 // Matches 4 vCPU Droplet
      exec_mode: 'cluster',
      max_memory_restart: '800M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,                 // First instance; cluster mode auto-increments to 3001/3002/3003
      },
      error_file: '/opt/app/shared/logs/app-web-error.log',
      out_file: '/opt/app/shared/logs/app-web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS Z',
      merge_logs: true,
      kill_timeout: 10000,          // Give in-flight requests 10s to drain on reload
      listen_timeout: 10000,        // Wait 10s for app to call process.send('ready') before considering it online
      wait_ready: true,             // Requires app to emit 'ready' event on boot
    },
    {
      name: 'app-worker',
      script: './apps/workers/dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '600M',
      env_production: {
        NODE_ENV: 'production',
        WORKER_TYPES: 'notifications,webhooks,events',
      },
      error_file: '/opt/app/shared/logs/app-worker-error.log',
      out_file: '/opt/app/shared/logs/app-worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS Z',
      merge_logs: true,
    },
  ],
};
```

**App must emit `ready` signal for zero-downtime reloads:**

```typescript
// apps/api/src/server.ts
import { buildApp } from './app.js';

const app = await buildApp();
await app.listen({ port: Number(process.env.PORT), host: '0.0.0.0' });
if (process.send) process.send('ready');   // PM2 `wait_ready`
```

**Core PM2 commands:**

```bash
# Start everything from the ecosystem file
pm2 start ecosystem.config.js --env production

# Zero-downtime reload (preferred for deploys)
pm2 reload ecosystem.config.js --env production

# Save current process list so PM2 restarts it on reboot
pm2 save

# Install PM2 as a systemd unit (one-time, per Droplet)
pm2 startup systemd -u deploy --hp /home/deploy

# View logs
pm2 logs app-web --lines 100
pm2 logs app-worker --err --lines 100

# Metrics
pm2 monit
```

**Reload vs. restart.** `pm2 reload` performs rolling restart across cluster instances — nginx continues routing to healthy instances while each one restarts in turn. `pm2 restart` kills all at once. Deploys always use `reload`.

### 12.6 Environment Variables and Secrets

`.env` is not committed. It is written to `/opt/app/shared/.env` by cloud-init from DigitalOcean Spaces (or a real secrets manager once available) with `chmod 600` and `chown deploy:deploy`.

The shared `.env` is symlinked into each release: `ln -sf /opt/app/shared/.env /opt/app/current/.env`. This way secret rotation does not require a redeploy — edit shared, reload PM2.

### 12.7 CI/CD — GitHub Actions Deploy Pipeline

Two workflows: `ci.yml` runs on PRs; `deploy.yml` runs on merges to `main`.

**`.github/workflows/deploy.yml`:**

```yaml
name: Deploy Production

on:
  push:
    branches: [main]

concurrency:
  group: production-deploy
  cancel-in-progress: false       # Never cancel an in-flight deploy

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test

  build-and-push-image:
    needs: test
    runs-on: ubuntu-latest
    outputs:
      image_tag: ${{ steps.meta.outputs.tag }}
    steps:
      - uses: actions/checkout@v4
      - uses: digitalocean/action-doctl@v2
        with:
          token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}
      - name: Log in to DO Container Registry
        run: doctl registry login --expiry-seconds 1200
      - id: meta
        run: echo "tag=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT
      - name: Build and push
        run: |
          IMG=registry.digitalocean.com/${{ vars.DO_REGISTRY_NAME }}/app
          docker buildx build \
            --platform linux/amd64 \
            -t $IMG:${{ steps.meta.outputs.tag }} \
            -t $IMG:latest \
            --push \
            .

  migrate:
    needs: build-and-push-image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile --filter @app/db
      - name: Run expand-phase migrations
        env:
          DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
        run: pnpm --filter @app/db migrate:deploy
      # Migrations run BEFORE new code goes live.
      # Only expand-phase (backward-compatible) migrations run here.
      # Contract-phase migrations run in a separate workflow after the deploy that
      # stopped reading/writing the soon-to-be-removed columns.

  deploy:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - name: SSH deploy
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script_stop: true
          script: |
            set -euo pipefail
            cd /opt/app

            # Log in to registry on the Droplet (using Droplet-local doctl token, not CI token)
            doctl registry login --expiry-seconds 600

            # Create timestamped release directory
            RELEASE_ID=$(date -u +%Y%m%dT%H%M%SZ)-${{ needs.build-and-push-image.outputs.image_tag }}
            mkdir -p releases/$RELEASE_ID
            cd releases/$RELEASE_ID

            # Pull the image for this release
            docker pull registry.digitalocean.com/${{ vars.DO_REGISTRY_NAME }}/app:${{ needs.build-and-push-image.outputs.image_tag }}

            # Render ecosystem.config.js into this release directory
            # (pulled from the image or from git; pick one consistently)
            docker create --name extract registry.digitalocean.com/${{ vars.DO_REGISTRY_NAME }}/app:${{ needs.build-and-push-image.outputs.image_tag }}
            docker cp extract:/app/. ./
            docker rm extract

            # Link shared env file
            ln -sf /opt/app/shared/.env ./.env

            # Swap the 'current' symlink
            cd /opt/app
            ln -sfn releases/$RELEASE_ID current

            # Rolling reload (zero-downtime)
            cd current
            pm2 reload ecosystem.config.js --env production --update-env

            # Prune old releases (keep last 5)
            cd /opt/app/releases
            ls -1t | tail -n +6 | xargs -r rm -rf

            # Prune Docker images
            docker system prune -f

      - name: Health check
        run: |
          for i in {1..30}; do
            STATUS=$(curl -o /dev/null -s -w "%{http_code}" https://app.example.com/healthz)
            if [ "$STATUS" = "200" ]; then
              echo "Health check passed"
              exit 0
            fi
            echo "Attempt $i: status=$STATUS, retrying in 5s..."
            sleep 5
          done
          echo "Health check failed after 150s"
          exit 1

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1.27.0
        with:
          payload: |
            { "text": ":rotating_light: Production deploy failed: ${{ github.event.head_commit.message }}" }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_DEPLOY_WEBHOOK }}
```

### 12.8 Release Layout and Rollback

Each deploy creates a timestamped release directory. `current` is a symlink to the active release. Rollback is a symlink swap + PM2 reload — seconds, not minutes.

```
/opt/app/
├── current -> releases/20260420T143000Z-abc1234
├── releases/
│   ├── 20260420T143000Z-abc1234/     # Active
│   ├── 20260419T110000Z-9f8e7d6/     # Previous
│   ├── 20260418T090000Z-5c4b3a2/
│   └── ...                            # Last 5 kept
└── shared/
    ├── .env                           # Secrets (symlinked into each release)
    └── logs/                          # Persistent logs (symlinked)
```

**Fast rollback command (ad-hoc, when CI can't help):**

```bash
ssh deploy@app.example.com
cd /opt/app
ls releases/ | sort -r | head -5         # See recent releases
ln -sfn releases/20260419T110000Z-9f8e7d6 current
cd current && pm2 reload ecosystem.config.js --env production --update-env
curl -fsS https://app.example.com/healthz
```

**Migration rollback.** The expand/contract pattern means every deployed migration is backward-compatible with the previous code. Rolling back code does not require rolling back the database. If data corruption has occurred, use Managed Postgres Point-in-Time Recovery — but never as a reflex, only when data integrity is actually at stake.

### 12.9 Monitoring and Alerts

| Signal | Source | Alert threshold |
|---|---|---|
| HTTP 5xx rate | Sentry + nginx access logs | >1% of requests over 5 minutes |
| HTTP p95 latency | APM (Sentry Performance or Grafana) | >800ms over 5 minutes |
| Droplet CPU | DigitalOcean Monitoring | >80% for 10 minutes |
| Droplet memory | DigitalOcean Monitoring | >85% for 5 minutes |
| Droplet disk | DigitalOcean Monitoring | >85% (hard), >75% (warn) |
| Droplet unreachable | DigitalOcean uptime check | 2 consecutive failures |
| BullMQ queue depth | Redis INFO + custom exporter | >1000 jobs in any single queue for 5 minutes |
| Postgres replication lag | Managed DB insights | >10s |
| Stripe webhook failures | Sentry | Any failure, immediate |
| TextLink failed-webhook rate | Application metric | >5% of sends failing over 15 minutes |
| PM2 process crashes | PM2 + log exporter | >3 restarts in 10 minutes |
| SSL cert expiry | External monitor | <14 days remaining |

Alerts route to Slack (non-critical) or PagerDuty (critical). No production alerts go to a single individual's email inbox.

### 12.10 Backup and Disaster Recovery

**Droplet-level backups.** DigitalOcean's Backups add-on (weekly, retained 4 weeks). Purpose: "the whole Droplet caught fire" recovery.

**Manual snapshots.** Before any risky operation (OS upgrade, nginx config overhaul, kernel update): `doctl compute droplet-action snapshot <droplet-id> --snapshot-name "pre-<change>-<date>"`.

**Database backups.** Managed Postgres includes daily automated backups + Point-in-Time Recovery back 7 days on the basic tier, 14 days on the professional tier.

**Secrets backup.** `.env` is regenerated from the secrets manager (source of truth). The Droplet is not the backup.

**Configuration backup.** All nginx configs, PM2 ecosystem, cloud-init scripts live in the git repo. No snowflake configuration on the Droplet.

**Recovery test.** Once per quarter, spin up a fresh Droplet from cloud-init, restore Postgres to a scratch instance from the latest backup, point the fresh Droplet at it, verify healthz. A backup you have never restored is not a backup.

### 12.11 Scaling Path

The MVP Droplet is sized for early production. Scaling options, in preferred order:

1. **Vertical resize** via `doctl compute droplet-action resize <id> --size s-4vcpu-16gb --wait`. Reversible for CPU+RAM-only resizes. First lever.
2. **Add Managed Redis**, move Redis off the Droplet. Recovers 500+ MB of RAM and removes the last stateful dependency from the Droplet.
3. **Add DigitalOcean Load Balancer + second Droplet.** Requires the app to be fully stateless (sessions in DB/Redis, uploads in Spaces, no local file writes that matter). We write toward this from day one.
4. **Move to App Platform or DOKS (Kubernetes).** Only when the team has real ops capacity and traffic warrants it. Droplets remain cheaper and simpler until that point.

### 12.12 DigitalOcean API Usage

CI/CD and scripted operations use the DigitalOcean API via `doctl` or Terraform, never manual dashboard clicks for infra that needs to be reproducible.

**Token hygiene (see `digitalocean-api.md` for full detail):**

- One token per purpose, named for its role (`ci-deploy`, `terraform-prod`, `droplet-registry-pull`).
- Narrowest scope that works. A deploy token needs Container Registry read, not Billing access.
- Rotate every 90 days for CI tokens, 365 for long-lived read-only tokens, immediately on team-member departure.
- Stored in GitHub Actions secrets for CI, or in the secrets manager for runtime use.

**Rate limits.** 5,000 requests per hour, 250 per minute per token. Respect `Retry-After` header on 429s. Special tighter limits on `/v2/account/keys` (10/min) and `/v2/cdn/endpoints` (5/10s).

### 12.13 Deploy Window Policy

MVP: deploy any time, small changes, often. Velocity over caution before there are paying customers.

Post-launch:

- Normal deploys: Monday–Thursday, business hours.
- No deploys: Friday afternoons, weekends, holidays — unless it's a security or correctness hotfix with an on-call engineer actively watching.
- Planned maintenance windows for anything requiring downtime (DB major version upgrade, region move) — announced to customers in advance.

---

## PART 13 — Delivery Phases & MVP Cut Lines {#part-13}

Phasing is the single most important delivery decision. The research's 24–30 week MVP estimate is realistic only if we hold the cut lines below firmly.

### 13.1 Phase 1 — MVP (24–30 weeks)

**Included:**

- Auth, tenancy, users, basic RBAC (default roles including `subcontractor`)
- Subcontractor isolation model: `employment_type` field, `isolation_scope` RLS policies, Stripe Connect split payout (see 5.4.1)
- Scheduling: appointments with staff + service + optional resource
- Clients: full profile schema, structured notes across 10 categories with pop-up alerts at booking/check-in/checkout + acknowledgment audit, photo/file attachments with folder organization, basic SOAP notes linked to appointments (lockable with revision history), pre-appointment briefing, banned-client handling, visit history, tokenized cards (see 5.2)
- Payments: one-time charges, deposits, refunds, tokenized cards, Stripe Terminal
- Cancellation & no-show policy engine with staff override and fee-failure handling (see 5.3.1 / 5.3.2)
- Memberships: fixed-price monthly via Stripe Billing
- Packages: prepaid session packages
- Gift cards: balance tracking
- Online booking: consumer web + embeddable widget
- Full no-code form builder with drag-and-drop UX, 14 MVP field types including canvas signature, 16 seeded templates across all verticals, versioning, email + SMS distribution via magic links, reminder scheduling, PDF export and print via Puppeteer, signature audit bundles, form analytics (see 5.7)
- Visual automations builder with event/schedule/manual triggers, 9 MVP action types, condition branching, wait steps, 10 seeded automation templates, dry-run mode, execution debugging, spend caps and loop detection, n8n bridge (outbound webhook action + inbound API) (see 5.9)
- Notifications: TextLink SMS + Resend email via the trigger map in 8.8
- TextLink multi-SIM routing logic (see 8.6)
- Reporting: MVP reports listed in 10.3
- Admin settings and multi-location configuration
- Staff time clock (simple clock-in/out)
- Internal event bus (Redis Streams)
- In-DB feature flags (tenant-level overrides, cached in Redis)
- Single-Droplet production deployment per PART 12

**Explicitly excluded from MVP:**

- Classes / class occurrences / registrations
- Pick-a-spot seating
- Inventory / retail POS beyond gift cards
- Commissions calculation (time clock data captured, calc deferred)
- Advanced form capabilities: conditional logic engine, file/photo upload fields, dual-signature consent, anatomy-chart drawing, address autocomplete, repeatable sections (multi-page is MVP; conditional logic is Growth — see 5.7.9)
- Clinical SOAP notes (the `protected.*` partitioned variant) and protected-records partition (medspa) — note that basic non-clinical SOAP notes ARE in MVP per 5.2.5
- Dedicated marketing campaign UI (bulk email/SMS blasts, audience segmentation, drip builders separate from the automations module). Note that tenants CAN build marketing flows using the automations module in MVP — the exclusion is the dedicated "Marketing" product surface with segmentation tools
- Public API + webhook developer portal
- Mobile apps (PWA only)
- AI features
- Data lake / BI connectors
- Consumer marketplace / discovery
- Automatic no-show state transitions (manual only at MVP — see 5.3.1)

### 13.2 Phase 2 — Growth (weeks 30–46)

**Added:**

- Classes, class templates, class occurrences, registrations, waitlist promotion
- Pick-a-spot reserved seating
- Inventory: products, SKUs, stock movements, retail checkout
- Commissions engine + payroll export (Gusto, Check, generic CSV)
- Advanced form engine: conditional logic, multi-page, media upload, digital signature audit packet
- Kiosk / check-in mode (PWA variant)
- Review prompt flow (SMS 24h post-completion)
- Public REST API (full CRUD on primary entities) + webhook subscriptions + developer portal
- Warehouse + Metabase dashboards for tenants
- React Native mobile apps (staff + consumer)

### 13.3 Phase 3 — Full Platform (weeks 46–60)

**Added:**

- SOAP notes + protected records partition (medspa vertical)
- Branded mobile app wrapper (per-tenant white-label)
- AI receptionist (inbound SMS → LLM → reply)
- AI growth assistant (insights, recommendations)
- Advanced marketing automation (journeys, segmentation)
- Data lake export product (Parquet, Power BI / Tableau template apps)
- Multi-location enterprise: franchise royalties, cross-location memberships, centralized pricing
- Stripe Capital integration
- BNPL via Payment Element
- Tap to Pay on iPhone

### 13.4 Team Shape

| Role | MVP | Growth | Full |
|---|---:|---:|---:|
| Product manager | 1.0 | 1.0 | 1.5 |
| Tech lead / architect | 1.0 | 1.0 | 1.0 |
| Backend engineers | 2.0 | 3.0 | 4.0 |
| Frontend web engineers | 2.0 | 3.0 | 3.0 |
| Mobile engineer (RN) | 0.0 | 1.5 | 2.0 |
| Product designer | 1.0 | 1.5 | 2.0 |
| QA / automation | 1.0 | 1.5 | 2.0 |
| DevOps / platform | 0.5 | 1.0 | 1.5 |
| Data / analytics engineer | 0.0 | 1.0 | 1.5 |
| Security / compliance | 0.25 | 0.5 | 1.0 |

### 13.5 Cut-Line Decision Framework

When pressure emerges to pull something into MVP that wasn't planned, run it through this test:

1. **Does any paying customer ship without it?** If no, it's required. If yes, it's deferrable.
2. **Does excluding it force a data model or architectural compromise?** If yes, bring forward the schema but defer the feature.
3. **Does it depend on another MVP feature being correct?** If yes, the dependency chain is real.
4. **Is it a safety/compliance floor?** (Opt-out, audit logs, PCI posture, tenant isolation.) If yes, not optional.

---

## PART 14 — Non-Functional Requirements {#part-14}

### 14.1 Availability

| Metric | Target |
|---|---|
| Core booking uptime | 99.9% monthly (match Mindbody's public claim) |
| Notification dispatch SLA | 95% of notifications queued → sent within 60s |
| Webhook delivery SLA | 99% of subscribed webhooks delivered within 30s of event |
| Page load (staff web, cached) | p75 < 2s, p95 < 5s |
| API response (internal) | p95 < 300ms for reads, p95 < 800ms for writes |

### 14.2 Security

- TLS 1.3 everywhere; HSTS enabled.
- Postgres at rest encryption via DigitalOcean Managed Databases (enabled by default).
- Secrets via a dedicated secrets manager (Doppler, 1Password Secrets Automation, or HashiCorp Vault); DigitalOcean's secrets offering is usable once GA. Never committed to source.
- Staff MFA required on all admin-level accounts; optional on provider accounts.
- Session cookies are HttpOnly, Secure, SameSite=Lax for web sessions.
- CSRF protection on all state-changing internal API endpoints.
- Content Security Policy on all rendered pages; strict on staff web.
- Rate limiting at edge layer by IP + user + API key.
- Audit log on every permission-check event; retained 1 year minimum.
- Annual penetration test by a reputable third party.

### 14.3 Compliance

- **PCI DSS:** SAQ-A posture only — card data never touches our servers. All supported providers use tokenization via their hosted elements / SDKs (Stripe Elements/Terminal, Square Web Payments SDK/Reader, Clover Ecommerce SDK, Authorize.net Accept.js). See 9.12 for the per-provider breakdown. Tenants using the custom webhook escape hatch are contractually responsible for their own PCI posture — our contract accepts tokens only.
- **HIPAA:** Only applies to medspa tenants with the `protected_records` feature enabled. Requires BAAs with the tenant's chosen payment processor (Stripe has a BAA available; Square historically has not — this is a config-time check), DigitalOcean (available on higher-tier plans), Resend (verify at activation), and any other subprocessor touching PHI. TextLink is not HIPAA-compliant; SMS to HIPAA tenants must not contain PHI. Medspa tenants on providers without a BAA are blocked at tenant setup with a clear explanation.
- **TCPA / CTIA:** Opt-out enforcement on all consumer SMS; consent capture recorded at first message send.
- **GDPR / CCPA:** Data export and deletion flows available in tenant admin; retention policies configurable per tenant.

### 14.4 Observability

- Every HTTP request and every worker job carries a correlation ID propagated to downstream services.
- Structured JSON logs; never console.log.
- OpenTelemetry traces on all app and worker code paths.
- Alerts on: app error rate, webhook failure rate, notification dispatch failure rate, Stripe webhook lag, Postgres replication lag, queue depth.

---

## PART 15 — Open Questions & Risks {#part-15}

### 15.1 Open Questions (to resolve before Phase 1 kickoff)

1. **Stripe Connect account type for platform default — Standard or Express?** Standard gives tenants a full Stripe dashboard (better for sophisticated operators); Express is more embedded (better for onboarding velocity) but requires us to build more surface area. Recommendation: Standard for MVP so we don't become the tier-1 support line for Stripe questions; revisit Express as a Growth-phase onboarding variant.
2. **Platform fee rate on platform-default Stripe Connect.** What do we charge? GlossGenius charges a flat 2.6% + fixed. Vagaro is tiered. Mindbody is custom-quoted. MVP needs a number. Recommendation: match GlossGenius at 2.6% + $0.10 for transparency.
3. **SaaS pricing for BYO tenants.** If a tenant brings their own Stripe/Square and we take no `application_fee_amount`, we need subscription revenue to cover their use of the platform. What tier? Recommendation: tiered per location + per active staff seat, separately invoiced via our own Stripe account.
4. **Square adapter scope at MVP — BYO only, or also platform-default Square?** The answer shapes how much OAuth and sub-merchant complexity we take on in MVP. Recommendation: BYO only. A tenant without any processor starts with our platform-default Stripe Connect; tenants bringing Square are migrating with their own Square account.
5. **Are we running our own TextLink devices or pushing customers to bring their own?** Research shows running our own pool of SIMs is operationally expensive and carrier-risk-exposed. Decision affects pricing model.
6. **PWA vs. React Native in MVP — firm?** Holding the line on PWA adds substantial development speed but will be audibly criticized by customers who compare to GlossGenius's native app polish. Note that Square Terminal in MVP depends on this decision (see 9.7).
7. **Medspa vertical timing.** Protected records partition is in schema from day one, but feature ships in Full Platform. Do we have a design partner medspa customer to validate the model before then?
8. **Class-led verticals (fitness).** Same question. Class model is in schema from day one but feature ships in Growth. Do we have a fitness design partner?
9. **Managed n8n hosting timing.** Tenant-hosted n8n (5.9.5) is enough for Growth — but the operational burden on tenants to self-host n8n is real, and it's plausibly a paid upsell. Do we ship managed n8n in Growth alongside the bridge, or defer to Full Platform? Recommendation: bridge in MVP, managed hosting in Growth only if we sign 10+ paying tenants who explicitly request it.

### 15.2 Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| TextLink carrier suspension of our SIMs | Medium | SMS outage per affected SIM | Multi-SIM pool, business-plan carriers, Twilio fallback in Growth |
| Provider account dispute/freeze on a single tenant | Low per tenant | Payment outage for that tenant only | Clear communication; multi-provider support means affected tenants can switch, though with manual card-on-file re-tokenization |
| Provider-wide outage (Stripe or Square down) | Low | Partial platform outage — all tenants on affected provider cannot charge | Status-page monitoring, clear client-facing error UI, document manual-entry fallback where legally acceptable |
| Provider API breaking change (any of Stripe/Square/Clover) | Medium over multi-year horizon | Adapter breakage | Version each adapter against a specific API version; automated contract tests; subscribe to each provider's deprecation mailing list |
| Capability-feature drift across providers | Medium | UX inconsistency complaint | Capability flags + capability-gated UI (9.3); explicit error messages when a feature is gated; release notes document provider-specific differences |
| Reconciliation drift between provider balance and our ledger | Medium | Financial reporting wrong | Nightly per-provider per-tenant reconciliation job with Slack alerts (9.11) |
| Custom webhook tenant fails their integration and loses charges | Medium (when that adapter ships in Growth) | Lost revenue + angry customer | Mandatory end-to-end test suite at onboarding; 60-second timeout with clear client-facing error; reference implementations published |
| Runaway automation flow burns through SMS/email budget | Medium | Surprise bill + potential SIM carrier block | Spend caps per flow (5.9.7), tenant-wide daily ceiling, loop detection via causation chain, mandatory dry-run before enable |
| n8n bridge: tenant's n8n endpoint is slow or down, our flows stall | Medium | Delayed or failed automation steps | Timeout on outbound webhook action (10s default), retry policy per step, clear failure surfacing in run detail view |
| Form builder produces a form schema we can't later render (schema drift across versions) | Low | Historical submissions fail to render | Schema versioning with strict JSON-schema validation at save time; migration tests required for any field-type changes; version pinning on submissions |
| Scope creep pulling Growth features into MVP | High | Timeline slip | Cut-line decision framework in 13.5, PM accountability |
| Multi-tenant data leak via missing RLS policy | Low | Catastrophic | RLS enforced at schema level, automated test suite asserts isolation on every table |
| Webhook retry amplification (us sending, customer failing loudly) | Medium | Noisy alerts | Exponential backoff + DLQ + customer-facing webhook health UI |
| Event bus unbounded growth | Low | Redis memory pressure | `MAXLEN ~ 1000000` per stream; archive to Spaces weekly |
| Competitor parity pressure from GlossGenius UX | High | Launch perception problem | Invest in design phase 0 before engineering starts any module UI |

---

## Appendix — Reference Tables {#appendix}

### A. Module Ownership Matrix

| Module | Owner | On-call | Runbook |
|---|---|---|---|
| `auth` | TBD | TBD | TBD |
| `catalog` | TBD | TBD | TBD |
| `scheduling` | TBD | TBD | TBD |
| `clients` | TBD | TBD | TBD |
| `payments` | TBD | TBD | TBD |
| `memberships` | TBD | TBD | TBD |
| `inventory` | TBD | TBD | TBD |
| `staff` | TBD | TBD | TBD |
| `forms` | TBD | TBD | TBD |
| `automations` | TBD | TBD | TBD |
| `marketing` | TBD | TBD | TBD |
| `notifications` | TBD | TBD | TBD |
| `files` | TBD | TBD | TBD |

### B. Event Catalog (Launch Set)

| Event | Emitter | Consumers |
|---|---|---|
| `appointment.created` | scheduling | notifications, data-sync, public-webhooks |
| `appointment.confirmed` | scheduling | notifications, data-sync, public-webhooks |
| `appointment.cancelled` | scheduling | notifications, data-sync, public-webhooks, waitlist-promoter |
| `appointment.checked_in` | scheduling | notifications, data-sync |
| `appointment.completed` | scheduling | notifications (review prompt scheduler), data-sync, public-webhooks |
| `appointment.no_show` | scheduling | notifications, payments (no-show fee), data-sync |
| `class.occurrence.created` | scheduling | data-sync, public-webhooks |
| `registration.created` | scheduling | notifications, data-sync, public-webhooks |
| `registration.cancelled` | scheduling | notifications, data-sync, waitlist-promoter |
| `waitlist.entry.created` | scheduling | data-sync |
| `waitlist.entry.promoted` | waitlist-promoter | notifications, data-sync |
| `client.created` | clients | data-sync, public-webhooks, marketing |
| `client.updated` | clients | data-sync, public-webhooks |
| `payment.succeeded` | payments | scheduling, memberships, data-sync |
| `payment.failed` | payments | notifications, data-sync |
| `sale.completed` | payments | notifications, data-sync, public-webhooks |
| `sale.refunded` | payments | notifications, data-sync, public-webhooks |
| `membership.started` | memberships | notifications, data-sync, public-webhooks |
| `membership.renewed` | memberships | data-sync |
| `membership.payment_failed` | memberships | notifications (dunning), data-sync |
| `membership.cancelled` | memberships | notifications, data-sync, public-webhooks |
| `form.submitted` | forms | data-sync, public-webhooks, automations |
| `form.assignment.created` | forms | automations |
| `form.assignment.expired` | forms | automations |
| `automation.run.started` | automations | data-sync |
| `automation.run.succeeded` | automations | data-sync, public-webhooks |
| `automation.run.failed` | automations | data-sync, public-webhooks, notifications (admin alert) |
| `review.prompt.scheduled` | notifications | notifications (delayed) |

### C. Canonical Status Enums

| Entity | Status values |
|---|---|
| Appointment | `pending_payment`, `confirmed`, `checked_in`, `in_progress`, `completed`, `no_show`, `cancelled` |
| Registration | `confirmed`, `waitlisted`, `checked_in`, `completed`, `no_show`, `cancelled` |
| Sale | `open`, `completed`, `voided`, `refunded_partial`, `refunded_full` |
| PaymentIntent | `requires_action`, `processing`, `succeeded`, `failed`, `cancelled` |
| Membership | `active`, `paused`, `past_due`, `cancelled`, `expired` |
| Package | `active`, `exhausted`, `expired`, `refunded` |
| MessageDispatch | `queued`, `sent`, `delivered`, `failed`, `suppressed` |
| WaitlistEntry | `waiting`, `promoted`, `expired`, `cancelled` |

### D. Key Integration Endpoints

| Provider | Endpoint / product | Reference doc |
|---|---|---|
| TextLink | `https://textlinksms.com` + webhook | `textlink-integration-guide.md` |
| Resend | `https://api.resend.com` + Svix webhooks | Provider docs |
| Stripe | `https://api.stripe.com` + webhook | Provider docs |
| Stripe Terminal | Stripe Terminal SDK (JS / Swift / Kotlin) | Provider docs |

### E. Environment Variables (Launch Set)

```bash
# ---------- Database ----------
# Primary Postgres connection (DigitalOcean Managed Databases in MVP)
DATABASE_URL=postgres://...

# Read replica — NOT configured at MVP. Leave unset.
# When set, read-only analytical queries will route here.
# Add a Managed DB read replica in Growth phase when reporting load
# starts affecting write performance on the primary.
DATABASE_REPLICA_URL=

# ---------- Redis ----------
# Local Redis on the Droplet at MVP.
# Move to DigitalOcean Managed Redis in Growth phase.
REDIS_URL=redis://localhost:6379

# ---------- Auth ----------
SESSION_SECRET=
CSRF_SECRET=

# ---------- Stripe (platform default + BYO adapter) ----------
# Platform account (for our own SaaS subscription billing of BYO tenants, and
# for the platform-default Stripe Connect onboarding flow)
STRIPE_PLATFORM_SECRET_KEY=
STRIPE_PLATFORM_PUBLISHABLE_KEY=
STRIPE_PLATFORM_WEBHOOK_SECRET=
STRIPE_PLATFORM_CONNECT_CLIENT_ID=    # For OAuth flows with BYO Stripe tenants
# Stripe Connect charges tenants with platform-default mode go through these
# (same keys above — Connect is a mode, not a separate account)

# ---------- Square (BYO adapter) ----------
SQUARE_APPLICATION_ID=                 # Registered at developer.squareup.com
SQUARE_APPLICATION_SECRET=             # For OAuth flows
SQUARE_OAUTH_REDIRECT_URL=             # Our callback endpoint
SQUARE_WEBHOOK_SIGNATURE_KEY=          # For verifying Square webhooks
SQUARE_ENVIRONMENT=sandbox             # 'sandbox' | 'production'

# ---------- Clover (Growth phase) ----------
# Per-tenant credentials stored in tenant_payment_configurations.api_credentials
# No platform-level env vars required until we build OAuth-based Clover onboarding.

# ---------- Authorize.net (Growth phase) ----------
# Same — per-tenant API Login ID + Transaction Key in tenant_payment_configurations.

# ---------- Custom webhook escape hatch (Growth phase) ----------
# Each tenant configures their own endpoint + HMAC secret at onboarding time.
# No platform-level env vars.

# ---------- TextLink (see textlink-integration-guide.md) ----------
TEXTLINK_API_KEY=
TEXTLINK_WEBHOOK_SECRET=
# Fallback SIM ID used by SIM resolver rule 4 (see 8.6) when a location
# has no default_textlink_sim_id configured. Tenant-level absolute fallback.
TEXTLINK_DEFAULT_SIM_ID=

# ---------- Resend ----------
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=

# ---------- Storage (DigitalOcean Spaces, S3-compatible) ----------
S3_ENDPOINT=https://<region>.digitaloceanspaces.com
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# ---------- Observability ----------
SENTRY_DSN=
OTEL_EXPORTER_OTLP_ENDPOINT=

# ---------- Feature flags ----------
# MVP: in-DB feature flags via the `feature_flags` table + per-tenant overrides
# in `tenant_feature_flags`. Evaluated at request time, cached in Redis for 60s.
# No external provider needed. A small React hook + backend middleware read the
# cache and expose flags to code paths.
#
# Growth phase: swap to LaunchDarkly, Statsig, or Unleash if we need
# percentage rollouts, targeting rules, or experimentation.
FEATURE_FLAGS_PROVIDER=internal        # 'internal' (MVP) | 'launchdarkly' | 'statsig'

# ---------- DigitalOcean (for deploy tooling and runtime registry pulls) ----------
# Set on the Droplet for `doctl registry login`. CI has its own token in GH secrets.
DIGITALOCEAN_ACCESS_TOKEN=
DO_REGISTRY_NAME=
```

### F. Document Version History

| Version | Date | Changes |
|---|---|---|
| v1.0 | April 2026 | Initial master spec. Synthesizes `deep-research-report.md` competitive analysis and `textlink-integration-guide.md` notification architecture into a unified engineering blueprint. Multi-vertical from day one. Recommended stack with alternatives. MVP → Growth → Full phasing with firm cut lines. |
| v1.1 | April 2026 | Added PART 12 (Deployment Architecture — DigitalOcean Droplet) with full nginx config, PM2 ecosystem, Certbot setup, GitHub Actions deploy pipeline, UFW/fail2ban hardening, and release layout. Added 5.4.1 subcontractor isolation model (employment_type, RLS policies, feature matrix, Stripe Connect split payout). Added 5.3.1 / 5.3.2 cancellation and no-show policy engine with fee-failure handling. Added 5.7.1 form magic-link security model (token format, single-use semantics, expired/used redemption flows). Added 8.6 TextLink multi-SIM routing logic with decision tree and resolver. Moved forms into MVP scope. Reconciled UUID v7 vs. v4 guidance. Updated env var table with DigitalOcean specifics, in-DB feature flags for MVP, and replica-not-configured note. Renumbered Parts 13/14/15 (previously 12/13/14). |
| v1.2 | April 2026 | **Full rewrite of PART 9 (Payments Architecture) from single-provider Stripe to multi-provider with abstraction layer.** Added 9.1 strategic frame, 9.2 provider support matrix (Stripe, Square, Clover, Authorize.net, Adyen, custom webhook), 9.3 `PaymentsProvider` typed interface with capability gating, 9.4 `tenant_payment_configurations` schema with encrypted secrets and location-level overrides, 9.5 four onboarding flows (platform Stripe Connect default, BYO Stripe, BYO Square, custom webhook), 9.6 provider-neutral charge flow, 9.7 terminal/in-person honest scope (Stripe Terminal + Clover Mini in MVP; Square Terminal deferred to Growth+RN), 9.8 recurring billing per-provider capability, 9.9 dispute handling (stays with provider), 9.10 custom webhook contract with outbound/inbound event schema, 9.11 per-provider reconciliation invariants, 9.12 PCI posture per provider, 9.13 alternatives, 9.14 MVP/Growth/Full scope breakdown. Knock-on updates: 5.3 module scope, 5.3.2 failure handling (provider-neutral), 5.4.1 subcontractor payout (provider-agnostic `createSplitCharge`), PART 11 stack table + rationale, PART 14.3 compliance (BAA per-provider), PART 15.1 open questions (Stripe Connect Standard vs Express answered, platform fee rate added, BYO SaaS pricing added, Square MVP scope added), PART 15.2 risk register (provider-wide outage, API breaking change, capability drift, custom-webhook tenant-failure risks added). Env vars updated with Stripe platform keys, Square OAuth credentials, and notes on per-tenant storage for Clover/Authorize.net/custom webhook. Confirmed Droplet spec at 4 vCPU / 8 GB / 80 GB unchanged. |
| v1.3 | April 2026 | **Full rewrite of Section 5.2 (Client CRM) based on competitive research into Mindbody, Vagaro, and GlossGenius client record features.** Expanded from 7 lines to a full module specification covering: 5.2.1 complete client profile schema with optional medspa-protected extension fields, 5.2.2 structured notes model with 10 seeded categories (general, preference, formula, allergy, medical, clinical, behavioral, billing, relationship, internal) and per-category priority/visibility/trigger defaults, 5.2.3 pop-up alert UX at three critical moments (booking, check-in, checkout) with acknowledgment audit for liability defense, 5.2.4 photo and file attachments with folder organization, EXIF stripping, thumbnail generation, and before/after comparison views, 5.2.5 SOAP notes linked to appointments with revision-preserving lock mechanism and ICD/CPT code capture, 5.2.6 pre-appointment briefing (in-app card + opt-in daily push via TextLink), 5.2.7 subcontractor visibility rules with safety-critical carve-outs for allergy/medical/behavioral alerts, 5.2.8 banned client handling with cross-location scoping, 5.2.9 MVP/Growth/Full scope. Updated MVP inclusion list in 13.1 to reflect the richer CRM. Reconciled SOAP notes scope: basic non-clinical SOAP notes are MVP; the protected partition for medspa clinical notes is still a Growth/Full feature. Droplet spec unchanged. Payments architecture unchanged. |
| v1.4 | April 2026 | **Full form-builder module specification and new Automations module.** (1) Section 5.7 expanded from a flat scope paragraph to a nine-subsection form-builder spec: 5.7.2 form definition schema with versioning and submission-preserves-version contract; 5.7.3 field-type library (14 MVP types + 8 Growth types) with validation rule grammar; 5.7.4 visual drag-and-drop builder UX with keyboard shortcuts and 16 seeded templates across verticals; 5.7.5 distribution via email (Resend), SMS (TextLink), in-person kiosk, and inline booking with BullMQ-scheduled reminders; 5.7.6 PDF export and print via Puppeteer with signature audit bundles for liability defense; 5.7.7 form analytics; 5.7.8 integration with scheduling, client CRM, notifications, automations, payments; 5.7.9 explicit MVP/Growth/Full scope. (2) New Section 5.9 Automations Module: 5.9.1 module overview as event-bus consumer; 5.9.2 flow/trigger/step/action schema with restricted condition expression language; 5.9.3 execution runtime on BullMQ with retry and rate limits; 5.9.4 visual flow builder using React Flow with 10 seeded templates; 5.9.5 **n8n bridge** (own engine + bridge pattern — tenant-hosted n8n in MVP; managed n8n hosting as Growth upsell) with outbound webhook action, inbound automation API, and reference n8n workflow library; 5.9.6 observability with run detail view, dry-run, re-run; 5.9.7 safety (loop detection, spend caps, tenant-wide ceilings, mandatory dry-run before enable); 5.9.8 MVP/Growth/Full scope. (3) Knock-on updates: added `automations` module to 3.2 module table and appendix ownership matrix; added form/automation events to event catalog (Appendix B) and public webhook catalog (6.4); updated MVP scope list in 13.1 to include full form builder and automations; reconciled MVP exclusions (multi-page is now MVP via builder; conditional logic remains Growth; marketing-campaign UI clarified as a separate product surface from the automations module); added three automation-specific risks to register (runaway flows, n8n endpoint down, form schema drift); added n8n managed-hosting timing as open question. Droplet spec unchanged. Payments architecture unchanged. Client CRM unchanged. |

### G. Companion Documents

| Document | Purpose |
|---|---|
| `deep-research-report.md` | Competitive analysis of Mindbody, Vagaro, and GlossGenius. Source for positioning decisions in PART 1. |
| `textlink-integration-guide.md` | SMS gateway integration — device setup, API reference, webhook handling, carrier compliance. Source for PART 8. |
| `mindbody-rebuild-master-spec.md` | *This document.* Engineering blueprint. |
