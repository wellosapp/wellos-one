# 11 — Onboarding Flow Buildout
**Project:** Velura (Mindbody Rebuild)
**Document:** 11 — Onboarding Flow Implementation
**Status:** Ready for build
**Version:** 1.0
**Date:** April 21, 2026
**Audience:** Solo developer or small agency
**Source spec:** `02-onboarding-flow.md` (UX spec, v1.0)
**Companion docs:** `09-dev-handoff.md`, `10-design-system-buildout.md`, `12-dashboard-buildout.md`

---

## How to read this document

This is the implementation spec for the onboarding flow described in `02-onboarding-flow.md`. The UX doc answers "what does the user see and do." This doc answers "what does the developer build, in what order, to what acceptance criteria."

It is structured as:

1. **Prerequisites** — what must be true before any of this can be built.
2. **Data model** — the tables and shapes this flow reads and writes.
3. **API contracts** — every endpoint this flow calls.
4. **Epic breakdown** — sequenced implementation tickets with acceptance criteria.
5. **Edge cases and recovery** — the things that break in production.

Work through it in order. Do not skip the prerequisites. Do not start the happy path before the draft-save behavior is designed — it is the single most common onboarding bug in production.

---

## 1. Prerequisites

Before the first line of onboarding code is written:

- [ ] Design system is built per `10-design-system-buildout.md`.
- [ ] Epic 1 of `09-dev-handoff.md` (Foundation & auth) is complete — auth provider chosen, Postgres connected, deploy pipeline green.
- [ ] Transactional email provider (Resend) account provisioned, sending domain verified.
- [ ] A decision has been made on single-tenant vs multi-tenant schema (recommended: multi-tenant from day one; see `09-dev-handoff.md` Epic 2).

If any of these are missing, stop and finish them first. Building onboarding without them means rewriting the onboarding module at least once.

---

## 2. Data model

The onboarding flow writes to five tables. Four of them (`Business`, `User`, `Staff`, `Service`) outlive onboarding and are read by the rest of the app. One (`OnboardingDraft`) is specific to this flow.

### 2.1 `Business` — the tenant root

```prisma
model Business {
  id              String   @id @default(cuid())
  name            String
  type            BusinessType  // enum: SALON_MEDSPA | WELLNESS_MASSAGE | FITNESS_STUDIO | PERSONAL_TRAINER
  phone           String
  email           String
  addressLine     String?
  city            String?
  stateRegion     String?
  postalCode      String?
  timezone        String   // IANA, e.g. "America/Los_Angeles"

  // Hours (MVP: single daily window, full per-day schedule deferred to Settings)
  workingDays     Int[]    // 0-6, Sunday=0, matches JS Date.getDay()
  dayStartMinutes Int      // minutes from midnight, e.g. 540 = 9:00 AM
  dayEndMinutes   Int      // minutes from midnight, e.g. 1140 = 7:00 PM

  bookingPolicy   BookingPolicy  // enum: INSTANT | APPROVAL_REQUIRED | STAFF_ONLY

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  users           User[]
  staff           Staff[]
  services        Service[]
}
```

### 2.2 `User` — owner and staff accounts

```prisma
model User {
  id            String   @id @default(cuid())
  businessId    String
  business      Business @relation(fields: [businessId], references: [id])

  email         String   @unique
  firstName     String
  lastName      String
  role          UserRole  // enum: OWNER_MANAGER | OWNER_PROVIDER | OWNER_SILENT | MANAGER | FRONT_DESK | PROVIDER | SUBCONTRACTOR
  hashedPassword String?  // null if SSO-only; MVP is email/password only

  emailVerified   DateTime?
  invitedAt       DateTime?
  invitedBy       String?   // User.id of inviter
  lastLoginAt     DateTime?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deletedAt     DateTime?

  staffRecord   Staff?
  permissions   UserPermission[]
}
```

**Note on email uniqueness:** unique **per User row**, not per business. A person cannot re-use the same email across two businesses in MVP. This simplifies login dramatically and matches how every competitor handles it.

### 2.3 `Staff` — provider-level record, linked to User for staff who log in

```prisma
model Staff {
  id            String   @id @default(cuid())
  businessId    String
  business      Business @relation(fields: [businessId], references: [id])

  userId        String?  @unique  // null for staff who don't log in (rare in MVP)
  user          User?    @relation(fields: [userId], references: [id])

  fullName      String
  role          UserRole

  active        Boolean  @default(true)
  invitedAt     DateTime?
  acceptedAt    DateTime?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  deletedAt     DateTime?
}
```

**Why separate `Staff` from `User`:** in Phase 2, some staff will not have logins (subcontractors with their own scheduling but no in-app access, or retired/inactive staff whose history we keep). Separating these two now avoids a painful migration later.

### 2.4 `Service` — service catalog, seeded from business type

```prisma
model Service {
  id              String   @id @default(cuid())
  businessId      String
  business        Business @relation(fields: [businessId], references: [id])

  name            String
  category        String
  durationMinutes Int       @default(60)
  priceCents      Int       @default(0)
  color           String    @default("#3D7A5E")
  active          Boolean   @default(true)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?
}
```

Onboarding creates one `Service` per selected category with sensible defaults. The user completes prices and durations in Settings later.

### 2.5 `OnboardingDraft` — auto-save state before Business is created

```prisma
model OnboardingDraft {
  id            String   @id @default(cuid())
  draftToken    String   @unique           // stored in browser localStorage + cookie
  email         String?                    // populated from step 4 onward
  payload       Json                       // full in-progress form state
  currentStep   Int      @default(1)
  expiresAt     DateTime                   // 30 days from creation
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

**Why a server-side draft table:** localStorage alone is not enough. If the user switches devices (starts onboarding on a laptop, finishes on their phone), the draft must survive. The token is random, unguessable, and paired with the email at step 4 so we can restore a session after login.

### 2.6 `UserPermission` — staff-level permission toggles (step 5)

```prisma
model UserPermission {
  id          String @id @default(cuid())
  userId      String
  user        User   @relation(fields: [userId], references: [id])
  permission  Permission  // enum: VIEW_OTHER_SCHEDULES | ACCESS_CLIENT_CONTACTS | PROCESS_PAYMENTS | VIEW_BUSINESS_REPORTS | MANAGE_CLIENT_RECORDS
  granted     Boolean

  @@unique([userId, permission])
}
```

Defaults per role (applied at invite time, can be overridden during step 5):

| Role | VIEW_SCHEDULES | ACCESS_CONTACTS | PROCESS_PAYMENTS | VIEW_REPORTS | MANAGE_CLIENTS |
|---|---|---|---|---|---|
| PROVIDER | off | on | off | off | off |
| FRONT_DESK | on | on | on | off | on |
| MANAGER | on | on | on | on | on |
| SUBCONTRACTOR | off | off | off | off | off |

---

## 3. API contracts

All endpoints live under `/api/onboarding/*` except where noted. Responses are JSON. Errors use the shape `{ error: { code: string, message: string, fields?: Record<string, string> } }`.

Endpoints 3.1–3.3 are **unauthenticated** (the user does not have a login yet); they use the draft token for session identity. Endpoints 3.4 onward require authentication.

### 3.1 `POST /api/onboarding/draft`

Create a new draft. Called once, when the user opens the onboarding URL and no existing draft token is found.

**Request:** no body required.

**Response 200:**
```json
{ "draftToken": "ob_3f8a2c9d4e5b6a7f...", "expiresAt": "2026-05-21T00:00:00Z" }
```

Client stores `draftToken` in both localStorage and a same-site cookie. Cookie is the source of truth; localStorage is the fallback for users who block cookies.

### 3.2 `PUT /api/onboarding/draft/:token`

Save or update the draft. Called on every step completion and on every field blur (debounced 500ms). Idempotent.

**Request body:**
```json
{
  "currentStep": 3,
  "payload": {
    "businessType": "SALON_MEDSPA",
    "businessInfo": { "name": "...", "phone": "...", "email": "...", "timezone": "America/Los_Angeles" },
    "hoursAndServices": { "workingDays": [1,2,3,4,5], "dayStartMinutes": 540, "dayEndMinutes": 1140, "categories": ["Facials","Botox"], "bookingPolicy": "INSTANT" }
  }
}
```

**Response 200:** updated draft echo, no 201 (drafts are created once via 3.1).

**Error 404:** draft token not found or expired. Client wipes its local copy and calls 3.1 to start fresh.

### 3.3 `GET /api/onboarding/draft/:token`

Restore a draft. Called on page load if a draft token exists locally.

**Response 200:** full draft payload + `currentStep`.

**Response 404:** expired or invalid; client starts fresh.

### 3.4 `POST /api/onboarding/complete`

The final commit. Called from step 4 once the owner account is created, and again from step 5/6 to finalize. This is the **only** endpoint that creates the `Business`, `User`, `Staff`, and `Service` records in a single transaction.

**Request body:**
```json
{
  "draftToken": "ob_3f8a2c9d...",
  "ownerAccount": {
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com",
    "password": "********",
    "role": "OWNER_PROVIDER"
  },
  "staffInvites": [
    { "fullName": "Kira Chen", "email": "kira@example.com", "role": "PROVIDER", "permissions": { "VIEW_OTHER_SCHEDULES": true, "ACCESS_CLIENT_CONTACTS": true } }
  ]
}
```

**Response 200:**
```json
{
  "businessId": "biz_...",
  "userId": "usr_...",
  "sessionToken": "...",     // log the owner in automatically
  "staffInvitesQueued": 1
}
```

**Transactional guarantees:**

- Either the entire onboarding commits (Business + owner User + Staff + Services + staff invites queued) or nothing commits.
- If any staff email fails validation after commit, the business is still created — failed invites surface as a dashboard nudge.
- Draft is deleted after successful commit.

**Error conditions:**

| Code | HTTP | Meaning |
|---|---|---|
| `draft_not_found` | 404 | Token invalid or expired. |
| `email_taken` | 409 | Owner email already belongs to another User. |
| `validation_failed` | 422 | Field-level errors, returned in `fields`. |
| `server_error` | 500 | Anything else. Surfaces in Sentry with the draft token. |

### 3.5 `POST /api/onboarding/resend-invite`

Re-send a failed staff invite after onboarding completes. Called from the dashboard nudge (see `12-dashboard-buildout.md`).

**Auth:** session cookie, owner role required.

**Request body:** `{ "staffId": "stf_..." }`

**Response 200:** `{ "sent": true }`

### 3.6 `POST /api/auth/accept-invite`

Staff member clicks the invite link in their email. This endpoint validates the invite token and creates a session for the new staff user.

**Request body:**
```json
{ "inviteToken": "inv_...", "password": "********" }
```

**Response 200:**
```json
{ "userId": "usr_...", "sessionToken": "..." }
```

Invite tokens are single-use JWTs, 7-day expiry, signed with a server secret. Using a token twice returns `invite_already_used`.

---

## 4. Epic breakdown

Onboarding is one epic in the dev handoff doc, but decomposes into **five tickets** at implementation time. Build them in order.

### Ticket O-1 — Draft persistence & resume

**Why this comes first:** Every subsequent ticket depends on drafts working. Building steps 1–5 first and drafts last means throwing away a week of work when the draft layer reveals it needs different data shapes.

**Scope:**

- `OnboardingDraft` table migration.
- Endpoints 3.1, 3.2, 3.3.
- Client-side hook `useOnboardingDraft()` that:
  - Reads token from cookie/localStorage on mount.
  - Calls `POST /draft` if no token exists.
  - Debounces `PUT /draft/:token` calls at 500ms after the last form mutation.
  - Provides `state`, `updateField(path, value)`, `goToStep(n)`, `reset()` to consumers.
- Draft expiry cleanup job (daily cron): delete drafts where `expiresAt < now()`.
- Resume banner at top of onboarding page: "Welcome back — we saved your progress. [Continue] [Start over]"

**Done looks like:**

- User fills in step 1, closes the browser, reopens 2 days later, returns to onboarding URL, sees resume banner with their step 1 selection still populated.
- User clears localStorage mid-flow — the cookie still restores the draft.
- User clears both cookie and localStorage — they get a fresh draft.
- Draft auto-save happens on field blur, not on every keystroke (verified in network tab).
- Expired drafts are deleted by the cron within 24 hours of expiry.

**Edge cases:**

- Two browser tabs open simultaneously editing the same draft: last write wins. Acceptable for MVP. Document as known limitation.
- Network failure during auto-save: queue retries with exponential backoff, show "Saving…" / "Saved" / "Couldn't save — retrying" micro-indicator near the step title.

---

### Ticket O-2 — Steps 1–3 (Business setup)

**Scope:**

- Three step components: `<BusinessTypeStep>`, `<BusinessInfoStep>`, `<HoursAndServicesStep>`.
- Shared `<OnboardingShell>` wrapper: progress dots, step counter, Back/Continue buttons.
- Form validation using `react-hook-form` + `zod` schemas per step.
- Step navigation is driven by URL search params (`?step=2`) so back button works.
- Business type selection pre-fills default service categories for step 3.

**Component files:**

```
app/onboarding/
├── layout.tsx                    # Shell, progress indicator
├── page.tsx                      # Router that maps ?step=N to the right component
├── _components/
│   ├── OnboardingShell.tsx
│   ├── StepProgress.tsx
│   ├── BusinessTypeStep.tsx
│   ├── BusinessInfoStep.tsx
│   ├── HoursAndServicesStep.tsx
│   ├── OwnerAccountStep.tsx      # (ticket O-3)
│   ├── TeamSetupStep.tsx         # (ticket O-4)
│   └── CompletionStep.tsx        # (ticket O-5)
└── _lib/
    ├── schemas.ts                # zod schemas per step
    └── defaults.ts               # business-type → service-category mapping
```

**Zod schemas (`_lib/schemas.ts`):**

```ts
export const businessTypeSchema = z.object({
  businessType: z.enum(['SALON_MEDSPA', 'WELLNESS_MASSAGE', 'FITNESS_STUDIO', 'PERSONAL_TRAINER']),
});

export const businessInfoSchema = z.object({
  name: z.string().min(1, 'Business name is required').max(80),
  phone: z.string().regex(/^\(\d{3}\) \d{3}-\d{4}$/, 'Use format (555) 000-0000'),
  email: z.string().email('Enter a valid email address'),
  addressLine: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  stateRegion: z.string().max(50).optional(),
  postalCode: z.string().max(20).optional(),
  timezone: z.string().min(1),
});

export const hoursAndServicesSchema = z.object({
  workingDays: z.array(z.number().int().min(0).max(6)).min(1, 'Select at least one day'),
  dayStartMinutes: z.number().int().min(0).max(1440),
  dayEndMinutes: z.number().int().min(0).max(1440),
  categories: z.array(z.string()).min(1, 'Select at least one service category'),
  bookingPolicy: z.enum(['INSTANT', 'APPROVAL_REQUIRED', 'STAFF_ONLY']),
}).refine(data => data.dayEndMinutes > data.dayStartMinutes, {
  message: 'End time must be after start time',
  path: ['dayEndMinutes'],
});
```

**Business-type defaults (`_lib/defaults.ts`):**

```ts
export const DEFAULT_CATEGORIES: Record<BusinessType, string[]> = {
  SALON_MEDSPA: ['Facials', 'Botox / Fillers', 'Laser Treatments', 'Hair', 'Nails'],
  WELLNESS_MASSAGE: ['Massage', 'IV Therapy'],
  FITNESS_STUDIO: ['Personal Training', 'Classes / Groups'],
  PERSONAL_TRAINER: ['Personal Training'],
};
```

**Done looks like:**

- User can complete steps 1–3, hitting Continue on each, with draft auto-saving between steps.
- Browser back button works across steps.
- Attempting to skip a required field shows inline error and does not advance.
- Time zone pre-detects from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Changing business type in step 1, going back to step 3, shows the updated default categories (but preserves any manual additions/removals the user made).
- Mobile viewport at 375px: no horizontal scroll, all fields reachable with thumb.

---

### Ticket O-3 — Step 4 (Owner account) + commit

**Why this is its own ticket:** step 4 is the first step that creates a real authenticated user. The transactional commit logic (`POST /api/onboarding/complete`) is complex enough to deserve its own test coverage and its own review.

**Scope:**

- `<OwnerAccountStep>` component with first name, last name, email, password, role.
- Password strength hint (inline, non-blocking).
- Endpoint 3.4 (`POST /api/onboarding/complete`) with transactional commit.
- Auth provider integration: create the User, hash the password, create a session, set session cookie.
- Handle `email_taken` specifically — show inline field error, do not advance.

**Transactional commit pseudocode:**

```ts
// apps/api/src/modules/onboarding/complete.ts
async function completeOnboarding(input: CompleteOnboardingInput) {
  const draft = await db.onboardingDraft.findUniqueOrThrow({ where: { draftToken: input.draftToken } });
  const payload = draft.payload as DraftPayload;

  return await db.$transaction(async (tx) => {
    // Email uniqueness check inside the transaction
    const existing = await tx.user.findUnique({ where: { email: input.ownerAccount.email } });
    if (existing) throw new AppError('email_taken', 409);

    // Create business
    const business = await tx.business.create({
      data: {
        name: payload.businessInfo.name,
        type: payload.businessType,
        phone: payload.businessInfo.phone,
        email: payload.businessInfo.email,
        addressLine: payload.businessInfo.addressLine,
        city: payload.businessInfo.city,
        stateRegion: payload.businessInfo.stateRegion,
        postalCode: payload.businessInfo.postalCode,
        timezone: payload.businessInfo.timezone,
        workingDays: payload.hoursAndServices.workingDays,
        dayStartMinutes: payload.hoursAndServices.dayStartMinutes,
        dayEndMinutes: payload.hoursAndServices.dayEndMinutes,
        bookingPolicy: payload.hoursAndServices.bookingPolicy,
      },
    });

    // Create owner user
    const hashedPassword = await hashPassword(input.ownerAccount.password);
    const owner = await tx.user.create({
      data: {
        businessId: business.id,
        email: input.ownerAccount.email,
        firstName: input.ownerAccount.firstName,
        lastName: input.ownerAccount.lastName,
        role: input.ownerAccount.role,
        hashedPassword,
        emailVerified: new Date(),  // we trust the email until a verification flow is added
      },
    });

    // If the owner is also a provider, create their Staff record
    if (input.ownerAccount.role === 'OWNER_PROVIDER') {
      await tx.staff.create({
        data: {
          businessId: business.id,
          userId: owner.id,
          fullName: `${owner.firstName} ${owner.lastName}`,
          role: 'PROVIDER',
          acceptedAt: new Date(),
        },
      });
    }

    // Seed services from selected categories
    await tx.service.createMany({
      data: payload.hoursAndServices.categories.map(category => ({
        businessId: business.id,
        name: category,
        category,
        durationMinutes: 60,
        priceCents: 0,
      })),
    });

    // Queue staff invites (created inside transaction, sent outside)
    for (const invite of input.staffInvites ?? []) {
      await tx.user.create({
        data: {
          businessId: business.id,
          email: invite.email,
          firstName: invite.fullName.split(' ')[0],
          lastName: invite.fullName.split(' ').slice(1).join(' ') || '',
          role: invite.role,
          invitedAt: new Date(),
          invitedBy: owner.id,
        },
      });
      // Staff record created in same transaction
      // Permission records created in same transaction
      // Actual email enqueued AFTER transaction commits, below
    }

    // Delete the draft
    await tx.onboardingDraft.delete({ where: { draftToken: input.draftToken } });

    return { business, owner };
  });
}
```

After transaction commits, enqueue staff invite emails via BullMQ. Do not send emails inside the transaction — if the transaction rolls back, the emails are already gone.

**Done looks like:**

- Valid step 4 submission creates all records, logs the owner in, and returns a session.
- Duplicate email returns 409 with a clear inline error on the email field.
- Weak password (under 8 chars) is rejected on both client and server.
- A failure mid-transaction (e.g., DB connection drop) leaves no partial records.
- The draft is gone after successful commit.
- Staff invite emails queue successfully but their delivery is not blocking.

---

### Ticket O-4 — Step 5 (Team setup)

**Scope:**

- `<TeamSetupStep>` component.
- Inline add-staff form: name + email + role + permission toggles.
- Invited-staff list above the form.
- "Skip for now" button → goes to step 6 without adding anyone.
- Re-opens step 4 data in read-only summary at the top (so the user sees what they committed to).

**UX behavior:**

- Adding a staff member appends to a local list, does not immediately POST. The `POST /api/onboarding/complete` at step 6 commits everything at once.
- Removing a staff member from the local list is a simple click-X action.
- Permission toggles default per role (see the role → permissions table in section 2.6).
- Duplicate email within the staff list is caught client-side with an inline error.

**Done looks like:**

- User can add 0, 1, or many staff members before proceeding.
- Toggling the role changes the default permission toggles visibly.
- Clicking Skip advances to step 6 with no staff queued.
- Skipped users get a dashboard nudge (see dashboard buildout, widget: "Your team isn't set up yet").

---

### Ticket O-5 — Step 6 (Completion) + dashboard nudges

**Scope:**

- `<CompletionStep>` success screen.
- Two next-step cards: "Connect payment" and "Add your services."
- "Go to my Dashboard →" primary CTA routes to `/app/today`.
- Dashboard nudge system: 3 nudge types, each dismissible, each stored in a `UserNudge` table with a `dismissedAt` timestamp.

**`UserNudge` table:**

```prisma
model UserNudge {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  kind         NudgeKind  // enum: SETUP_STAFF | SETUP_PAYMENT | SETUP_SERVICES
  shownAt      DateTime @default(now())
  dismissedAt  DateTime?
  resolvedAt   DateTime?  // when the underlying condition is met (e.g. staff added)

  @@unique([userId, kind])
}
```

**Nudge resolution logic (runs on every dashboard load):**

- `SETUP_STAFF`: resolved when the business has at least one `Staff` record beyond the owner.
- `SETUP_PAYMENT`: resolved when the business has a `stripeConnectAccountId` (set after Stripe onboarding; deferred to Epic 6).
- `SETUP_SERVICES`: resolved when any `Service` has a non-zero `priceCents` (indicating the user has actually edited defaults, not just accepted the seeded ones).

A resolved nudge is never shown again. A dismissed nudge is not shown for 7 days, then reappears if still unresolved.

**Done looks like:**

- User lands on dashboard after onboarding, sees up to 3 nudges at the top based on what was skipped.
- Dismissing a nudge hides it for 7 days.
- Completing the underlying action (e.g., adding a staff member in Settings) resolves the nudge immediately — no manual dismissal needed.
- Dashboard does not show nudges at all if all three are resolved.

---

## 5. Edge cases and recovery

These are the failure modes that show up in production within the first month. Handle them now.

### 5.1 Invite email bounces

Resend webhooks notify us when an email bounces. On bounce:

1. Mark the `User.invitedAt = null` and store the bounce reason.
2. Create a dashboard nudge for the owner: "We couldn't deliver the invite to [email]. [Fix email] [Re-send]"
3. Owner can edit the email in Settings → Staff and re-trigger invite (endpoint 3.5).

### 5.2 Owner abandons onboarding after step 4

Step 4 creates the `User` and `Business` records. If the owner never completes step 5/6, the business is still valid — they can log in and use the app. The completion step is informational, not gating.

Edge case: owner closes browser after step 4 success but before client-side redirect runs. Server already committed; cookie is already set; they should be able to just log in and proceed.

### 5.3 Draft token tampering

Draft tokens are server-generated random strings (≥32 bytes of entropy). They are not signed JWTs and do not contain information. The worst a malicious user can do by guessing a token is read or modify someone else's partial draft — a real but bounded risk.

Mitigation: rate-limit `GET /api/onboarding/draft/:token` at 10 requests per minute per IP. Beyond that, enumeration is not feasible in the 30-day expiry window.

### 5.4 User switches devices mid-onboarding

Without the server-side draft, this is impossible. With it, the user needs their draft token to resume on a new device. MVP approach:

- At step 4 (where email is collected), write the email to the draft row.
- Add a "Resume on another device" link on the onboarding page that emails a resume link to the draft's email. Works only if email is already captured.
- Link opens onboarding with `?resume=<token>` which restores the draft.

Deferred to Phase 2 if not critical at launch. Document as a known limitation.

### 5.5 Duplicate email at step 4

User enters an email that belongs to an existing account (probably a previous abandoned onboarding that got further than this one).

Show: "This email is already registered. [Log in instead] or use a different email."

Do not attempt to "recover" or "merge" accounts at MVP. Every merge strategy is wrong in a new way.

### 5.6 Time zone mismatches

Browser-detected timezone is sometimes wrong (corporate VPN, browser in private mode, etc.). Always show the detected value in step 2 so the user can verify. Include a dropdown of all IANA zones grouped by region.

### 5.7 Business type change after onboarding

User completes onboarding as "Salon / Medspa" then realizes they're actually "Fitness Studio." What happens?

MVP: Settings → Business → Type is editable. Changing it does **not** re-seed services. The user keeps their current service catalog. Document this so it's not a support surprise.

---

## 6. Analytics events

Track these events during onboarding to understand drop-off. Use whichever event system the team adopts (PostHog recommended; segment/mixpanel fine).

| Event | When | Properties |
|---|---|---|
| `onboarding.started` | First step 1 view | `draftToken` |
| `onboarding.step_completed` | Continue button clicked on any step | `step` (1-6), `draftToken` |
| `onboarding.abandoned` | 7 days without activity on a non-completed draft | `lastStep`, `timeSpentMinutes` |
| `onboarding.completed` | Successful `/complete` response | `businessType`, `staffCount`, `timeSpentMinutes` |
| `onboarding.error` | Any API 4xx/5xx during the flow | `errorCode`, `step` |

Drop-off report target: fewer than 30% drop-off between step 1 and completion. If higher, the flow has a specific bug; investigate which step the drop happens at.

---

## 7. Testing requirements

### Unit tests (Vitest or Jest)

- [ ] Zod schemas: valid inputs pass, each invalid input rejected with correct error.
- [ ] `completeOnboarding` transaction: happy path, duplicate email, weak password, missing draft.
- [ ] Business-type → default-categories mapping.
- [ ] Nudge resolution logic: all three resolution conditions.

### Integration tests (Supertest or Playwright API tests)

- [ ] `POST /draft` → `PUT /draft/:token` → `GET /draft/:token` round-trip.
- [ ] `POST /complete` happy path creates all expected records.
- [ ] `POST /complete` with duplicate email returns 409 and commits nothing.
- [ ] Invite emails enqueue on successful complete.

### E2E tests (Playwright)

- [ ] Full happy path: start onboarding, fill all steps, reach dashboard. Under 90 seconds.
- [ ] Resume flow: fill steps 1–2, close tab, reopen onboarding URL, verify step 1–2 data restored.
- [ ] Skip staff: reach step 5, click Skip, land on completion screen, proceed to dashboard, see SETUP_STAFF nudge.

---

## 8. Performance targets

| Metric | Target |
|---|---|
| Onboarding page initial load | ≤ 2 seconds on 4G |
| Step transition | ≤ 150ms perceived (using URL-based routing, no full page reload) |
| Draft auto-save latency | ≤ 300ms at p95 |
| `/complete` commit latency | ≤ 1.5 seconds at p95 |
| Total happy-path completion time | ≤ 5 minutes for an engaged user |

---

## 9. Done looks like (whole flow)

- [ ] All 5 tickets (O-1 through O-5) ship their acceptance criteria.
- [ ] Playwright happy-path test passes in CI.
- [ ] A new business can be onboarded end-to-end on a mobile device in under 5 minutes without documentation.
- [ ] Analytics events fire correctly, verified in staging.
- [ ] Resume-from-different-device works (or is documented as a Phase 2 limitation).
- [ ] Dashboard nudges appear appropriately after skipped steps.
- [ ] No PII is logged to console or error tracking (password, personal data stays out of logs).

---

## 10. Open questions to resolve before build

Copied from the UX spec — these block specific tickets if unanswered.

- [ ] **Blocks O-4:** Is Clerk acceptable as auth provider, or is self-hosted Auth.js required?
- [ ] **Blocks O-3 categories:** Are the default service categories correct per business type, or does product want a different taxonomy?
- [ ] **Blocks O-4:** What's the password policy — exactly 8 chars min, or something stronger (complexity rules, compromised-password check via HIBP)?
- [ ] **Blocks O-5:** Do subcontractors see their own revenue or just their schedule? (affects SETUP_STAFF nudge copy)
- [ ] **Blocks deployment:** Is there a trial/free period before payment setup is required? (affects SETUP_PAYMENT nudge urgency)

---

## 11. Sign-off

- [ ] UX spec (`02-onboarding-flow.md`) reviewed and any deltas noted.
- [ ] Data model reviewed against Epic 2 of `09-dev-handoff.md`.
- [ ] API contracts reviewed by backend lead.
- [ ] Email templates drafted for: owner welcome, staff invite, invite bounce notice.
- [ ] Analytics event names added to the tracking plan.
- [ ] Open questions answered.

Once all boxes are checked, Tickets O-1 through O-5 can be scheduled. Build them in order. Do not parallelize — each depends on the previous for data shape stability.
