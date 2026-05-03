# Wellos — Services & Catalog Feature Write-Up

**Area:** Services & Catalog  
**Scope:** 9 core features + 1 custom row  
**Connected app areas:** Staff Booking Area, Calendar, Public Booking, Client CRM, Payments, Reporting, Admin Settings  
**Purpose:** Define the service catalog features that control what can be booked, who can perform it, how long it takes, how much it costs, how it appears to clients/staff, and how it drives availability, appointment creation, checkout, client history, and reporting.

**Related:** [calendar-area-features.md](./calendar-area-features.md) (calendar ↔ catalog), [staff-booking-client-crm.md](./staff-booking-client-crm.md), [staff-booking-implementation-map.md](./staff-booking-implementation-map.md).

**Repo API note:** HTTP routes in this monorepo are on the Fastify app under `/admin/...` (not a separate `/api/admin/...` prefix). Public tenant-scoped routes will follow the same pattern when exposed.

---

## 1. Why Services & Catalog Matters

Services are the center of the booking system.

Every appointment starts with a service. The selected service determines:

- What the client sees on the public booking page
- Which staff members are eligible to perform the appointment
- How long the appointment lasts
- What price is locked onto the appointment
- Whether buffers, deposits, cancellation fees, or no-show fees apply
- Which intake forms, prep instructions, contraindication questions, or reference-photo uploads are required
- Which room, chair, bed, equipment, or resource may be needed
- How the appointment appears on the calendar
- What gets written back into the client profile after the appointment

The catalog must feel simple in the UI, but it needs to be strong enough underneath to support salons, medspas, massage, wellness, fitness, and personal training.

---

## 2. Feature + Benefit Matrix

| # | Feature | What It Does | Benefit | Booking / Calendar Connection |
|---:|---|---|---|---|
| 1 | Service Profile | Stores the name, category, description, duration, base price, active status, color, and public/private visibility for each service. | Gives the business one clean source of truth for every bookable offer. | The booking flow pulls active services into public booking, Quick Book, and calendar drag-to-create. |
| 2 | Categories + Display Order | Groups services by category such as Massage, Facial, Injectables, Hair, Classes, Consultations, or Packages. Supports manual ordering. | Makes large catalogs easier to scan and keeps the booking page from feeling overwhelming. | Public booking uses categories for filtering; staff booking uses categories to speed up service selection. |
| 3 | Duration + Buffer Rules | Defines service length plus optional buffer before/after. | Prevents staff from being booked back-to-back when setup, cleanup, travel, or consultation time is needed. | Availability engine subtracts service duration and buffers from open staff time before showing slots. |
| 4 | Pricing + Price Disclosure | Stores base price, starting-at language, deposit amount, price range, and whether pricing is hidden, fixed, or consultation-based. | Keeps client expectations clear and reduces checkout confusion. | Appointment locks the service price at booking time so future price changes do not alter existing appointments. |
| 5 | Staff Eligibility | Controls which staff members can perform each service. | Prevents accidental mis-bookings with unqualified staff. | Staff booking dropdown filters services by selected staff; public booking filters available staff by selected service. |
| 6 | Resource Requirements | Defines required rooms, chairs, beds, machines, equipment, or other operational resources. | Prevents booking a service when the required room/equipment is already in use. | Availability engine checks staff availability and resource availability before returning a slot. |
| 7 | Booking Policies Per Service | Stores rules such as minimum notice, max booking window, approval required, card-on-file required, cancellation window, cancellation fee, and no-show fee. | Lets high-risk or high-value services have stricter rules without making the whole business harder to book. | Booking engine resolves service-level policy during booking, cancellation, reschedule, and no-show flows. |
| 8 | Booking Page Content | Adds client-facing content: gallery images, long description, what to expect, prep instructions, aftercare, FAQ, and highlighted review/testimonial. | Turns the service page into a trust-building sales surface, not just a time selector. | Public booking opens a service detail sheet before time selection; confirmation can show prep/aftercare content. |
| 9 | Service-Linked Forms, Notes + CRM History | Links required intake forms, waivers, SOAP note templates, formula notes, before/after photos, and service-specific client notes. | Makes the service operationally smart and keeps appointment history organized by service. | Appointment detail, staff briefing, and client profile all surface service-specific history before and after booking. |
| 10 | Custom Row | Tenant-defined service/catalog field. Examples: contraindication gate, provider certification required, room setup checklist, prep checklist, add-on compatibility, color formula type, or machine settings. | Lets each business adapt the catalog to its real workflow without forcing custom code. | Custom row can be configured to appear in staff booking, public booking, appointment drawer, checkout, client profile, or reports. |

---

## 3–5. Flows & Service Profile (summary)

- **Public booking:** Load active, public-facing services → category/order → service detail sheet → provider choice → availability from duration + buffers + eligibility + policies → lock price/duration on appointment → confirmations.
- **Quick Book:** Client → **staff** → **eligible services** (StaffService M2M; services with no assignments = any staff) → slots → save.
- **Required profile fields:** Name, duration, base price, active, color, eligible staff; extended fields per maturity (categories, buffers, policies, content, forms).

---

## 6. Data Model Notes

### Target model (product)

| Table | Purpose |
|---|---|
| services | Base service records |
| service_categories | Optional category records |
| staff_services | Staff eligibility join table |
| resources | Rooms, chairs, machines, equipment |
| service_resources | Service-to-resource requirements |
| service_policies | Deposit, cancellation, no-show, card-on-file, notice windows |
| service_content | Public service detail content |
| service_forms | Required forms and waivers by service |
| service_custom_fields | Custom row definitions |
| service_custom_values | Values for each service/custom field |

### This repo today (`prisma/schema.prisma`)

| Implemented | Notes |
|-------------|--------|
| `Service` | `durationMinutes`, `basePriceCents`, `bufferAfterMinutes`, `color`, `active`, description; **no** category column, **no** public/private flag yet |
| `StaffService` | **Staff eligibility** M2M — empty join = any staff may perform; explicit rows = restricted |
| `ServiceBookingQuestion` / answers | Triage / intake-style questions per service |
| `ServiceContentDelivery` | Prep/aftercare delivery scheduling |
| Not yet | Dedicated `service_categories`, `resources` / `service_resources`, `service_policies` tables as first-class rows (policies may live on Tenant or future migration) |

### Suggested `Service` object (target TypeScript)

Use shared types when `packages/shared` exists; until then keep web/API aligned manually.

```ts
type Service = {
  id: string;
  tenantId: string;
  locationId?: string;
  name: string;
  categoryId?: string;
  descriptionShort?: string;
  descriptionLong?: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  basePriceCents: number;
  priceDisplayMode: 'fixed' | 'starting_at' | 'range' | 'hidden' | 'consultation';
  publicVisible: boolean;
  active: boolean;
  color: string;
  eligibleStaffIds: string[];
  requiredResourceIds: string[];
  requiredFormIds: string[];
  bookingPolicy: ServiceBookingPolicy;
  customFields: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};
```

---

## 7. API Suggestions (aligned to this repo)

| Purpose | Route shape in this repo |
|--------|---------------------------|
| List services | `GET /admin/services` — optional `staffId` filters to eligible services for Quick Book / staff column |
| CRUD | `POST/PATCH/DELETE /admin/services` — **admin** only for mutations; **staff** may **GET** list/detail for booking |
| Categories | Future: `GET/POST/PATCH /admin/service-categories` |
| Public catalog | Future: `GET /public/:tenantSlug/services` (or tenant resolver) — active + `publicVisible` when column exists |

---

## 8–11. UI, CRM, Calendar, Edge Cases

See sections 8–11 in the product brief (admin list/editor, public cards, staff picker badges, CRM write-back, calendar color/duration, edge cases for archive/price change/eligibility). Engineering handling:

- **Staff eligibility:** enforced on **appointment create** (server) and **service list** when `?staffId=` is passed.
- **Price/duration on existing appointments:** stored on `Appointment` rows; service edits do not retro-change past appointments without an explicit migration tool.

---

## 12. Acceptance Criteria (definition of done — product)

- Admin can create, edit, duplicate, archive, and reorder services.
- Admin can set service duration, price, active status, public/private visibility, and color.
- Admin can assign eligible staff to a service.
- Staff booking only shows services the selected staff can perform.
- Public booking only shows active public services.
- Availability respects service duration, buffers, staff eligibility, and resources.
- Appointment creation locks service price, duration, policy, and selected staff.
- Calendar uses service color and duration for appointment rendering.
- Service-linked forms are assigned when required.
- Service-specific notes and history are visible from the client profile and appointment drawer.
- Archived services remain visible in historical reports and past appointments.
- Custom row values can be configured and displayed based on visibility rules.
- Service policy changes do not mutate existing appointments unless explicitly applied.

---

## 13. Build Priority

### MVP

- Service CRUD
- Categories
- Duration
- Price
- Active/public status
- Staff eligibility
- Calendar color
- Basic booking policy
- Required forms link
- Public booking display

### Next

- Resource requirements
- Service detail pages
- Gallery images
- Prep/aftercare content
- Custom row builder
- Add-on compatibility
- Service-level reporting
- Approval/staff-only service controls

### Later

- Multi-service stacked appointments
- Class/service hybrid catalog
- AI-generated service descriptions
- Import from Mindbody/Vagaro/GlossGenius
- Service versioning for audit
- Advanced package/membership entitlement mapping

---

## 14. Build Instruction for Coding AI (summary)

Build the Services & Catalog module as the source of truth for all bookable offers. Connect it to booking, calendar, payments, forms, CRM, and reporting — not a static list.

---

## 15. Implementation snapshot (this repository)

| Capability | Status |
|------------|--------|
| Service CRUD (admin) | `/admin/services` — mutations admin-only |
| Service list + detail for booking | `GET /admin/services` — **staff** role allowed; `GET ?staffId=` filters eligibility |
| Staff ↔ service eligibility | `staff_services`; **create appointment** rejects incompatible pair when assignments exist |
| Quick Book order | **Staff** field before **Service**; service select disabled until staff chosen (or locked staff on staff schedule) |
| Duration + buffer | `durationMinutes`, `bufferAfterMinutes` on `Service`; availability service consumes |
| Categories, public flag, resources, rich policies | Partial / roadmap — see Prisma vs §6 |
| All accounts (admin / manager / staff) | Read paths use `requireRole.staff` where needed; catalog edits remain admin — see [staff-booking-implementation-map.md](./staff-booking-implementation-map.md) RBAC note |
