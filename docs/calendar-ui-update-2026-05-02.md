# Calendar UI — implementation update

**Document created:** 2026-05-02 at **11:58:32** (local: **-07:00**, Pacific)

This note captures what was implemented for the Wellos **admin**, **staff**, and **client** calendar/booking surfaces, plus the API validation fix for week/month views.

---

## Summary

- **Three view modes** — **Month**, **Week**, and **Day** — are available on all three surfaces (toggle order in the UI: Month → Week → Day).
- **URL-driven state** — `?date=YYYY-MM-DD` and `?view=week|month` (day is default when `view` is omitted). Admin/staff also support existing params (`selected`, `tab`, `quickbook`).
- **Shared helpers** — `apps/web/lib/calendar-view.ts` centralizes view parsing, date-range bounds for appointment fetches, navigation shifts, month grid cells, week columns (ISO week starts Monday), and `buildCalendarUrl`.
- **Bug fixes** — Staff schedule `serviceById` map used `m.set(id, m)` instead of `m.set(id, service)` (corrected). List appointments API rejected `take > 200` while the web app requested 350/500 for week/month (schema updated).

---

## Shared library (`apps/web/lib/calendar-view.ts`)

| Concern | Behavior |
|--------|----------|
| `CalendarViewMode` | `'day' \| 'week' \| 'month'` |
| `parseViewParam` | Defaults to `day` unless `week` or `month` |
| `appointmentFetchBounds` | Day: padded single-day window; Week: Mon–Sun week containing anchor; Month: full calendar month — each with ±14h / +38h padding for TZ edge cases |
| `appointmentFetchTake` | Day `200`, Week `350`, Month `500` |
| `shiftAnchorDate` | Prev/next for day, week (+7 days), or month |
| `monthGridCells` | 6×7 grid from Monday-start week containing month start |
| `weekDayDates` | Seven local dates for the ISO week |
| `buildCalendarUrl` | Stable query builder for calendar links |

Related geometry/helpers live in `apps/web/lib/calendar.ts` (e.g. gaps between appointments for the day grid).

---

## Admin (`/admin/calendar`)

- Server page reads **`view`** from `searchParams`, computes **`from` / `to` / `take`** via `appointmentFetchBounds` + `appointmentFetchTake`, and passes data plus **`view`** into **`CalendarDayView`**.
- **`CalendarViewToggle`** uses `buildCalendarUrl`; tabs: **Month**, **Week**, **Day**.
- **`CalendarDayView`** switches body: day → time **`CalendarGrid`**; week → **`CalendarWeekView`**; month → **`CalendarMonthView`**. Insights use day-filtered vs range appointments by mode.
- **`AppointmentDrawer`** / Quick Book URLs preserve **`view`** and **`quickbook`** where applicable.

Primary files: `apps/web/app/admin/calendar/page.tsx`, `CalendarDayView.tsx`, `CalendarGrid.tsx`, `CalendarWeekView.tsx`, `CalendarMonthView.tsx`, `CalendarViewToggle.tsx`, `QuickBookPanel.tsx`, `AppointmentDrawer.tsx`.

---

## Staff (`/staff/schedule`)

- Same **`view`** + fetch-window wiring as admin on `apps/web/app/staff/schedule/page.tsx`.
- **`StaffScheduleView`** mirrors admin navigation and week/month/day surfaces; appointments are filtered to the signed-in staff member after fetch.
- **`StaffScheduleInsights`** pairs with the schedule header.

---

## Client booking shell (`/book`)

- **`page.tsx`** is an async server component: parses **`date`** and **`view`**, passes them to **`BookPageBody`**.
- **`BookPageBody`** adds the scheduling header (period nav + **`CalendarViewToggle`** with `surface="book"`). **Month** / **week** show **`CalendarMonthView`** / **`CalendarWeekView`** (placeholder empty data until public APIs exist). **Day** shows the full self-service booking mock (service cards, time slots, confirm aside).

Files: `apps/web/app/book/page.tsx`, `BookPageBody.tsx`.

---

## API fix (week/month “Validation failed.”)

**Cause:** `GET /admin/appointments` query validation (`ListAppointmentsQuerySchema`) capped **`take`** at **200**. Week/month calendar pages sent **350** / **500**, so Zod returned **400** with message **“Validation failed.”**

**Change:** In `apps/api/src/schemas/appointment.ts`, **`take`** maximum increased from **200** to **500** so it matches `appointmentFetchTake()` and busy ranges can load.

---

## Query params reference

| Param | Admin / Staff | Client `/book` |
|-------|----------------|------------------|
| `date` | Anchor day (`YYYY-MM-DD`) | Same |
| `view` | `day` (default), `week`, `month` | Same |
| `selected` | Appointment id (drawer) | Reserved for future |
| `tab` | Drawer tab | — |
| `quickbook` | `1` when Quick Book open | — |

---

## Follow-ups (not in scope of this doc)

- Wire client `/book` week/month to real availability/appointments when public endpoints exist.
- If a tenant routinely exceeds **500** appointments in a month window, add pagination or a aggregated calendar endpoint.
