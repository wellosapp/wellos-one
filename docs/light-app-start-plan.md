# Fundamira Salon App Startup Plan

## Purpose

Fundamira Salon is the first shippable product. It is the smaller app that lives at `salon.fundamira.app` for salon and small-service operators who only need calendar, booking, SMS, email, CRM, and payments.

It must use the same backend, database, event bus, notifications, payments, and tenant model that the full Velura platform will use later. The Light app should feel small to the user, not be small or temporary under the hood.

The project started under the WellOs / Velura name, but the public domain plan is now Fundamira because `fundamira.app` is the domain we will use.

## Domain Plan

Use `fundamira.app` as the root domain for the public brand.

- `fundamira.app`: main marketing website, public product pages, pricing, help, and sign-up entry point.
- `www.fundamira.app`: redirect to `fundamira.app`.
- `salon.fundamira.app`: Fundamira Salon app, the smaller PWA product.
- `api.fundamira.app`: shared API for Salon first and the full app later.
- `book.fundamira.app`: optional public booking/widget host if we want booking links separated from the staff app.
- `admin.fundamira.app`: optional internal/admin surface later.
- Future vertical subdomains can follow the same pattern, such as `medspa.fundamira.app`, `fitness.fundamira.app`, or `wellness.fundamira.app`.

Rule: the main website stays on the root domain. Product apps, APIs, booking surfaces, and admin tools live on subdomains.

## Mobile App Plan

Fundamira Salon should launch as a PWA, not a native app.

PWA requirements for launch:

- Installable on iPhone and Android from the browser.
- App icon, name, theme color, and splash behavior configured through the web app manifest.
- Mobile-first responsive layout for calendar, booking, CRM, and payments.
- Auth sessions that survive normal app use from the home-screen icon.
- Offline-friendly shell for loading states and basic navigation.
- Clear install prompt or instructions inside the app.
- Push notifications should be planned, but SMS and email remain the reliable MVP notification channels.

Native iOS and Android apps are a later phase after the PWA proves the workflow and customer demand.

## Product Scope

Fundamira Salon includes:

- Calendar for appointments, blocks, reschedules, cancellations, and quick booking.
- Public booking link or embedded booking widget.
- SMS confirmations, reminders, magic links, cancellation messages, and reschedule messages.
- Email confirmations, receipts, reminders, onboarding, and staff invites.
- CRM for client profiles, contact details, notes, tags, communication preferences, and visit history.
- Payments for Stripe-first checkout, deposits, receipts, refunds, and payment status.
- Basic settings for business profile, services, staff, hours, booking policy, notifications, and payments.

Fundamira Salon does not launch with:

- Classes, memberships, packages, inventory, payroll, marketing campaigns, automations, public API, franchise tools, or AI receptionist.
- Native mobile apps. The MVP is responsive web plus PWA.
- A separate backend or separate database.

## App Shape

The Light app should be its own app surface in the monorepo:

```text
app/
  apps/
    salon/       # Fundamira Salon web/PWA
    api/         # Shared Fastify API
    widget/      # Public booking widget
    workers/     # SMS, email, reminders, payments jobs
    web/         # Main/full Fundamira app later
  packages/
    db/
    core/
    notifications/
    event-bus/
    payments/
    ui/
```

The Light app should only show the features enabled for the Light plan. The backend still stores data in the full tenant-aware structure so a business can upgrade later without migration.

## VPS Setup

Use DigitalOcean as planned in the existing infrastructure docs.

Production VPS target:

- DigitalOcean Droplet.
- Ubuntu 24.04 LTS.
- 4 vCPU, 8 GB RAM, 80 GB SSD for early production.
- VPC enabled.
- IPv6 enabled.
- Monitoring enabled.
- Backups enabled.
- Cloud Firewall applied with tag-based rules.
- SSH key login only.
- Non-root `deploy` user.
- Docker and Docker Compose installed.
- Nginx or Caddy as reverse proxy.
- Redis can run on the VPS for MVP.
- Postgres should be DigitalOcean Managed Postgres, not long-term self-hosted on the VPS.

Required inbound firewall rules:

- Port `22`: restricted to owner office IP or VPN only.
- Port `80`: public HTTP for redirect and certificate issuance.
- Port `443`: public HTTPS.
- Port `5432`: not public. Managed Postgres should use private VPC networking.
- Port `6379`: not public. Redis should only be local or private VPC.

VPS directories:

```text
/opt/app/
  docker-compose.yml
  .env
  releases/
  shared/
```

Rules:

- Do not SSH-edit app code on the VPS.
- All production changes come from GitHub Actions.
- Secrets live in GitHub Actions, the password manager, and `/opt/app/shared/.env`, never in git.
- Take a snapshot before risky infrastructure changes.

Domain and TLS setup:

- Add DNS records for `fundamira.app`, `www.fundamira.app`, `salon.fundamira.app`, and `api.fundamira.app`.
- Point app subdomains to the production VPS or load balancer.
- Use HTTPS everywhere.
- Configure automatic certificate renewal through Caddy or Certbot.
- Redirect `www.fundamira.app` to `fundamira.app`.
- Keep the root marketing website deployable separately from the Salon app if practical, even if they share the same VPS at launch.

## Database Setup

Use Postgres 16 with Drizzle migrations.

The Light app starts with a smaller set of tables, but the naming and relationships should match the future full app. Every tenant-owned table needs `tenant_id`, timestamps, soft-delete where appropriate, and tenant-scoped indexes.

Foundation tables:

- `tenants`: business/account root.
- `locations`: one location at Light launch, multi-location ready.
- `users`: login accounts.
- `sessions`: auth sessions.
- `roles`: role definitions.
- `role_assignments`: user-to-role mapping.
- `feature_flags`: global feature definitions.
- `tenant_feature_flags`: per-tenant enabled features and plan limits.
- `idempotency_keys`: retry protection for mutating API requests.
- `audit_log`: security and business-critical changes.

Business setup tables:

- `staff_members`: providers and staff.
- `services`: appointment services.
- `service_staff`: which staff can perform which services.
- `business_hours`: location-level working hours.
- `staff_schedules`: provider working hours and overrides.
- `resources`: optional rooms, chairs, or equipment, even if Light hides this at first.

Calendar and booking tables:

- `appointments`: core booking records.
- `appointment_services`: service lines attached to an appointment.
- `appointment_status_history`: append-only status changes.
- `availability_rules`: reusable scheduling rules.
- `time_blocks`: staff unavailable time.
- `booking_settings`: tenant and staff booking policy values.
- `booking_holds`: short-lived public booking slot holds.
- `magic_links`: cancel/reschedule links for clients.

CRM tables:

- `clients`: client identity and profile.
- `client_notes`: internal notes.
- `client_tags`: tenant-defined tags.
- `client_tag_assignments`: tag membership.
- `client_communication_preferences`: SMS/email opt-in and preferences.
- `client_activity`: timeline entries such as booking, payment, reminder sent, cancellation.

Notification tables:

- `notification_templates`: tenant templates for SMS/email.
- `message_dispatches`: requested outbound messages.
- `message_deliveries`: provider delivery states.
- `notification_preferences`: tenant-level reminder settings.

Payments tables:

- `payment_provider_connections`: Stripe/Square connection state.
- `payment_intents`: provider payment attempts.
- `payments`: successful, failed, refunded, or disputed movements.
- `carts`: pre-checkout grouping.
- `cart_items`: line items.
- `sales`: completed checkout grouping.
- `refunds`: refund records.
- `ledger_entries`: accounting trail.
- `payouts`: Stripe/Square settlement tracking later.

Event and worker tables:

- `events`: durable domain event log.
- `webhook_inbox`: inbound provider webhooks with dedupe.
- `job_runs`: worker execution and retry tracking.

## Light Feature Flags

Seed a Light plan with these enabled:

- `calendar`.
- `public_booking`.
- `sms_notifications`.
- `email_notifications`.
- `client_crm`.
- `stripe_payments`.
- `basic_reports`.
- `single_location_ui`.

Seed these disabled until Full app expansion:

- `classes`.
- `memberships`.
- `packages`.
- `inventory`.
- `payroll`.
- `marketing_campaigns`.
- `automations`.
- `public_api`.
- `advanced_forms`.
- `protected_records`.
- `multi_location_ui`.

## Environment Variables

Minimum Light app launch set:

```text
PUBLIC_MARKETING_URL=https://fundamira.app
PUBLIC_SALON_APP_URL=https://salon.fundamira.app
PUBLIC_API_URL=https://api.fundamira.app
DATABASE_URL=
REDIS_URL=
SESSION_SECRET=
CSRF_SECRET=
STRIPE_PLATFORM_SECRET_KEY=
STRIPE_PLATFORM_PUBLISHABLE_KEY=
STRIPE_PLATFORM_WEBHOOK_SECRET=
TEXTLINK_API_KEY=
TEXTLINK_WEBHOOK_SECRET=
TEXTLINK_DEFAULT_SIM_ID=
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
SENTRY_DSN=
DIGITALOCEAN_ACCESS_TOKEN=
DO_REGISTRY_NAME=
```

Optional for launch or soon after:

```text
S3_ENDPOINT=
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
SQUARE_APPLICATION_ID=
SQUARE_APPLICATION_SECRET=
SQUARE_OAUTH_REDIRECT_URL=
SQUARE_WEBHOOK_SIGNATURE_KEY=
SQUARE_ENVIRONMENT=sandbox
```

## Deployment Pipeline

Use the deployment flow already planned for the full app:

1. Developer pushes a feature branch.
2. Pull request runs CI.
3. CI runs lint, typecheck, tests, and Docker build.
4. Merge to `main`.
5. GitHub Actions builds the Docker image.
6. Image is pushed to DigitalOcean Container Registry.
7. Migration job runs against Managed Postgres.
8. VPS pulls the new image with Docker Compose.
9. App restarts.
10. `/healthz` verifies the deploy.

At launch, deploy these web surfaces:

- Marketing site on `fundamira.app`.
- Fundamira Salon PWA on `salon.fundamira.app`.
- Shared API on `api.fundamira.app`.
- Optional booking widget on `book.fundamira.app`.

Required GitHub Actions secrets:

- `DIGITALOCEAN_ACCESS_TOKEN`.
- `DEPLOY_SSH_KEY`.
- `DEPLOY_HOST`.
- `DEPLOY_USER`.
- `DATABASE_URL`.
- `SENTRY_DSN`.

## Build Order

### Phase 1: Infrastructure Ready

- Create DigitalOcean project.
- Create VPC.
- Create Managed Postgres.
- Create Container Registry.
- Create Droplet with cloud-init.
- Configure Cloud Firewall.
- Configure DNS for `fundamira.app`, `www.fundamira.app`, `salon.fundamira.app`, and `api.fundamira.app`.
- Configure TLS for every public domain and subdomain.
- Configure GitHub Actions secrets.
- Verify `/healthz` can deploy from CI.

### Phase 2: Repo and Shared Core

- Scaffold pnpm workspace.
- Add `apps/salon`, `apps/api`, `apps/widget`, and `apps/workers`.
- Add `packages/db`, `packages/core`, `packages/ui`, `packages/event-bus`, and `packages/notifications`.
- Add Drizzle schema and first migrations.
- Add Docker Compose for local and production.
- Add CI for lint, typecheck, tests, and build.
- Add PWA manifest, app icons, service worker strategy, and install instructions for `apps/salon`.

### Phase 3: Business Setup

- Build auth and sessions.
- Build business onboarding.
- Create tenant, location, owner user, staff member, services, hours, and booking settings.
- Seed Light feature flags.

### Phase 4: Calendar and Booking

- Build calendar day/week view.
- Build quick book.
- Build public booking link.
- Add appointment create, reschedule, cancel, and block time.
- Add booking holds and idempotency.
- Add no-double-booking protection at the database level.

### Phase 5: CRM

- Build client list.
- Build client profile.
- Add notes, tags, communication preferences, and visit history.
- Connect booking flow to client matching and client creation.

### Phase 6: Notifications

- Add appointment events.
- Add SMS worker through TextLink.
- Add email worker through Resend.
- Add reminder schedules.
- Add magic links for cancel and reschedule.
- Track message dispatch and delivery status.

### Phase 7: Payments

- Add Stripe platform connection.
- Add deposits and payment intents.
- Add webhook handling and dedupe.
- Add receipts.
- Add refunds.
- Add basic revenue summary.
- Add Square after Stripe is stable.

### Phase 8: Launch Hardening

- Add tenant isolation tests.
- Add role-gating tests.
- Add DST and timezone tests.
- Add payment webhook tests.
- Add notification retry tests.
- Add PWA install testing on iPhone Safari, Android Chrome, and desktop Chrome.
- Add Sentry error reporting.
- Add backup and restore runbook.
- Launch Light app to first users.

## First Tickets

Start with these tickets before building UI:

1. Scaffold monorepo and app shells.
2. Add local Docker Compose for Postgres and Redis.
3. Add Drizzle schema for foundation tables.
4. Add Fastify API with `/healthz`.
5. Add deployment Dockerfile and production Compose.
6. Add GitHub Actions CI.
7. Add DigitalOcean deploy workflow.
8. Add Light feature flag seed data.
9. Add auth/session foundation.
10. Add business onboarding foundation.
11. Add PWA manifest, icons, and installable shell for `salon.fundamira.app`.

## Acceptance Criteria

The Light app is ready to start feature development when:

- The VPS exists and can be rebuilt from documented scripts.
- Managed Postgres is reachable over the VPC.
- Redis is reachable by the API and workers.
- GitHub Actions can deploy a health-check-only app to production.
- The database has the foundation migration applied.
- `fundamira.app` can render the main marketing site.
- `salon.fundamira.app` can render the Fundamira Salon PWA with a logged-out landing route and a logged-in empty dashboard.
- `api.fundamira.app/healthz` returns healthy.
- The Salon PWA can be installed to a phone home screen.
- Secrets are stored in the password manager, GitHub Actions, and VPS runtime env only.
- No production data depends on local files on the VPS.

