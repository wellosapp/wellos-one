# Fundamira Salon App Plan

## What This App Is

Fundamira Salon is the first small app we are building under the Fundamira brand.

It will live at:

```text
https://salon.fundamira.app
```

The main public website will live at:

```text
https://fundamira.app
```

Everything that is not the main marketing website should live on a subdomain.

## Domain Structure

- `fundamira.app`: main website, marketing pages, pricing, sign-up, product info.
- `www.fundamira.app`: redirects to `fundamira.app`.
- `salon.fundamira.app`: the small salon app/PWA.
- `api.fundamira.app`: shared API for the salon app and future apps.
- `book.fundamira.app`: optional public booking/widget domain.
- `admin.fundamira.app`: Fundamira platform admin login.
- `client.fundamira.app`: optional client portal login for customers of salon businesses.

Future apps can follow the same pattern:

- `medspa.fundamira.app`
- `fitness.fundamira.app`
- `wellness.fundamira.app`

## Mobile Strategy

Fundamira Salon should launch as a PWA first.

This means users and clients can open it on their phone and install it to their home screen without us building native iOS and Android apps right away.

PWA launch requirements:

- Installable on iPhone and Android.
- App icon and splash behavior.
- Mobile-first calendar, booking, CRM, and payment screens.
- Secure login that works well from a home-screen app icon.
- Offline-friendly loading shell.
- Clear in-app instructions for adding the app to the phone home screen.

Native iOS and Android apps are a later phase after the PWA proves the product.

## Three-Side App Structure

Fundamira Salon needs three sides, like the full program:

1. Fundamira admin side.
2. Business user side.
3. Client side for the business user's customers.

Each side needs its own login experience, permissions, routes, and dashboard.

Admin side:

- Used by Fundamira internal/platform admins.
- Lives at `admin.fundamira.app`.
- Manages businesses, subscriptions, support, account status, provider connections, domains, billing issues, and platform settings.
- Can view business health and configuration, but should not casually expose private client data unless support access is explicitly needed.
- Requires stricter access control, audit logs, and admin-only roles.

Business user side:

- Used by salon owners, managers, front desk, and staff.
- Lives at `salon.fundamira.app`.
- Includes calendar, booking, CRM, marketing, payments, invoices, settings, staff, services, SMS, and email.
- Has role-based access so owners, managers, staff, and front desk users see only what they should.
- This is the main PWA the business installs on their phone.

Client side:

- Used by customers of the salon business.
- Can live at `client.fundamira.app` or as client routes under the booking experience.
- Has its own client login separate from the business user login.
- Lets clients view upcoming appointments, reschedule or cancel when allowed, pay invoices, update contact info, manage communication preferences, and access review links.
- Booking should still support no-login flows through magic links, but returning clients should be able to create or use a client login.

Login separation:

- Admin login is only for Fundamira platform admins.
- Business user login is only for businesses and their staff.
- Client login is only for customers of those businesses.
- Sessions and permissions must identify which side the user belongs to.
- A client account should never be able to access business backend routes.
- A business staff account should never be able to access platform admin routes.

## First App Scope

Fundamira Salon should stay small and focused.

Launch features:

- Three separate login areas: admin, business user, and client.
- Calendar.
- Booking.
- SMS.
- Email.
- CRM.
- Marketing tab.
- Payments.
- Basic settings.
- PWA install.

Calendar:

- Custom Fundamira calendar built inside the app.
- Day and week views.
- Quick book.
- Appointment detail.
- Reschedule.
- Cancel.
- Block time.
- No double-booking.
- Connect external calendar button or setup walkthrough.
- Sync with the user's existing calendar where supported.
- Show external busy times so clients cannot book over them.

Booking:

- Public booking link.
- Client can book without creating an account.
- Magic links for cancel and reschedule.
- Deposit support.
- Booking confirmations.

SMS:

- Confirmation texts.
- Reminder texts.
- Cancel/reschedule texts.
- Magic links.
- Invoice links.
- Review request links.
- Business-to-client SMS from the app.
- Transactional SMS, marketing SMS, and general update SMS.
- SMS opt-in, opt-out, and delivery tracking.

Email:

- Booking confirmations.
- Invoice emails.
- Review request emails.
- Receipts.
- Reminders.
- Staff invites.
- Owner onboarding emails.
- Sent through Postmark.
- Customer sending domain setup during business onboarding.

CRM:

- Client profiles.
- Contact details.
- Notes.
- Tags.
- Visit history.
- Communication preferences.
- Full CRM feature set from the larger platform plan.
- Client timeline across bookings, invoices, payments, SMS, email, reviews, and notes.
- Client alerts and important flags.
- Client files and attachments later if needed.
- Household or related-client records.
- Duplicate client handling.
- Saved payment method references where supported by Stripe or Square.
- Referral source and client source tracking.

Marketing:

- Backend Marketing tab for the business user.
- Create SMS campaigns.
- Create email campaigns.
- Send to selected clients, tags, or saved segments.
- Draft, preview, schedule, send, and cancel campaigns.
- Track sent, delivered, failed, bounced, opened, clicked, unsubscribed, and opt-out states where providers support them.
- Use campaign templates for rebooking, promotions, announcements, review requests, and win-back messages.
- Require consent checks before sending marketing SMS or marketing email.

Payments:

- Stripe and Square first.
- Each business connects its own Stripe or Square payment account/API during setup.
- Deposits.
- Checkout.
- Invoices.
- Invoice line items from services.
- Invoice line items from products.
- Product and service catalog connection to invoices.
- Pay invoice links.
- Receipts.
- Refunds.
- Payment status.
- Basic revenue summary.

Settings:

- Business profile.
- Staff.
- Services.
- Products.
- Hours.
- Booking policy.
- Reminder settings.
- Payment connection.
- Email sending domain.
- SMS sending and compliance settings.
- Calendar connection setup.

Client portal:

- Client login.
- View upcoming appointments.
- View appointment history.
- Reschedule or cancel when policy allows.
- Pay invoices.
- Update profile and contact info.
- Manage SMS/email preferences.
- Access review links.
- Use magic links without a password when needed.

## CRM Plan

Fundamira Salon needs a real CRM, not just a contact list. The business should be able to keep track of each client with the same core CRM direction planned for the full app.

Client profile should include:

- Name.
- Phone.
- Email.
- Birthday.
- Address.
- Preferred contact method.
- SMS consent.
- Email consent.
- Marketing consent.
- Client source or referral source.
- Tags.
- Important alerts.
- Internal notes.
- Visit history.
- Invoice and payment history.
- Appointment history.
- Review request history.
- Message history.

CRM activity timeline should show:

- Appointments booked.
- Appointments completed.
- Cancellations and reschedules.
- SMS messages sent.
- Emails sent.
- Invoices sent.
- Invoice payments.
- Refunds.
- Review requests.
- Notes added by staff.
- Client preference changes.

CRM actions from a client profile:

- Book appointment.
- Send SMS.
- Send email.
- Send invoice.
- Send review link.
- Add note.
- Add tag.
- Update communication preferences.
- View payment status.
- View appointment history.

Full-build CRM features to plan for:

- Client notes with categories.
- Client alerts that show during booking and checkout.
- Tags and saved segments.
- Client files and attachments.
- Before/after photos later if needed for beauty or medspa expansion.
- Household or linked clients.
- Duplicate detection and merge workflow.
- Banned or do-not-book client flag.
- Client import later.
- Referral source tracking.
- Communication preference audit history.

The first release should build the database and API in a way that supports the full CRM, even if some advanced screens are phased in after the first launch.

## Custom Calendar Plan

Fundamira Salon should have its own custom calendar. This is the calendar the business uses day to day inside the app. External calendars connect to it, but they should not replace it.

Core calendar behavior:

- Fundamira appointments are created and managed in the Fundamira calendar.
- The calendar shows day and week views first.
- Staff can create appointments, reschedule, cancel, block time, and quick book.
- Public booking checks Fundamira availability before showing times.
- The system prevents double-booking inside Fundamira first.
- External calendar busy blocks are included in availability so clients do not book over personal or outside events.

External calendar connection:

- The user should see a `Connect calendar` button in settings and/or onboarding.
- The setup should support a guided walkthrough for users who need help connecting.
- First target should be Google Calendar.
- Outlook / Microsoft 365 should be next.
- Apple Calendar can be supported through calendar subscription or ICS feed first, because true two-way Apple Calendar sync is more limited.

Calendar connection flow:

1. User opens Calendar Settings.
2. User clicks `Connect calendar`.
3. App asks which provider: Google, Outlook, or Apple/ICS.
4. User authorizes the provider or follows the guided setup steps.
5. User chooses which external calendar to connect.
6. User chooses sync direction.
7. App imports busy blocks.
8. App optionally pushes Fundamira appointments to the external calendar.
9. App shows connection status, last sync time, and any sync errors.

Sync modes:

- Busy-only import: external events block availability but details stay private.
- Appointment export: Fundamira appointments appear on the connected calendar.
- Two-way sync later: external changes can update Fundamira where safe.

MVP sync recommendation:

- Start with busy-only import plus appointment export.
- Do not allow external calendar edits to change Fundamira appointments in the first version.
- Fundamira remains the source of truth for bookings, payments, reminders, invoices, and client records.

Calendar privacy:

- External private events should display as `Busy`, not with personal titles or notes.
- Only store the minimum external calendar metadata needed to sync.
- Store provider tokens encrypted.
- Let the user disconnect a calendar at any time.
- Let the user choose whether connected calendar events block public booking.

Calendar setup records:

- Store provider.
- Store connected external calendar ID.
- Store sync mode.
- Store token status.
- Store last successful sync time.
- Store last sync error.
- Store whether external events block booking.

## SMS Messaging Plan

SMS will be powered by the SMS provider selected for this project, currently expected to be TextLink.

The app needs two types of SMS:

Transactional SMS:

- Booking confirmations.
- Appointment reminders.
- Cancellation notices.
- Reschedule notices.
- Magic links.
- Invoice links.
- Payment links.
- Review links.
- Staff or owner operational updates to a client.

Marketing SMS:

- Promotions.
- Rebooking campaigns.
- Win-back messages.
- Announcements.
- Customer segment messages.

Compliance requirements:

- Store client SMS opt-in status.
- Store client SMS opt-out status.
- Support STOP/unsubscribe handling.
- Separate marketing consent from transactional messaging.
- Track who sent each message.
- Track message type: `transactional`, `marketing`, or `update`.
- Track provider delivery status.

The user should be able to send SMS from inside the backend app to customers. The send screen should require the user to choose whether the message is transactional, marketing, or update before sending.

## Marketing Tab Plan

The user backend should include a Marketing tab or Marketing area where each business can create and manage customer campaigns from its own account.

Marketing channel types:

- SMS campaign.
- Email campaign.
- Combined SMS and email campaign.

Audience options:

- All eligible clients.
- Manually selected clients.
- Clients with a specific tag.
- Clients who have not visited recently.
- Clients with upcoming appointments.
- Clients with completed appointments.
- Clients who opted in to marketing SMS.
- Clients who can receive marketing email.

Campaign workflow:

1. User opens the Marketing tab.
2. User chooses SMS, email, or both.
3. User chooses an audience.
4. User writes the message or picks a template.
5. App shows estimated recipient count and any skipped clients.
6. App validates opt-in, opt-out, unsubscribe, and missing contact info.
7. User sends now or schedules for later.
8. Workers send messages through TextLink and Postmark.
9. App tracks delivery, clicks, replies, bounces, unsubscribes, and failures.

Marketing templates:

- Rebook reminder.
- Slow week promotion.
- Birthday offer.
- New service announcement.
- Review request.
- Win-back campaign.
- Holiday hours update.

Marketing guardrails:

- Marketing SMS cannot send to clients without marketing SMS consent.
- Marketing email cannot send to unsubscribed clients.
- Transactional messages must not be mixed into marketing campaigns.
- Every campaign stores the sender, audience, message body, provider status, and send time.
- Campaigns should support drafts before sending.

## Email Plan

Email will use Postmark.

Fundamira owns the Postmark account and email infrastructure. Each business should connect and verify its sending domain during business setup so their customer emails can come from the right branded domain.

Business setup must collect:

- Sending domain.
- From name.
- From email.
- Reply-to email.
- Business support email.

Postmark/domain setup must track:

- Domain verification status.
- DKIM status.
- SPF status.
- DMARC status.
- Return-path/bounce setup status.
- Default message stream for transactional email.
- Optional message stream for broadcast/marketing-style email if supported by the final Postmark configuration.

Email must support:

- Booking confirmations.
- Reminders.
- Staff invites.
- Owner onboarding.
- Invoices.
- Payment links.
- Receipts.
- Refund notices.
- Review request links.
- Bounce and delivery tracking.

## Invoice And Review Link Plan

Invoices can be sent by SMS or email.

Invoice flow:

1. Staff creates an invoice from an appointment, client profile, or checkout screen.
2. Staff adds services, products, custom line items, discounts, taxes, and notes.
3. App creates invoice and invoice line records.
4. App creates a payment link using the business's connected Stripe or Square account.
5. Client receives the invoice link by SMS, email, or both.
6. Payment webhook updates the invoice and payment status.
7. Receipt sends by email and optionally SMS.

Invoice line items:

- Service line items come from the service catalog.
- Product line items come from the product catalog.
- Custom line items are allowed for one-off charges.
- Each line item stores name, description, quantity, unit price, discount, tax, and total.
- Line items should preserve a snapshot of the service or product name and price at invoice time.
- Invoices can be created from an appointment, from a client profile, or manually.

Review link flow:

1. Appointment is completed.
2. App creates a review request record.
3. Business can send the review link by SMS, email, or both.
4. Link can point to Google review, another public review profile, or a Fundamira-hosted review page.
5. App tracks sent, clicked, completed, and failed states where available.

Review links should be reusable in automated post-appointment flows and manual one-off sends.

## Customer Payment Setup

Businesses should bring their own Stripe or Square connection.

During business setup, the owner chooses:

- Stripe.
- Square.
- Both, if we allow it at launch.

The app stores connection state but never stores raw secret keys in the normal business tables.

Payment setup should track:

- Provider name: `stripe` or `square`.
- Connection mode: OAuth/Connect if available, or encrypted API credentials if required.
- Connected account ID.
- Location mapping.
- Webhook status.
- Payments enabled status.
- Deposits enabled status.
- Invoice payments enabled status.
- Refund capability status.

Stripe and Square must both support:

- Booking deposits.
- Checkout.
- Invoice payment links.
- Refunds.
- Payment webhook reconciliation.
- Receipts.

## What We Are Not Building First

These stay out of the first salon app launch:

- Classes.
- Memberships.
- Packages.
- Full inventory management.
- Payroll.
- Automations.
- Public API dashboard.
- Franchise tools.
- AI receptionist.
- Native mobile apps.

## Technical Shape

The app should be small in the user experience, but it should use the same foundation we need for the larger Fundamira platform later.

Planned app structure:

```text
app/
  apps/
    admin/       # Fundamira platform admin
    salon/       # Fundamira Salon PWA
    client/      # Client portal PWA or client-facing app
    api/         # Shared backend API
    widget/      # Public booking widget
    workers/     # SMS, email, reminders, payment jobs
    web/         # Main/full Fundamira app later
  packages/
    db/
    core/
    ui/
    event-bus/
    notifications/
    payments/
```

Rules:

- Do not build a separate backend just for the salon app.
- Do not make the database single-tenant.
- Do not make a throwaway prototype that has to be rebuilt later.
- Keep advanced features hidden behind feature flags.
- Keep the salon user experience simple.

## VPS And Hosting

Use DigitalOcean.

Production target:

- DigitalOcean Droplet.
- Ubuntu 24.04 LTS.
- 4 vCPU, 8 GB RAM, 80 GB SSD.
- DigitalOcean Managed Postgres.
- Redis on the VPS for MVP.
- Docker Compose.
- Nginx or Caddy.
- Cloud Firewall.
- Backups enabled.
- Monitoring enabled.
- SSH key login only.

Public routes:

- `fundamira.app` serves the main site.
- `salon.fundamira.app` serves the salon PWA.
- `api.fundamira.app` serves the backend API.

## Database Tables Needed First

Foundation:

- `tenants`
- `locations`
- `users`
- `client_users`
- `admin_users`
- `sessions`
- `client_sessions`
- `admin_sessions`
- `roles`
- `role_assignments`
- `admin_role_assignments`
- `feature_flags`
- `tenant_feature_flags`
- `idempotency_keys`
- `audit_log`

Business setup:

- `staff_members`
- `services`
- `products`
- `product_categories`
- `service_staff`
- `business_hours`
- `staff_schedules`
- `resources`

Calendar and booking:

- `appointments`
- `appointment_services`
- `appointment_status_history`
- `availability_rules`
- `time_blocks`
- `booking_settings`
- `booking_holds`
- `magic_links`
- `calendar_connections`
- `external_calendars`
- `external_calendar_events`
- `calendar_sync_runs`
- `calendar_sync_errors`

CRM:

- `clients`
- `client_notes`
- `client_note_categories`
- `client_alerts`
- `client_tags`
- `client_tag_assignments`
- `client_communication_preferences`
- `client_activity`
- `client_relationships`
- `client_files`
- `client_sources`
- `client_merge_candidates`

Notifications:

- `notification_templates`
- `message_dispatches`
- `message_deliveries`
- `notification_preferences`
- `sms_consent_events`
- `sms_campaigns`
- `sms_campaign_recipients`
- `marketing_campaigns`
- `marketing_campaign_audiences`
- `marketing_campaign_messages`
- `marketing_campaign_events`
- `saved_segments`
- `email_domain_settings`
- `email_domain_verifications`

Payments:

- `payment_provider_connections`
- `payment_intents`
- `payments`
- `carts`
- `cart_items`
- `invoices`
- `invoice_items`
- `invoice_discounts`
- `invoice_taxes`
- `sales`
- `refunds`
- `ledger_entries`
- `payouts`
- `review_requests`

Workers and events:

- `events`
- `webhook_inbox`
- `job_runs`

## Build Order

1. Set up repo/app structure.
2. Set up VPS, database, DNS, and deployment.
3. Deploy a health-check app to `api.fundamira.app`.
4. Deploy a blank PWA shell to `salon.fundamira.app`.
5. Deploy blank login shells for admin, business user, and client sides.
6. Build separate admin, business user, and client auth/session foundations.
7. Build business onboarding.
8. Build staff, services, products, hours, and settings.
9. Build the custom Fundamira calendar.
10. Add external calendar connection and sync.
11. Build booking.
12. Build full CRM foundation.
13. Build the client portal.
14. Add Postmark email and customer domain setup.
15. Add SMS messaging for transactional, marketing, and update sends.
16. Add the Marketing tab for SMS and email campaigns.
17. Add Stripe and Square customer payment setup.
18. Add invoices, service/product line items, invoice links, and review links.
19. Test PWA install on iPhone and Android.
20. Launch to first users.

## Launch Acceptance

Fundamira Salon is ready for first users when:

- `fundamira.app` loads the main website.
- `salon.fundamira.app` loads the PWA.
- `admin.fundamira.app` loads the platform admin login.
- The client portal login loads.
- The PWA can be installed on a phone.
- `api.fundamira.app/healthz` returns healthy.
- Admin, business user, and client logins are separate.
- A business owner can create an account.
- A business can add staff, services, products, hours, payment connection, and email sending domain.
- A business can connect an external calendar or follow a setup walkthrough.
- External calendar busy blocks can protect Fundamira booking availability.
- A client can book an appointment.
- SMS and email confirmations send correctly.
- A user can send invoice links by SMS and email.
- A user can add services and products as invoice line items.
- A user can view a full CRM profile with timeline, notes, tags, alerts, appointments, messages, invoices, and payments.
- A user can send review links by SMS and email.
- A user can send SMS as transactional, marketing, or update messaging.
- A user can create, draft, schedule, send, and track SMS/email marketing campaigns from the Marketing tab.
- Stripe and Square payment connections work in live mode.
- Postmark email domain verification is tracked in business setup.
- The database is backed up.
- The VPS can be rebuilt from documented setup steps.

