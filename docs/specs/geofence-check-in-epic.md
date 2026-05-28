# Geofence Auto Check-in Epic

> **Status:** Architecture spec for the auto check-in feature using PWA + geolocation. Depends on the Classes System Epic (`docs/specs/classes-system-epic.md`) being completed first. Optional layer on top — classes work without this; this just removes friction.

## Why this matters

After the Classes System epic ships, studios can run classes through Wellos. But staff still have to manually check each client in when they arrive. That's the same workflow Mindbody and Vagaro offer.

This epic builds a feature no major wellness SaaS does well: when a client with the Wellos PWA installed arrives at the studio for a class they booked, their phone detects the location and automatically checks them in. Instructor's roster updates in real time. Client gets a notification: "Checked in — enjoy class!"

This is the single most marketable differentiator we can build. "Drop in, get checked in." No app to open, no QR code to scan, no front-desk friction.

## Two-phase build

| Phase | Scope | Duration |
|---|---|---|
| 1 | PWA foundation (install + permissions) | 1 week |
| 2 | Geofence detection + auto check-in | 2 weeks |

Total: ~3 weeks of focused work after Classes epic ships.

## Critical platform reality — iOS vs Android

PWA geolocation works differently on the two major mobile platforms. This shapes the entire UX:

**Android:**
- PWA can request location permission and access GPS while the app is open (foreground)
- Background geolocation IS possible with limitations
- Truly automatic check-in works as designed

**iOS (Safari PWA):**
- PWA can access GPS only when the app is open (foreground)
- NO background geolocation in PWAs
- Truly automatic check-in does NOT work
- Workaround: push notification 15 min before class → user taps notification → app opens → foreground geofence check fires → auto check-in

The iOS workaround is still better than fully manual check-in (one tap vs walking up to the front desk). But it's not magic-tier. Set expectations accordingly with users.

---

# Phase 1 — PWA Foundation

## PWA manifest

Create `/apps/web/public/manifest.json`:

```json
{
  "name": "Wellos",
  "short_name": "Wellos",
  "description": "Your wellness studio in your pocket",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FAF7F2",
  "theme_color": "#3D7A5E",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Theme color should ideally pull from `tenant.brandColors.primary` once that schema ships. Until then, use Wellos sage as default.

## Service worker

Create `/apps/web/public/sw.js` with:
- Cache-first strategy for static assets (logo, CSS, JS bundle)
- Network-first for API calls (always get fresh data)
- Offline fallback page for navigation requests
- Push notification handler (for class reminders + check-in confirmations)

Service worker registration in the app shell, behind a feature flag for initial rollout.

## Install prompts

Two surfaces drive PWA installs:

**1. After first class booking:**
On the booking confirmation page, add a banner below the receipt:
"Install Wellos on your phone to get class reminders and auto check-in at the studio. [Install] [Maybe later]"

Click Install → fires `beforeinstallprompt` event on Android. On iOS, opens a modal with "Add to Home Screen" instructions + screenshots.

**2. After existing client returns:**
On any client-facing page after a returning client signs in, show a one-time prompt: "Install Wellos for the best experience." Dismissible. Don't nag — show once, remember dismissal.

## Permission flow

After install:
- Notification permission requested immediately (for class reminders)
- Location permission deferred — request only at the first relevant moment (first time a client opens the app within the check-in window of an upcoming class)

This is intentional. Asking for location on install feels invasive. Asking for location when "you're booked for Vinyasa Flow in 15 minutes" feels useful and gets granted.

## iOS-specific install flow

iOS Safari doesn't support `beforeinstallprompt`. Detect iOS Safari and show a modal:

> **Add Wellos to your home screen**
>
> 1. Tap the share button in Safari (square with arrow)
> 2. Scroll down and tap "Add to Home Screen"
> 3. Tap "Add"
>
> [Screenshot showing each step]

Make this modal genuinely helpful — most iOS users don't know "Add to Home Screen" exists.

## Lighthouse PWA score

Target: 90+ on Lighthouse PWA audit. Specifically verify:
- Manifest is valid and includes required fields
- Icons exist at required sizes
- Service worker registers and controls the page
- Page is served over HTTPS (production already is)
- Page is responsive and mobile-friendly
- Provides a custom splash screen

## Permissions tracking

Add a settings page in the client-facing app: `/me/permissions` (or wherever the client profile lives in the PWA).

Shows current permission status:
- Notifications: Granted / Denied / Default
- Location: Granted / Denied / Default
- Camera (future): for QR-code-based check-in fallback

Each row has an "Enable" button that triggers the permission flow if not granted, or "Open settings" link if denied (with OS-specific instructions).

## Out of scope for Phase 1

- Geofence detection logic (Phase 2)
- Push notification campaigns / marketing pushes (Marketing epic)
- Offline booking (Phase 1 only supports offline shell, not offline writes)
- Native iOS/Android apps via Capacitor or React Native (future major undertaking — only if PWA limitations become deal-breakers)

---

# Phase 2 — Geofence Auto Check-in

## Tenant-side setup

New admin route: `/admin/locations/[id]/geofence`

For each studio location:
- Geofence center: pick from interactive map OR paste lat/lng OR use "Use current location" button (admin's current location)
- Geofence radius: slider 25m to 200m, default 50m
  - 25m: tight, just the studio interior
  - 50m: studio + immediate parking
  - 100m: small strip mall scope
  - 200m: large complex scope
- Check-in window before class start: slider 0 to 60 min, default 15 min
- Check-in window after class start: slider 0 to 30 min, default 5 min (late but allowed)
- Enabled toggle (per location — some locations might not have geofence)

## New schema — LocationGeofence

```
location_geofence

id (UUID)
tenant_id
location_id (FK to existing Location, unique — one geofence per location)
center_lat (decimal, 8 places)
center_lng (decimal, 8 places)
radius_meters (integer, 25-200)
check_in_window_before_minutes (integer, 0-60)
check_in_window_after_minutes (integer, 0-30)
enabled (boolean)
created_at, updated_at
```

## Client-side detection logic (PWA)

Inside the PWA, on app open:

1. **Check eligibility:** Query the API: "Does this signed-in client have any confirmed class booking starting within the next 30 minutes at a geofence-enabled location?"
2. **If yes:** Proceed to geofence flow. If no: do nothing.
3. **Request location permission** if not already granted. Show explanation modal first: "Wellos uses your location only to check you in when you arrive at the studio. We don't track you otherwise."
4. **Poll geolocation** every 30 seconds while the app is open
5. **When client is within geofence radius AND within check-in window:** Fire check-in event to server

Use `navigator.geolocation.watchPosition()` with `enableHighAccuracy: true` and `maximumAge: 30000` (30s).

Stop polling immediately after check-in fires or after the check-in window closes.

## Server-side validation

Endpoint: `POST /api/class-bookings/[id]/geofence-check-in`

Request body:

```json
{
  "lat": 33.6679,
  "lng": -117.2724,
  "accuracy_meters": 15,
  "timestamp": "2026-01-15T09:02:14Z"
}
```

Validations (in order, fail fast):
1. Booking exists and belongs to the authenticated Clerk user
2. Booking state is `confirmed` (not cancelled, not already checked in, not no-show)
3. ClassInstance is in `in_progress` state OR within the check-in window relative to `scheduled_start_at`
4. Client-reported lat/lng is within geofence radius (calculate distance server-side using haversine formula — DO NOT trust client-side "I'm at the studio" claim)
5. GPS accuracy is reasonable (`accuracy_meters < 100` — reject low-accuracy readings)
6. Anti-spoof: check that this client hasn't checked in at a different geographic location within the last 30 minutes (e.g. checked in at studio A then tried to check in at studio B 15 minutes later is impossible)
7. Rate limit: max 3 check-in attempts per booking, per 10 minute window

If all validations pass:
- Update `class_booking.state = checked_in`
- Set `check_in_method = geofence`
- Set `checked_in_at = now()`
- Leave `checked_in_by_staff_id` null (no staff initiated)
- Trigger real-time update to `/staff/classes/[instanceId]` roster view (or polling fallback)
- Send client confirmation push notification: "Checked in for Vinyasa Flow — enjoy!"

If validations fail, return specific error codes:
- `OUT_OF_RANGE`: too far from studio
- `OUT_OF_WINDOW`: too early or too late
- `LOW_ACCURACY`: GPS reading isn't accurate enough
- `SUSPICIOUS_PATTERN`: anti-fraud triggered
- `RATE_LIMITED`: too many attempts

Client-side: silently retry on `OUT_OF_RANGE` (they're walking in) and `LOW_ACCURACY` (waiting for better signal). Show explicit error on other codes.

## iOS workaround flow

Since iOS PWAs can't do background geolocation:

1. **15 minutes before class:** Server sends a push notification: "Your Vinyasa Flow class starts soon. Tap to check in when you arrive."
2. **Client taps notification:** PWA opens (or focuses if already open)
3. **PWA detects context:** "Client has a class starting in 15 min, location permission granted, check-in window open"
4. **Foreground geofence check:** Polls geolocation. If within range, fires check-in. If not within range, shows: "We don't see you at the studio yet. We'll check again in a moment." Polls every 10 seconds for up to 5 minutes.
5. **If still not within range after 5 min:** Falls back to manual check-in screen with a big "I'm here — check me in" button (server-side validation still applies)

Set client expectations clearly in iOS install messaging: "On iPhone, tap the class reminder when you arrive to check in. Android phones check in automatically."

## Fraud prevention

Geolocation can be spoofed (developer tools, GPS spoofing apps). Mitigations:

1. **Server-side validation always** — never trust client-reported location alone
2. **Distance calculation server-side** using haversine formula on submitted lat/lng vs geofence center
3. **Rate limiting** — max 3 check-in attempts per booking per 10 min
4. **Anti-spoof patterns:**
   - Client checked in at location A 10 min ago, now claims to be at location B 50 miles away — flag for review
   - GPS reading is suspiciously precise (e.g. exactly the geofence center to 8 decimal places) — likely spoofed
   - Same device fingerprint checking in for multiple clients within minutes — flag
5. **Audit log** — every check-in attempt logged with full payload, success/failure, IP, user agent
6. **Staff override** — staff can mark a geofence check-in as fraudulent and switch to manual, which reverses the state and flags the booking

For Phase 2 MVP, fraud flags don't block check-in — they just log for review. Future enhancement: thresholds that require staff approval.

## Battery + privacy UX

Background geolocation drains battery and creates privacy concerns. Best practices baked into the design:

- Only poll when a booking is imminent — don't track continuously
- Stop polling immediately after check-in or window close
- Clear in-app messaging: "We only check your location 15 minutes before class starts"
- Privacy policy update required — legal counsel review before launch in California
- Settings page lets clients revoke location permission at any time
- Tenant-side admin can disable geofence per-location if desired (already in schema)

## Real-time roster updates

When a geofence check-in fires, the instructor's roster view at `/staff/classes/[instanceId]` should update without manual refresh.

Implementation options (decide in plan mode):
- **Option A — Polling:** Roster page polls every 10 seconds for updates. Simple, no infrastructure. Slightly delayed (up to 10s lag).
- **Option B — Server-Sent Events (SSE):** Server pushes updates to the roster page. Better UX, simple to implement, works fine for one-way updates.
- **Option C — WebSockets:** Full real-time. Overkill for this use case unless you're already planning a real-time epic.

Recommend Option B (SSE) for Phase 2 — best balance of UX and complexity.

## Schema additions to ClassBooking

ClassBooking already has the fields needed from the Classes epic spec:
- `check_in_method` (enum: manual | geofence | manual_override)
- `checked_in_at`
- `checked_in_by_staff_id` (null when geofence)

Add for Phase 2:
- `check_in_lat` (decimal, nullable — recorded GPS location at check-in for audit)
- `check_in_lng` (decimal, nullable)
- `check_in_accuracy_meters` (integer, nullable)
- `check_in_attempts` (integer, default 0 — counts attempts for rate limiting)

## Audit log

New table for fraud review and debugging:

```
class_check_in_attempt

id (UUID)
tenant_id
class_booking_id (FK)
client_id (FK)
attempted_at (timestamp)
method (enum: geofence | manual)
result (enum: success | out_of_range | out_of_window | low_accuracy | suspicious_pattern | rate_limited | error)
submitted_lat (decimal nullable)
submitted_lng (decimal nullable)
submitted_accuracy_meters (integer nullable)
distance_from_geofence_meters (decimal nullable — calculated)
user_agent (text)
ip_address (text)
created_at
```

Stored for 90 days then purged (or longer per tenant's retention policy).

## Out of scope for Phase 2

- Native iOS/Android apps (PWA only)
- Indoor positioning via Bluetooth beacons or WiFi triangulation (future)
- Geofence-based marketing notifications ("you're near our studio — book a drop-in?") (future, sensitive)
- QR code fallback for check-in (future enhancement, useful when GPS is unreliable indoors)
- NFC tap-in at the front desk (future)
- Multi-location geofence overlap handling (e.g. two studios in the same strip mall) — for Phase 2, assume distinct geofences; future enhancement for overlap detection

---

# Cross-cutting concerns

## Privacy + legal

Geofence + location data triggers privacy law requirements:

- **Privacy policy** update required — must disclose what data is collected, how, when, and retention period
- **California-specific** — CCPA compliance for location data (you're in California, so this applies to your tenant base as well)
- **Tenant-specific privacy policies** — each tenant should have their own privacy policy linked from the client-facing booking flow
- **Right to deletion** — clients can request all location data be deleted; system must support this

Legal counsel review before launch. Don't ship Phase 2 without it.

## Battery impact testing

Test on real devices before launch:
- Android: Pixel 7 (modern reference) + older Samsung mid-range (worst case)
- iOS: iPhone 15 + iPhone 12 (older but supported)
- Measure battery drain over 1 hour of polling
- Adjust polling interval if drain is excessive

Target: less than 2% battery for the entire check-in flow (15 min of foreground polling).

## Accessibility

- Screen reader support for permission prompts
- High-contrast mode for check-in status indicators
- Alternative to geofence for clients who can't or won't share location: manual self check-in button always available in app

---

# Related architecture docs

- `docs/specs/classes-system-epic.md` — Prerequisite — must ship first
- `docs/specs/notes-system-architecture.md` — Notes attached to class bookings
- `docs/specs/files-domain-v1-epic.md` — Photos attached to class bookings

---

# Decision points

**Before Phase 1:**
- PWA icon design: need actual icon assets (192px, 512px, maskable) — design work, not code
- Service worker caching strategy: cache-first for static, network-first for API. Confirm with first real test.
- Feature flag for PWA rollout: tenant-by-tenant opt-in, or global? Recommend tenant opt-in initially.

**Before Phase 2:**
- Real-time approach for roster updates: SSE (recommended) vs polling vs WebSockets
- Polling interval: 30s default. Validate battery impact before launch.
- Fraud thresholds: too aggressive blocks legitimate users; too loose enables abuse. Start permissive, tighten based on real data.
- Native app threshold: if iOS PWA limitations cause real user pain, when do we pull the trigger on a native app? Recommend: revisit if >20% of bookings use iOS AND iOS check-in success rate is <70%.

---

# Estimated total timeline

- Phase 1: 1 week
- Phase 2: 2 weeks

Total: ~3 weeks of focused work after Classes epic ships. Critical path includes legal counsel review for privacy policy before launch.

# Differentiator value

After this epic ships, Wellos has a feature no major competitor offers. The marketing line writes itself: "Drop in. Get checked in." Or: "Your phone knows you're here." The geofence auto check-in moves Wellos from "yet another booking platform" to "the platform that gets it right."
