# Wellos — Calendar, Booking & Appointments Feature/Benefit List

**Scope:** Calendar, booking, appointments, scheduling, availability, waitlists, rescheduling/cancellation, appointment reminders, booking policies, and related booking UX.

**Purpose:** This is a focused product inventory for the scheduling side of the app. It separates the existing spec items from proposed additions so the team can confirm coverage, decide MVP vs later phases, and add new ideas without mixing them into the source-of-truth feature list too early.

**Legend**

| Phase | Meaning |
|---|---|
| MVP | Should ship in the first working booking/calendar release. |
| Phase 2 | Valuable, but can wait until the core engine and client booking flow are stable. |
| Full Platform | Enterprise/deeper capability after the main workflows are proven. |
| Proposed | New suggested item to review; not yet in the core spec. |

---

## 1. Calendar Area

| Feature | What it does | Business / staff benefit | Client benefit | Phase | Source / status |
|---|---|---|---|---|---|
| Day calendar view | Shows appointments, open slots, blocks, and staff availability for a single day. | Gives staff a fast operational view of today. | Reduces missed or confused appointments. | MVP | Existing spec |
| Week calendar view | Shows staff schedules and appointment blocks across the week. | Helps owners and managers spot capacity gaps and schedule density. | More accurate booking availability. | MVP | Existing spec |
| Staff-column calendar | Displays staff members as separate columns so appointments can be assigned and moved visually. | Makes provider scheduling clear and fast. | Clients get booked with the right provider. | MVP | Existing spec |
| Appointment blocks | Calendar cards show service, client, provider, time, status, and key labels. | Staff can understand the day at a glance. | Fewer check-in and service-prep mistakes. | MVP | Existing spec |
| Appointment status badges | Shows states such as confirmed, checked-in, in-progress, completed, no-show, cancelled, or requested. | Everyone knows what action is needed next. | Clients receive appropriate reminders and follow-ups. | MVP | Existing spec |
| Open slot rows / gaps | Shows available gaps during business hours, especially gaps of 30+ minutes. | Makes unused time visible and bookable. | Clients can be placed into real openings faster. | MVP | Existing spec |
| “Next up” appointment marker | Highlights the next appointment that has not started yet. | Helps staff focus on the next client. | Improves readiness and service flow. | MVP | Existing spec |
| Past appointment de-emphasis | Past appointments remain visible but visually fade. | Keeps today’s history without distracting from current work. | Improves staff accuracy when answering client questions. | MVP | Existing spec |
| Appointment detail drawer | Opens a side drawer or mobile sheet with appointment, client, payment, intake, notes, and actions. | Avoids full-page navigation and keeps calendar work fast. | Faster handling of changes, check-in, and questions. | MVP | Existing spec |
| Calendar bottom sheet on mobile | Mobile version of the appointment detail drawer. | Makes calendar usable from a phone or PWA. | Faster service from mobile staff or solo providers. | MVP | Existing spec |
| Drag-to-create appointment | Staff drag an empty time block to create a new appointment. | Reduces scheduling time for staff. | Walk-ins and phone bookings are handled quickly. | MVP | Existing spec |
| Drag-to-reschedule appointment | Staff drag an existing appointment to another time or provider column. | Makes rescheduling visual and fast. | Clients get updated automatically. | MVP | Existing spec |
| Block time off | Staff or managers block lunch, training, breaks, appointments, or unavailable time. | Prevents clients from booking into unavailable windows. | Clients only see realistic availability. | MVP | Existing spec |
| Recurring blocks | Supports weekly recurring unavailable blocks. | Handles weekly lunch, admin time, or staff commitments. | Reduces accidental booking into repeated unavailable periods. | MVP | Existing spec |
| Pending block approval | Non-manager block requests can show as pending and still block availability conservatively. | Lets managers control long blocks without exposing clients to uncertain openings. | Prevents bookings that may need to be canceled later. | MVP | Existing spec |
| Calendar conflict state | Shows when blocks or appointments overlap. | Prevents hidden double-booking and forces a decision. | Reduces appointment changes after booking. | MVP | Existing spec |
| Manager override visual indicator | Double-booked appointments created by override show a distinct visual marker. | Makes exceptional scheduling visible and auditable. | Reduces confusion when two clients share a slot. | MVP | Existing spec |
| Calendar role filtering | Owners/managers/front desk can see all appointments; providers/subcontractors can be limited to their own. | Protects privacy and keeps views relevant. | Client information is not overexposed internally. | MVP | Existing spec |
| Staff availability/status overview | Shows who is available, busy, or has gaps based on appointments and working hours. | Helps managers balance staffing and coverage. | Faster assignment to an available provider. | MVP | Existing spec |
| Tap open slot to Quick Book | Clicking an open slot launches Quick Book with the time pre-filled. | Turns downtime into bookable revenue. | Shortens booking time for clients calling or walking in. | MVP | Existing spec |
| Check-in action | Marks a client as checked in. | Keeps front desk, provider, and reporting aligned. | Client progress is tracked accurately. | MVP | Existing spec |
| No-show action | Marks appointment as no-show without freeing the slot for new bookings. | Preserves accurate revenue and attendance reporting. | Avoids incorrect same-slot rebooking after a client misses an appointment. | MVP | Existing spec |
| Collect payment action | Opens checkout from the appointment drawer. | Connects calendar work to revenue collection. | Payment happens at the right point in the visit. | MVP / payments dependency | Existing spec |
| Add note action | Adds appointment/client notes from the drawer. | Captures details while the appointment is fresh. | Improves continuity across future visits. | MVP | Existing spec |
| Cancel action | Staff can cancel from the appointment drawer with confirmation. | Keeps the calendar accurate. | Client receives clear cancellation messaging. | MVP | Existing spec |
| Calendar refresh | Pull-to-refresh or independent schedule refresh without reloading the dashboard. | Keeps staff views current during the day. | Reduces stale schedule errors. | MVP | Existing spec |
| External calendar busy blocks | Imports external busy blocks, initially by polling, and flags conflicts rather than auto-canceling. | Lets staff protect time from Google/Outlook/Apple-style calendars. | Clients avoid booking into personal conflicts. | MVP baseline / Phase 2 realtime | Existing spec |
| Add-to-calendar output | Confirmation page offers an `.ics` or add-to-calendar option. | Reduces client no-shows. | Client can place booking on their own calendar immediately. | MVP | Existing spec |

---

## 2. Public Booking Area

| Feature | What it does | Business benefit | Client benefit | Phase | Source / status |
|---|---|---|---|---|---|
| Public booking portal | Per-tenant booking page for clients to self-book. | Increases bookings without staff involvement. | Clients can book anytime. | MVP | Existing spec |
| Login-free booking | Client books without creating an account or password. | Removes the largest conversion barrier. | Faster, lower-friction booking. | MVP | Existing spec |
| Mobile-first booking flow | Designed for one-handed mobile booking in under 90 seconds. | Higher conversion from social, search, and website traffic. | Easier booking from phone. | MVP | Existing spec |
| Service selection | Client chooses service from cards with name, duration, price, and description. | Encourages self-selection and reduces phone calls. | Clear service choice before time selection. | MVP | Existing spec |
| Service categories and search | Groups services by category and supports search when there are many services. | Keeps large menus navigable. | Clients find the right service faster. | MVP | Existing spec |
| Service detail sheet | Opens gallery, long description, what-to-expect, prep, and review before booking. | Builds trust and reduces wrong-service bookings. | Client understands what they are booking. | MVP / enhanced UX | Existing enhancement |
| Provider preference | Lets client pick “any available” or choose a provider. | Supports both fastest-available and loyalty use cases. | Client gets control without forced complexity. | MVP | Existing spec |
| Provider profile sheet | Shows staff bio, specialties, years of experience, gallery, video, and review. | Builds provider trust and supports premium services. | Client can choose the right provider. | MVP / enhanced UX | Existing enhancement |
| Any-available provider matching | Books client with an eligible provider when no preference is chosen. | Keeps the flow fast and fills schedules. | Client gets the earliest or best-fit available provider. | MVP | Existing spec |
| Round-robin / load-balanced assignment | Adds fair assignment strategies for “any available.” | Prevents one provider from getting overloaded. | Clients still get a qualified provider. | MVP | Existing enhancement |
| Preferred-first assignment | Returning clients default toward their previous provider before round-robin. | Improves retention and provider continuity. | Client sees a familiar provider. | MVP | Existing enhancement |
| Time selection slot grid | Shows available times for the chosen service, provider preference, and date. | Makes availability transparent. | Client can pick a real opening. | MVP | Existing spec |
| Date picker | Lets client move through the booking horizon. | Reduces staff calls asking about future availability. | Client can plan ahead. | MVP | Existing spec |
| Suggested nearby dates | When no availability exists, suggests nearby days with openings. | Converts dead-end searches into bookings. | Client does not have to hunt manually. | MVP | Existing spec |
| Timezone label | Displays the business timezone for slot selection. | Reduces timezone and DST confusion. | Client knows what time they are booking. | MVP | Existing spec |
| Slot hold | Temporarily holds selected slot, default 7 minutes, after the client starts details/payment. | Prevents another user from taking the slot mid-booking. | Client gets confidence while entering details. | MVP | Existing spec |
| Slot hold timer | Shows countdown while the slot is held. | Reduces abandoned stale holds. | Client knows how much time remains. | MVP / enhanced UX | Existing enhancement |
| Client details form | Captures name, email, phone, notes, SMS opt-in, and payment details when needed. | Creates usable client and communication records. | Client can complete booking in one screen. | MVP | Existing spec |
| SMS opt-in | Explicit opt-in for reminders and updates. | Supports compliant messaging. | Client controls reminder channel. | MVP | Existing spec |
| Booking summary panel | Shows service, duration, provider, date/time, total, deposit, and policy. | Reduces disputes and support calls. | Client sees all terms before confirming. | MVP | Existing spec |
| Exact cancellation timestamp | Shows the exact free-cancel/reschedule deadline and fee. | Prevents policy ambiguity. | Client understands the cost before booking. | MVP | Existing spec |
| Confirmation screen | Confirms service, provider, time, total, card/deposit status, add-to-calendar, and manage booking. | Closes the loop cleanly after booking. | Client has clear next steps. | MVP | Existing spec |
| Manage booking link | Confirmation includes a magic-link-authenticated manage booking button. | Reduces calls for simple changes. | Client can manage without account login. | MVP | Existing spec |
| Returning client recognition | Matches returning clients server-side using email plus phone/name logic. | Reduces duplicate client records. | Client does not need an account. | MVP | Existing spec |
| “This isn’t me” escape hatch | Lets client dispute an incorrect match and re-link or create a new record. | Prevents privacy and identity mistakes. | Client can fix account mismatch without support. | MVP | Existing spec |
| Instant booking policy | Client books and receives immediate confirmation. | Highest conversion for predictable schedules. | Immediate certainty. | MVP | Existing spec |
| Request approval policy | Client requests a time; staff approves or declines. | Supports vetting and high-touch services. | Client knows request status and is not charged until approved. | MVP | Existing spec |
| Staff-only booking policy | Public page becomes contact-to-book instead of self-booking. | Supports businesses that require personal scheduling. | Client knows how to request an appointment. | MVP | Existing spec |
| Public booking 404 / no tenant fallback | Wrong booking URL shows branded fallback rather than server error. | Protects brand experience. | Client sees a clear path instead of broken page. | MVP | Existing spec |
| Direct service link | URL opens booking with a specific service preselected. | Better conversion from service-specific marketing. | Client skips irrelevant steps. | MVP | Existing enhancement |
| Direct staff link | URL opens booking filtered to one provider’s services. | Supports provider-specific social links. | Client books the person they came for. | MVP | Existing enhancement |
| Direct service + staff link | URL opens with service and staff preselected. | Ideal for campaigns, bios, and follow-up messages. | Client lands close to time selection. | MVP | Existing enhancement |
| Embeddable booking widget | Iframe and JS widget for tenant websites. | Lets tenants book directly from their own sites. | Client books without leaving the business website. | MVP / fast-follow | Existing enhancement |
| Campaign booking links | Tracked links with click, booking, revenue, and conversion counts. | Shows which marketing links drive revenue. | Client gets a relevant link from the channel they used. | MVP / fast-follow | Existing enhancement |
| QR booking links | Generates QR codes for service/staff/campaign booking links. | Useful for front desk, flyers, business cards, events. | Client scans and books instantly. | MVP / fast-follow | Existing enhancement |

---

## 3. Appointment Management Area

| Feature | What it does | Business / staff benefit | Client benefit | Phase | Source / status |
|---|---|---|---|---|---|
| Appointment model | Stores client, staff, service, resource, status, start/end, timezone, duration, price, deposit, policy, notes, and source. | Makes appointments the operational source of truth. | Client booking details stay consistent. | MVP | Existing spec |
| Appointment statuses | Supports pending payment, confirmed, checked in, in progress, completed, no-show, cancelled, and requested/declined for request workflows. | Enables reliable operations and reporting. | Client communications match real status. | MVP | Existing spec |
| Create appointment | Creates appointment through public booking, quick book, calendar drag, walk-in, or API/widget path. | Standardizes appointment creation. | Consistent experience across channels. | MVP | Existing spec |
| Reschedule appointment | Changes time and optionally provider/service with audit and notifications. | Keeps schedule flexible without losing tracking. | Client receives updated confirmation. | MVP | Existing spec |
| Client self-reschedule | Magic link lets client pick a new slot. | Reduces staff scheduling workload. | Client can change booking quickly. | MVP | Existing spec |
| Staff drag reschedule | Calendar drag changes appointment time or provider. | Faster staff workflow. | Client gets automatic update. | MVP | Existing spec |
| Cancel appointment | Client or staff cancellation updates status, frees slot when appropriate, removes queued reminders. | Keeps availability accurate. | Client gets clear cancellation status. | MVP | Existing spec |
| Staff-initiated cancellation | Staff can cancel without charging the client, regardless of cancellation window. | Avoids unfair fees and disputes. | Client is not penalized for business-side cancellation. | MVP | Existing spec |
| Staff cancel with rebook offers | Staff cancellation notification can include three alternate times. | Saves revenue after unavoidable cancellation. | Client can rebook quickly. | MVP | Existing spec |
| No-show marking | Staff manually mark no-show; policy can charge if enabled. | Supports no-show reporting and fees. | Clear appointment history. | MVP | Existing spec |
| Manual no-show only | System does not auto-mark no-show in MVP. | Avoids disputes before check-in workflows are mature. | Clients are not incorrectly marked absent. | MVP | Existing spec |
| Appointment audit log | Records overrides, reschedules, staff cancellations, match disputes, and policy-sensitive changes. | Creates defensible operational history. | Protects clients from unexplained changes. | MVP | Existing spec |
| Appointment notes | Internal and client-facing notes can be linked to the appointment. | Staff can prepare and document context. | Client preferences are remembered. | MVP | Existing spec |
| Appointment source tracking | Tracks consumer web, staff web, widget, API, import, or campaign source. | Supports attribution and reporting. | Indirectly improves future booking experience. | MVP | Existing spec |
| Idempotency key | Prevents duplicate appointment creation from retries or double-clicks. | Avoids duplicate bookings and payment confusion. | Client is not double-booked. | MVP | Existing spec |
| Booking hold record | Holds a slot while booking is in progress. | Prevents race conditions during checkout/details entry. | Client’s chosen time is protected temporarily. | MVP | Existing spec |
| Booking creation rollback | If payment fails or booking cannot confirm, client gets a clear error and hold remains if valid. | Prevents charge-without-booking scenarios. | Client can retry without starting over. | MVP | Existing spec |
| Recurring appointments | Supports weekly recurring appointment expansion in MVP. | Handles repeat clients and ongoing care. | Client does not need to rebook every week. | MVP | Existing spec |
| Multi-service appointments | Supports stacked services in schema/future UI. | Enables richer visits and higher tickets. | Client can book a full visit bundle. | Phase 2 | Existing deferred |
| Multi-provider appointments | Handles services requiring more than one provider. | Supports salon workflows like color plus assistant. | Client gets properly coordinated service. | Full Platform | Existing deferred |
| Appointment status history | Tracks historical state transitions. | Supports audits, reporting, and debugging. | Client history stays accurate. | MVP / Studio schema | Existing spec |

---

## 4. Scheduling & Availability Engine

| Feature | What it does | Business / staff benefit | Client benefit | Phase | Source / status |
|---|---|---|---|---|---|
| Availability computation | Computes bookable slots from service, staff, date range, location, and rules. | Centralizes the hardest scheduling logic. | Clients only see real openings. | MVP | Existing spec |
| Computed, not materialized, slots | Availability is calculated on demand rather than stored as static slots. | Prevents stale-slot and DST bugs. | Fewer failed bookings. | MVP | Existing spec |
| Staff working hours | Availability respects provider schedules. | Staff schedules are honored automatically. | Clients cannot book unavailable staff. | MVP | Existing spec |
| Service duration | Slots match the service duration. | Prevents under-booked services. | Client receives correct appointment length. | MVP | Existing spec |
| Buffer time | Adds before/after buffers as configured. | Gives providers transition and cleanup time. | Reduces rushed appointments. | MVP | Existing spec |
| Existing appointment subtraction | Removes already-booked times from available slots. | Prevents double booking. | Client sees accurate availability. | MVP | Existing spec |
| Resource / room availability | Considers rooms, chairs, equipment, or other resources when service requires them. | Prevents resource conflicts. | Client gets a valid appointment. | MVP optional / Growth deeper | Existing spec |
| Location operating hours | Availability respects business hours. | Keeps booking inside operational windows. | Client knows business is open. | MVP | Existing spec |
| Tenant blackout dates | Blocks holidays, closures, or special unavailable days. | Prevents booking during closures. | Client avoids canceled bookings. | MVP | Existing spec |
| Minimum booking notice | Stops last-minute bookings inside configured lead time. | Gives staff prep time. | Client sees realistic times. | MVP | Existing spec |
| Maximum booking horizon | Limits how far ahead clients can book, default 90 days. | Prevents schedule overcommitment. | Client gets clear planning window. | MVP | Existing spec |
| Timezone-safe math | Stores times in UTC and renders in business timezone. | Avoids DST and timezone revenue bugs. | Client sees correct local times. | MVP | Existing spec |
| DST test coverage | Explicit tests for appointments crossing daylight saving transitions. | Prevents hard-to-diagnose calendar defects. | Client times stay correct. | MVP | Existing spec |
| DB-level double-book prevention | Postgres exclusion constraint prevents overlapping confirmed appointments for same staff. | UI cannot bypass safety. | Client avoids invalid booking. | MVP | Existing spec |
| Clear slot-unavailable error | If slot is taken between lookup and submit, app refreshes availability and prompts again. | Handles real-world race conditions cleanly. | Client gets alternatives instead of failure. | MVP | Existing spec |
| Availability cache | Caches availability briefly and invalidates on appointment write. | Keeps booking fast without stale data. | Client gets fast slot grids. | MVP | Existing spec |
| Any-provider strategy setting | Determines how the engine picks providers when client chooses “any.” | Lets businesses choose fairness vs speed. | Client gets appropriate provider assignment. | MVP | Existing enhancement |
| Availability rules table | Stores rules controlling hours, blocks, and exceptions. | Gives scheduling system explicit configuration. | Client sees accurate availability. | MVP / Studio schema | Existing spec |
| Travel time between off-site appointments | Adds travel buffers for mobile/off-site providers. | Prevents impossible back-to-back appointments. | Client gets realistic arrival/service time. | Phase 2 | Existing deferred / proposed for mobile service |

---

## 5. Quick Book & Staff Booking Area

| Feature | What it does | Business / staff benefit | Client benefit | Phase | Source / status |
|---|---|---|---|---|---|
| Quick Book widget | Dashboard widget for fast appointment creation. | Staff can book in under 30 seconds. | Faster phone and front-desk booking. | MVP | Existing spec |
| Client typeahead | Searches clients by name, phone, or similar identifier. | Speeds up returning-client bookings. | Client does not repeat all details. | MVP | Existing spec |
| Inline new client | Staff can create a minimal client inline. | Keeps walk-ins fast. | Client can be booked without a long intake. | MVP | Existing spec |
| Service dropdown | Selects active service, filtered when needed. | Reduces errors. | Client gets correct service. | MVP | Existing spec |
| Today open slot dropdown | Shows available slots for today in Quick Book. | Speeds same-day scheduling. | Client gets booked immediately. | MVP | Existing spec |
| Any-staff Quick Book | Staff can leave staff as any; server assigns. | Reduces decision time. | Client gets an available provider. | MVP | Existing spec |
| Optimistic booking UI | Appointment appears immediately with “Saving…” then reconciles with server. | Makes the interface feel fast. | Client sees quick confirmation from staff. | MVP | Existing spec |
| Quick Book rollback | Removes optimistic appointment if server rejects it and refreshes options. | Keeps schedule accurate after errors. | Client gets corrected availability. | MVP | Existing spec |
| Staff walk-in flow | Minimal booking path for walk-in clients. | Handles walk-ins under 30 seconds. | Client can be served quickly. | MVP | Existing spec |
| Send confirmation checkbox | Staff-created appointments can optionally send client confirmation. | Flexible for walk-ins vs remote bookings. | Client gets confirmation when helpful. | MVP | Existing spec |
| Send payment link | If deposit is required but no card exists, staff can send payment link. | Preserves deposit policy without blocking staff workflow. | Client can pay remotely. | MVP / payments dependency | Existing spec |
| Staff booking with pending payment | Staff can create appointment when no card exists and collect later. | Makes known-client workflow practical. | Client is not blocked at front desk. | MVP | Existing spec |

---

## 6. Rescheduling, Cancellation & Waitlist Area

| Feature | What it does | Business / staff benefit | Client benefit | Phase | Source / status |
|---|---|---|---|---|---|
| Magic-link appointment view | Client opens secure link to view booking without login. | Reduces inbound support. | Client can manage booking easily. | MVP | Existing spec |
| Magic-link refresh | Opening a valid link can refresh access; expired links trigger new-link flow. | Keeps links usable without accounts. | Client can return to manage booking. | MVP | Existing spec |
| Client reschedule flow | Client picks a new slot for same service/provider, with option to change. | Reduces rescheduling workload. | Client controls schedule changes. | MVP | Existing spec |
| Late reschedule policy | Optional fee for late reschedule; recommended default off. | Businesses can choose strictness. | Client may avoid fee if rescheduling instead of canceling. | MVP setting / proposed toggle | Existing recommendation |
| Reschedule audit | Logs old time, new time, actor, and reason. | Makes schedule changes traceable. | Client can verify what changed. | MVP | Existing spec |
| Re-queue reminders after reschedule | Deletes old reminder jobs and schedules new ones. | Prevents wrong-time reminders. | Client receives correct reminders. | MVP | Existing spec |
| Client cancellation flow | Client cancels via magic link and sees fee/no-fee state. | Reduces staff calls. | Client can cancel clearly. | MVP | Existing spec |
| Cancellation confirmation | Shows appointment cancelled and rebook option. | Saves future revenue. | Client can rebook immediately. | MVP | Existing spec |
| Cancellation fee receipt | If charged, cancellation confirmation includes fee amount and receipt. | Reduces disputes. | Client has proof of charge. | MVP | Existing spec |
| Waitlist signup | Client joins waitlist when no desired slot is available. | Captures demand instead of losing it. | Client can be notified if a slot opens. | MVP | Existing spec |
| Waitlist preference capture | Records preferred dates, time of day, service, optional staff, and contact info. | Makes waitlist matching useful. | Client gets relevant offers. | MVP | Existing spec |
| Waitlist SMS opt-in requirement | Requires SMS opt-in because waitlist operates through text. | Keeps messaging compliant and practical. | Client receives timely offers. | MVP | Existing spec |
| Waitlist conversion offer | Sends matching opening with a 15-minute claim link. | Fills canceled slots quickly. | Client can grab the opening. | MVP | Existing spec |
| Time-boxed waitlist hold | Holds the opening for notified client before moving to next. | Fairly manages demand. | Client gets a genuine chance to claim slot. | MVP | Existing spec |
| Waitlist TTL | Waitlist entries expire after a configured period, default 14 days. | Keeps waitlist clean. | Client is not contacted about stale preferences. | MVP | Existing spec |
| Manual waitlist promotion | Staff can manually promote a waitlist client. | Gives staff control in MVP. | Client can be placed faster. | MVP | Existing spec |
| Auto waitlist promotion | System automatically promotes next waitlist client on cancellation. | Saves staff time at scale. | Client gets faster openings. | Phase 2 / Full Platform | Existing spec |

---

## 7. Booking Payments, Deposits & Policy Area

| Feature | What it does | Business benefit | Client benefit | Phase | Source / status |
|---|---|---|---|---|---|
| Card on file | Saves card through setup intent or equivalent tokenized payment method. | Enables no-show/cancellation policy. | Client avoids repeated card entry. | MVP / payments dependency | Existing spec |
| Deposit collection | Charges deposit at booking and applies it to visit balance. | Reduces no-shows and protects revenue. | Client knows what is paid today. | MVP / payments dependency | Existing spec |
| Full payment at booking | Supports full prepayment when configured. | Useful for prepaid services and high-demand slots. | Client can complete payment upfront. | MVP / payments dependency | Existing build spec |
| Optional payment | Allows optional payment depending on service rules. | Flexible checkout for lower-risk services. | Client can pay now or later. | MVP / payments dependency | Existing build spec |
| Cancellation policy engine | Evaluates cancellation window and fee when client cancels. | Applies rules consistently. | Client receives predictable policy handling. | MVP | Existing spec |
| No-show fee engine | Charges no-show fee when staff marks no-show and policy applies. | Protects provider time. | Client sees clear policy before booking. | MVP | Existing spec |
| Staff override for fees | Staff can waive or override fee with reason. | Supports human judgment. | Client can be treated fairly. | MVP | Existing spec |
| Deposit refund logic | Refunds or forfeits deposit based on cancellation timing. | Keeps policy consistent. | Client understands what happens to deposit. | MVP basic / Phase 2 advanced | Existing spec |
| Balance due display | Shows balance due after deposit. | Reduces checkout confusion. | Client knows remaining cost. | MVP | Existing spec |
| Ledger linkage | Deposits, cancellation fees, no-show fees, and tips link to appointment. | Accurate revenue reporting. | Accurate receipts and history. | MVP | Existing spec |
| Post-review tip flow | Prompts happy clients to tip after a 5-star review when no checkout tip was given. | Captures incremental staff revenue. | Client can recognize provider after the visit. | Phase 2 | Existing deferred |

---

## 8. Intake, Prep & Appointment Context Area

| Feature | What it does | Business / staff benefit | Client benefit | Phase | Source / status |
|---|---|---|---|---|---|
| Intake form trigger | Sends service-specific form after booking. | Collects required info before visit. | Client can complete forms before arrival. | MVP | Existing spec |
| Intake status on appointment | Drawer shows intake complete or pending. | Staff can nudge clients and prepare. | Client does not repeat information at visit. | MVP | Existing spec |
| Intake reminder | Sends reminder if form is incomplete before appointment. | Reduces front-desk paperwork. | Client gets prompted at the right time. | MVP | Existing spec |
| Pre-booking triage questions | Asks quick preferences before final booking. | Gives providers actionable context. | Client can personalize visit. | MVP | Existing enhancement |
| Service question templates | Starter packs per service category such as massage, hair color, nails, facial, medspa consult. | Makes setup fast for tenants. | Client gets relevant questions, not generic forms. | MVP | Existing enhancement |
| Photo upload in booking | Lets client upload inspo/reference photos during booking. | Avoids manual “send me a photo” texts. | Client can show exactly what they want. | MVP | Existing enhancement |
| Staff prep visibility | Shows triage answers on Today view, appointment drawer, and pre-shift digest. | Staff can prepare before the client arrives. | Client feels remembered and understood. | MVP | Existing enhancement |
| Pre-session prep content | Shows and sends prep instructions before visit. | Reduces manual prep texts and late arrivals. | Client knows what to expect and bring. | MVP | Existing enhancement |
| Aftercare content | Sends aftercare after appointment completion. | Improves retention and reduces follow-up workload. | Client gets clear care instructions. | MVP | Existing enhancement |
| Hard contraindication gating | Medspa-specific pre-booking questions can block unsafe services before slot selection. | Prevents bad-fit bookings and awkward cancellations. | Client is redirected before wasting time. | MVP medspa-only | Existing enhancement |
| Morning / pre-shift digest | Staff receives compact prep summary for upcoming appointments. | Providers start the day prepared. | Client gets better-informed service. | MVP | Existing spec/enhancement |

---

## 9. Booking Notifications & Messaging Area

| Feature | What it does | Business / staff benefit | Client benefit | Phase | Source / status |
|---|---|---|---|---|---|
| Booking confirmation SMS | Sends confirmation when client opts into SMS. | Reduces uncertainty and missed appointments. | Client gets immediate confirmation. | MVP | Existing spec |
| Booking confirmation email | Sends confirmation email after booking. | Reliable fallback to SMS. | Client has written details. | MVP | Existing spec |
| Reminder SMS/email | Sends appointment reminders, including magic links. | Reduces no-shows. | Client remembers appointment and can manage it. | MVP | Existing spec |
| Staff request approval alert | Notifies staff/admin when request-approval booking needs action. | Keeps pending requests from being missed. | Client receives timely approval/decline. | MVP | Existing spec |
| Approval confirmation | Sends confirmation after staff approves requested appointment. | Closes request loop. | Client knows booking is confirmed. | MVP | Existing spec |
| Decline notification | Sends decline with optional nearby-time suggestions. | Saves client relationship. | Client can try another time. | MVP | Existing spec |
| Reschedule notification | Sends new and previous appointment time after change. | Prevents confusion. | Client knows exactly what changed. | MVP | Existing spec |
| Staff-initiated change confirmation | Client can confirm or request another time after staff moves appointment. | Reduces friction after staff changes. | Client has a say if new time does not work. | MVP | Existing spec |
| Cancellation notification | Sends cancellation details and rebook link. | Keeps communication professional. | Client receives clear next step. | MVP | Existing spec |
| Waitlist notification | Texts a client when a matching opening appears. | Fills canceled slots. | Client gets opportunity faster. | MVP | Existing spec |
| Prep reminder with content | Adds prep instructions into existing reminder rather than sending separate message. | Avoids client message fatigue. | Client receives useful info in one reminder. | MVP | Existing enhancement |
| Aftercare delivery | Sends aftercare after appointment completion. | Improves client outcomes and retention. | Client knows how to care after service. | MVP | Existing enhancement |
| Review request notification | Sends review request after completion. | Captures reviews and later tip prompts. | Client can share feedback easily. | Phase 2 | Existing deferred |
| TextLink + Postmark channel strategy | SMS and email are the reliable MVP channels for PWA products. | Works without native app push notifications. | Client gets messages on familiar channels. | MVP | Existing Studio plan |

---

## 10. Booking Settings & Rules Area

| Feature | What it does | Business benefit | Staff/client benefit | Phase | Source / status |
|---|---|---|---|---|---|
| Two-tier booking settings | Resolves company, staff, appointment override, and system default values. | Balances company control and staff autonomy. | Clients receive consistent policy behavior. | MVP | Existing spec |
| Company setting modes | Supports locked, default-overridable, staff-controlled, and disabled modes. | Makes configuration explicit. | Staff know what they can control. | MVP | Existing spec |
| Staff booking preferences | Staff can control allowed settings when company permits. | Supports provider-specific workflows. | Client booking respects provider reality. | MVP | Existing spec |
| Booking policy setting | Chooses instant, request approval, or staff-only. | Matches each tenant’s operating style. | Client sees the correct flow. | MVP | Existing spec |
| Deposits enabled / amount | Controls deposit behavior by company/staff/service. | Protects revenue. | Client sees upfront payment rule. | MVP | Existing spec |
| Cancellation window / fee | Controls late cancellation rules. | Reduces revenue leakage and disputes. | Client sees exact deadline. | MVP | Existing spec |
| No-show fee | Controls no-show charge. | Protects staff time. | Client knows risk before booking. | MVP | Existing spec |
| Minimum booking notice | Prevents too-soon bookings. | Gives staff prep time. | Client sees bookable times only. | MVP | Existing spec |
| Maximum booking window | Limits how far ahead bookings can be made. | Prevents overcommitment. | Client understands planning range. | MVP | Existing spec |
| Buffer time | Controls transition time between appointments. | Prevents rushed providers. | Better appointment experience. | MVP | Existing spec |
| Service offerings per staff | Controls which staff can perform which service. | Prevents invalid provider assignment. | Client gets qualified provider. | MVP | Existing spec |
| Working hours | Staff/company scheduling hours. | Defines availability. | Client sees accurate slots. | MVP | Existing spec |
| Break/lunch scheduling | Blocks recurring or ad hoc breaks. | Protects staff time. | Client sees realistic schedule. | MVP | Existing spec |
| Walk-in acceptance | Controls whether staff accept walk-ins. | Supports front-desk workflow. | Client can be handled appropriately. | MVP | Existing spec |
| Tips enabled and defaults | Controls tip availability and percentages. | Supports staff earnings. | Client has clear tip options. | MVP / checkout dependency | Existing spec |
| Override/double-book permissions | Controls who can override conflicts. | Prevents abuse of double-booking. | Client appointments are protected. | MVP | Existing spec |
| Client recognition strictness | Controls matching logic. | Reduces duplicate clients and privacy risk. | Client identity is handled safely. | MVP | Existing spec |
| Calendar sync enabled | Company enables external calendar options; staff opt in. | Protects staff personal time. | Client avoids unavailable times. | MVP baseline | Existing spec |
| Assignment strategy | Chooses first available, round-robin, load-balanced, priority-weighted, or preferred-first. | Balances team utilization. | Client still gets a qualified provider. | MVP | Existing enhancement |
| Booking Links settings page | Exposes base URL, direct links, QR codes, campaign links, and embed snippets. | Makes booking links easy to use and track. | Client gets shorter booking paths. | MVP / fast-follow | Existing enhancement |

---

## 11. Classes, Group Booking & Phase 2 Scheduling

| Feature | What it does | Business benefit | Client benefit | Phase | Source / status |
|---|---|---|---|---|---|
| Class templates | Defines repeatable class types. | Supports fitness/studio verticals. | Client can book classes. | Phase 2 | Existing spec |
| Class occurrences | Creates dated class sessions from templates. | Enables class schedule management. | Client sees real class times. | Phase 2 | Existing spec |
| Registrations | Tracks clients registered for a class occurrence. | Manages class capacity. | Client gets a reserved class spot. | Phase 2 | Existing spec |
| Class capacity | Limits registrations based on class or room size. | Prevents overfilled classes. | Client has clear availability. | Phase 2 | Existing spec |
| Class waitlist | Waitlist for full classes. | Captures demand and fills cancellations. | Client can get notified about openings. | Phase 2 | Existing spec |
| Pick-a-spot seating | Lets clients reserve a mat/seat/station. | Premium studio feature and operational clarity. | Client gets preferred spot. | Phase 2 | Existing spec |
| Companion/group booking | Books multiple people together, such as couples, bridal, family. | Captures higher-ticket group revenue. | Clients can coordinate group visits. | Phase 2 | Existing deferred |
| Gift booking | Lets someone book for another person, likely tied to gift cards. | Adds gifting revenue. | Client can gift an experience. | Phase 2 | Existing deferred |
| Save-for-later / wishlist | Lets clients save services without booking now. | Supports high-consideration services. | Client can return to services later. | Phase 2 | Existing deferred |
| Multi-language booking | Adds Spanish or other language support. | Expands addressable client base. | Client can book in preferred language. | Phase 2 | Existing deferred |
| Invitee-timezone display | Shows slots in client timezone when useful. | Supports travelers/virtual consults. | Client avoids timezone confusion. | Phase 2 | Existing deferred |
| Social booking integrations | Instagram, Google Reserve, Facebook, etc. | Captures bookings from external channels. | Client books from where they discover the business. | Phase 2 | Existing deferred |
| Real-time external calendar sync | Replaces polling with faster external calendar updates. | Reduces conflict window. | Client sees fresher availability. | Phase 2 | Existing deferred |

---

## 12. Proposed Additions to Review

These are **not** confirmed in the source specs. They are suggested additions to consider after the MVP inventory is reviewed.

| Proposed feature | What it would do | Why it may be valuable | Suggested phase | Decision |
|---|---|---|---|---|
| Smart gap filler | Suggests appointments that fit awkward 15–45 minute gaps or recommends services that fit a remaining gap. | Turns unusable schedule fragments into revenue. | Phase 2 | Review |
| Cancellation rescue flow | When a client cancels, immediately offers alternative times or a lighter service before final cancellation. | Saves revenue and keeps clients in the funnel. | MVP fast-follow | Review |
| Last-minute opening broadcast | Staff can broadcast a newly opened slot to eligible waitlist/recent clients. | Fills cancellations quickly. | Phase 2 | Review |
| Rebook reminder after completion | Prompts client to book again based on service cadence, e.g., “Book your next facial in 4 weeks.” | Increases repeat booking. | Phase 2 | Review |
| Preferred cadence per service | Services can define recommended rebooking interval. | Automates retention by service type. | Phase 2 | Review |
| Provider prep checklist | Staff gets a checklist per appointment: intake done, photos reviewed, prep answers read, room ready. | Reduces service misses and operational variance. | MVP fast-follow | Review |
| High-risk no-show flag | Flags clients with repeated no-shows or late cancels during booking/staff scheduling. | Helps staff require deposit/card or request approval. | Phase 2 | Review |
| Waitlist priority tiers | VIPs, members, or package holders can be prioritized for openings. | Adds value to memberships and high-value clients. | Phase 2 | Review |
| Auto-fill from client preferences | Returning clients’ prior preferences prefill booking triage questions. | Faster repeat booking and stronger personalization. | Phase 2 | Review |
| Staff capacity heatmap | Visualizes busiest days/hours and underused provider time. | Helps owners adjust hours, pricing, and staffing. | Phase 2 | Review |
| Calendar print/export day sheet | Printable day sheet for businesses that still run a physical desk workflow. | Helps low-tech operational environments. | MVP fast-follow | Review |
| Service prep library | Default prep/aftercare library by vertical and service category. | Saves tenant setup time and improves content quality. | MVP fast-follow | Review |
| Weather-aware reminders | Adds weather note for outdoor/mobile appointments or severe-weather closures. | Reduces missed mobile/off-site appointments. | Later | Review |
| Mobile-service route planner | Sequences off-site appointments and travel buffers. | Valuable for massage/mobile providers. | Phase 2 | Review |
| Booking inbox | Converts inbound SMS/email requests into suggested appointments. | Bridges manual booking requests and the calendar. | Phase 2 / AI later | Review |
| Admin booking sandbox | Lets owner preview booking flow without creating real appointments. | Makes setup safer and easier. | MVP fast-follow | Review |

---

## 13. MVP Cut List — Calendar / Booking / Appointments Only

This is the focused “build first” list if the team wants a shippable scheduling release.

1. Availability engine with staff hours, existing appointments, buffers, blackout dates, min notice, max horizon, and timezone-safe math.
2. Appointment model, status transitions, no-double-booking constraint, appointment audit events.
3. Public login-free booking portal: service, provider preference, slot grid, details, policy disclosure, confirmation.
4. Slot holds with clear expiration and stale-slot recovery.
5. Magic link manage booking, reschedule, and cancel flows.
6. Staff calendar day/week view with appointment blocks, open gaps, drawer/sheet, check-in, no-show, reschedule, cancel.
7. Quick Book and walk-in booking for staff.
8. Waitlist signup and manual or semi-automated conversion flow.
9. Booking policies: instant, request approval, staff-only.
10. Two-tier settings resolution for booking rules.
11. SMS/email confirmations, reminders, reschedule/cancel messages, and waitlist messages.
12. Intake trigger, prep instructions, and core appointment context for staff.
13. Direct booking links and at least basic embeddable widget support.
14. Booking link/campaign tracking if time permits.

---

## 14. Blank Rows for New Ideas

Use this section to add your own calendar/booking/appointment ideas during product review.

| Area | Feature idea | Benefit | MVP / Later? | Notes |
|---|---|---|---|---|
| Calendar |  |  |  |  |
| Calendar |  |  |  |  |
| Booking |  |  |  |  |
| Booking |  |  |  |  |
| Appointments |  |  |  |  |
| Appointments |  |  |  |  |
| Waitlist |  |  |  |  |
| Notifications |  |  |  |  |
| Settings |  |  |  |  |

---

## 15. Source Documents Used

- `mindbody-rebuild-master-spec.md`
- `04-booking-flow.md`
- `05-booking-enhancements.md`
- `006-booking-design-refresh.md`
- `09-dev-handoff.md`
- `12-dashboard-buildout.md`
- `wellos-studio-start-plan.md`

