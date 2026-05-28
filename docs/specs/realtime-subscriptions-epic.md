# Realtime Subscriptions Epic

> **Status:** Architecture spec for migrating Wellos to Supabase Realtime for live updates across booking, forms, appointments, dashboard counts, and the existing Geofence roster surface. Captures decisions made 2026-05-27. **Not yet implemented.** Build after the Forms epic settles (PRs #134-#145).

## Why this matters

Wellos currently uses two patterns for "live" data:

1. **Polling** / `router.refresh()` — admin pages re-fetch when actions complete. No live updates between sessions.
2. **In-process SSE bus** — Geofence PR 10 (#133) ships an SSE endpoint + Pino-style broadcast bus for the staff roster page. Single-process only (won't scale past one API instance). Query-string token auth (logged in pre-launch sweep).

Neither pattern surfaces realtime updates across browsers. A reviewer doesn't see new form submissions until they refresh. A staff member doesn't see a new appointment until they reload the calendar. A client doesn't see their appointment confirmation update without reloading the booking page.

Supabase Realtime — built on Postgres `LISTEN`/`NOTIFY` + WAL streaming — gives us a single, scalable, JWT-authenticated pub/sub for row-level changes. One pattern across the app. Solves the SSE query-string-token sweep item automatically.

## Decisions locked in (2026-05-27)

| Decision | Choice |
|---|---|
| RLS auth model | **Clerk JWT custom claims** — `tenant_id` (+ roles) in the JWT; RLS policies read via `current_setting('request.jwt.claim.tenant_id')` |
| Realtime scope | **All four use cases**: live calendar, live form queue, live client-side booking status, live admin dashboard counts |
| Geofence SSE migration | **Migrate to Realtime** — one consistent pattern, resolves the query-string-token sweep item |
| Timing | After Forms epic settles |

## Prerequisite work (NOT code — needs user action in dashboards)

1. **Clerk JWT template setup** — add custom claims to the JWT issued by Clerk:
   - `tenant_id` (from the user's primary tenant membership)
   - `roles` (array — `super_admin` / `admin` / `manager` / `staff`)
   - `staff_id` (when the Clerk user maps to a `Staff` row)
   - Confirm Clerk plan supports custom claims (Pro tier as of last check — verify before depending on it)
2. **Supabase environment**: enable realtime publication on the chosen tables (PR work, but Supabase dashboard verification helps).
3. **Confirm RLS policy strategy**: each subscribed table needs a tenant-scoped policy. Policies are SQL — write + review carefully.
4. **Cross-domain Clerk session story**: realtime client (apps/web) needs to send the Clerk JWT to Supabase. The existing `supabase-js` integration with Clerk is well-documented (https://clerk.com/docs/integrations/databases/supabase) — follow the standard path.

## What gets exposed to the Data API (realtime + REST)

Subscribed tables (tenant-scoped, RLS-on):
- `appointments` — live calendar
- `class_instances` — live class schedule
- `class_bookings` — live roster + waitlist updates
- `intake_form_submissions` — live form-review queue + client booking-status surface
- `clients` — for client-side "my profile" live updates if/when that surface ships
- Possibly: `class_waitlist_entries` — paired with `class_bookings` for full roster picture

**NOT subscribed** (stay Prisma-only, RLS-off):
- Internal admin tables (audit logs, magic-link tokens, scheduling internals)
- Tenant-config tables (services, staff, locations) — admins read these via Prisma; no real-time need
- Most everything else

Roughly: subscribed table count will be **6-8 tables**, RLS-on. Other **45+ tables** stay Prisma-only with no RLS (continuing the current app-layer tenant-scoping model).

## RLS policy pattern

Standard tenant-scoped read policy:

```sql
-- For every subscribed table:
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointments_select_by_tenant
  ON appointments
  FOR SELECT
  USING (
    tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::text
  );

-- Insert/update/delete via supabase-js still NOT allowed — those flow
-- through Prisma + service-role per the existing app-layer model.
-- No INSERT/UPDATE/DELETE policies needed for the realtime use case.
```

Service-role connections (Prisma) **bypass RLS entirely** — Prisma writes still work without any policy changes. RLS only gates `anon` / `authenticated` access, which is what `supabase-js` uses.

For client-side subscriptions (the "live client-side booking status" use case): clients aren't Clerk-authed in Wellos MVP. **Decision needed when we get there** — likely mint a Supabase-compatible JWT alongside the magic-link token (extend `magicLinkService`), OR use anon key + explicit per-client subscription filter (weaker security). Defer the decision; the other 3 use cases (admin-side) ship first.

## Epic PR plan — 7-8 PRs

| PR | Scope |
|---|---|
| **PR 1 — RLS foundation + JWT bridge** | Migration: enable RLS on the 6-8 subscribed tables. Write `current_tenant_id()` Postgres helper. Set up `supabase-js` client in apps/web with Clerk JWT auth. No subscriptions yet. |
| **PR 2 — GRANT + publication + RLS policies** | Migration adding `GRANT SELECT TO authenticated` + `ALTER PUBLICATION supabase_realtime ADD TABLE` + `CREATE POLICY` for each subscribed table. After this PR, tables are exposed but no UI subscribes yet. |
| **PR 3 — Live calendar (admin)** | `/admin/calendar` subscribes to `appointments` + `class_instances` + `class_bookings` in the visible date range. Replaces existing polling/refresh patterns. |
| **PR 4 — Live form review queue** | `/admin/forms/review-queue` subscribes to `intake_form_submissions` status changes. Reviewer sees new submissions appear without refresh. |
| **PR 5 — Migrate Geofence SSE roster → Realtime** | `/staff/classes/[instanceId]` swaps from SSE/`rosterBroadcast` to `class_bookings` subscription. Delete the SSE endpoint + broadcast bus + `requireMagicLinkAuthFromPath`-on-stream pattern + query-string token middleware. Resolves the sweep item. |
| **PR 6 — Live admin dashboard counts** | KPI strips on `/admin/overview` subscribe to aggregate-changing tables OR a Postgres function returning aggregates. Could fall back to lightweight polling if subscription cost is high — implementer judgment. |
| **PR 7 — Client-side booking status** | Magic-link-page client subscribes to their own appointments. Requires the magic-link-JWT bridge decision (see RLS section). Could ship later than PRs 1-6 if the auth bridge is non-trivial. |
| **PR 8 (cleanup)** | Remove now-orphaned code: SSE endpoint, broadcast bus, query-string-token-from-path middleware. Update `cloudflare_and_storage` / cross-domain auth memory if relevant. Pre-launch sweep entries closed: cookie-session migration, SSE auth, forms-token-in-URL (the realtime model uses JWT cookies, not URL tokens). |

**Order constraint**: PR 1 (RLS enabled) MUST land before PR 2 (table exposure). PR 2 MUST land before any UI subscription (PRs 3+). PRs 3-7 can ship in any order after PR 2.

**One-PR-at-a-time cadence** per the working memory.

## What we DON'T build

- **Postgres `pg_cron` for the realtime epic** — Realtime uses WAL streaming, not cron. The forms reminder cron (Forms PR 11) stays Pino-stubbed pending Epic 8.
- **`anon`-key read access to public tables** — only `authenticated` (Clerk-signed JWT) gets read grants. Anon access remains zero.
- **Client-side write via supabase-js** — all writes continue to go through Prisma + service-role on the API. Realtime is read-only from the browser. (Optimistic UI updates still happen in app state; the server reconciles.)
- **Realtime for tenant config tables** (Service, Staff, Location, etc.) — admins manage these via Prisma. No live cross-browser sync needed.

## Closes-out pre-launch sweep items

When this epic ships, the following sweep items can be closed:
- ✅ SSE auth uses query-string token (resolved by PR 5 migration)
- ✅ Forms magic-link tokens in URL (resolved IF PR 7 includes the cookie-session migration; flag if PR 7 ships separately)
- ✅ Supabase Data API exposure check (the diagnostic shows clean; this epic intentionally exposes ~6 tables with proper RLS)
- (Partial) cookie-session migration — PR 7 + PR 8 handle the realtime side; pure-HTTP API auth keeps its current Authorization-header model

## Estimated timeline

- **Prereqs (Clerk dashboard work + plan check)**: 30-60 min user-side
- **PR 1-2 (RLS + GRANT + JWT bridge)**: ~1 session
- **PR 3-6 (UI subscriptions)**: 1-2 sessions
- **PR 7 (client-side booking)**: 1 session (depends on magic-link-JWT bridge decision)
- **PR 8 (cleanup)**: 0.5 session

Total: ~4-5 working sessions if no surprises.

## Risk register

- **Clerk plan dependency** — if custom claims require a paid Clerk plan, that's a recurring cost. Verify before PR 1.
- **RLS policy bugs** — getting a tenant-scope wrong leaks one tenant's data to another. RLS policies need careful review + ideally a test suite (we have no DB-level test infrastructure today).
- **Realtime cost** — Supabase charges per concurrent realtime connection on paid plans. Multiplied across users + browser tabs, this adds up. Monitor after launch.
- **Reconnection storms** — if Realtime drops connections, every browser reconnects simultaneously. Supabase handles this but worth verifying under load.
- **Client-side auth gap** — magic-link clients need a separate JWT path. Could push PR 7 later if it gets complicated.

## Test plan template (for each epic PR)

- Two browsers open to the same page (e.g. `/admin/calendar`). Action in one → other updates within ~1s without reload.
- Verify cross-tenant isolation: log in as Tenant A, observe a Tenant B mutation never crosses over.
- Verify reconnect behavior: kill the realtime connection (devtools network throttle → offline → online) → reconnect within seconds.
- Audit log row written per realtime-triggered mutation (existing audit pattern unchanged — server-side writes still go through Prisma).

## Related architecture docs

- `docs/specs/geofence-check-in-epic.md` — Geofence PR 10's SSE roster (migrated by PR 5 of this epic)
- `docs/specs/forms-system-epic.md` (if exists) — Forms review queue (subscribed in PR 4)
- `docs/specs/classes-system-epic.md` — Class bookings (subscribed in PR 3)

## Open questions for the next session

1. **Clerk plan confirmation** — does our current Clerk plan support custom JWT claims? If not, do we upgrade or fall back to the "userId → tenant lookup" model?
2. **Client-side realtime auth bridge** — when we get to PR 7, do we mint a Supabase-compatible JWT alongside the magic-link token, or use a different model?
3. **Test infrastructure** — RLS policies are best tested with a real DB. Worth investing in a small DB-test harness as part of PR 1? Or accept manual testing for the first realtime PRs?

## Path confirmation (2026-05-27)

**Path A (Option 1 — Clerk JWT custom claims) is CONFIRMED viable on Wellos's current Clerk Hobby plan.** User verified that the JWT Templates feature is accessible in the dashboard. RLS policies will read `tenant_id` directly from the JWT via `current_setting('request.jwt.claim.tenant_id', true)`. The userId→tenant lookup fallback (Option 2) is no longer needed unless we discover an edge case during PR 1.

## Clerk JWT template authored (2026-05-27)

The JWT template is already saved in Clerk:

- **Name**: `supabase`
- **Template preset**: Supabase
- **Token lifetime**: 60s
- **Allowed clock skew**: 5s
- **Issuer**: `https://glowing-python-30.clerk.accounts.dev` (Wellos's Clerk dev instance — switches to live-keys domain when we flip per pre-launch sweep)
- **JWKS Endpoint**: `https://glowing-python-30.clerk.accounts.dev/.well-known/jwks.json`
- **Custom signing key**: **DISABLED** (uses Clerk's default RS256 key; we're on Supabase's newer Third-Party Auth path, not the legacy HS256 shared-secret model)
- **Signing algorithm**: HS256 in the form, but unused because Custom signing key is off — actual signing happens with RS256 via Clerk's default key
- **Claims** (final):
  ```json
  {
      "app_metadata": {},
      "aud": "authenticated",
      "email": "{{user.primary_email_address}}",
      "role": "authenticated",
      "user_metadata": {},
      "tenant_id": "{{user.public_metadata.tenant_id}}",
      "roles": "{{user.public_metadata.roles}}",
      "staff_id": "{{user.public_metadata.staff_id}}"
  }
  ```

**Signing approach**: Third-Party Auth via JWKS. PR 1 will configure Supabase Dashboard → Authentication → Third-Party Auth to trust Clerk's JWKS endpoint. No shared secret to rotate.

**Open verification at PR 1 start**: confirm Wellos's Clerk webhook (in `apps/api/src/routes/...` somewhere) actually populates `tenant_id`, `roles`, `staff_id` into the user's `public_metadata`. If missing, extend the webhook (~20-line patch) before any subscription works.

## Next-session kickoff checklist

When we come back to build this:

- [x] ~~Clerk JWT Templates support check~~ — **confirmed available on Hobby tier (2026-05-27)**
- [ ] **Clerk MAU check**: 10k MAU is the Hobby ceiling. Confirm Wellos's projected MAU stays under that for the foreseeable future, OR plan to upgrade alongside the launch-hardening Clerk dev-keys → live-keys flip (see pre-launch sweep 2026-04-27 entry).
- [ ] Open Supabase Dashboard → Database → Replication → confirm `supabase_realtime` publication exists (it does by default)
- [ ] Re-run the diagnostic from 2026-05-27 to confirm DB state is still clean (no surprise exposure)
- [ ] Decide whether to pause Forms epic improvements + close pre-launch sweep items as part of this epic, or run them in parallel
- [ ] Author the Clerk JWT template content for the Supabase integration — typically a JSON template that maps `tenant_id` (from the user's primary tenant membership), `roles` (array), and `staff_id` (when applicable) into the JWT. The Clerk-Supabase integration docs have a reference shape we'll adapt.

## Clerk JWT template content (to be authored in PR 1)

When PR 1 lands, the Clerk JWT template will look roughly like:

```json
{
  "aud": "authenticated",
  "role": "authenticated",
  "tenant_id": "{{user.public_metadata.tenant_id}}",
  "roles": "{{user.public_metadata.roles}}",
  "staff_id": "{{user.public_metadata.staff_id}}"
}
```

This requires that `tenant_id`, `roles`, and `staff_id` are populated in each user's `public_metadata` — wired by the Clerk webhook that already runs on user signup (per `cloudflare_and_storage` + the existing Clerk integration in apps/api). PR 1 will verify the webhook populates these fields and add any missing wiring.
