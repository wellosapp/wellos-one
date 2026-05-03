# Admin calendar — UI map (R2 buildout ↔ codebase)

This document fulfills the **calendar context synthesis** plan: it ties the product spec to shipped components. No separate HTML mock was provided; regions follow [wellos_calendar_booking_r2_uiux_buildout.md](../../../../../docs/04-booking%20UI%20UX%20Update/wellos_booking_r2_uiux_package/wellos_calendar_booking_r2_uiux_buildout.md) §5–§6 and schematic images in that package.

## Day view (R2 §5.1) ↔ components

| R2 / schematic region | Implementation | File(s) |
|----------------------|----------------|---------|
| Shell + page chrome | Server page wraps client view | `page.tsx` |
| Toolbar — period title, prev/next, Today, view toggle, Quick Book | **CalendarToolbar** | `CalendarToolbar.tsx`, composed in `CalendarDayView.tsx` |
| Staff column headers | Sticky header row | `CalendarGrid.tsx` |
| Time axis (labels + grid lines) | Left gutter + horizontal rules | `CalendarGrid.tsx` |
| Appointment blocks (status, client, service, times) | Positioned blocks | `CalendarEventBlock.tsx` |
| Open gaps → Quick Book | Gap links | `CalendarGrid.tsx` + `gapsBetweenAppointments` in `lib/calendar.ts` |
| “Next up” emphasis | Badge override on earliest future block | `CalendarGrid.tsx` + `selectNextUpAppointmentId` in `calendar-selection.ts` |
| Now line | Current time marker | `CalendarGrid.tsx` + `nowLinePx` in `lib/calendar.ts` |
| Past de-emphasis | Block opacity | `CalendarEventBlock.tsx` |
| Insights / day summary (spec “operational today”) | Card strip below grid | `AdminCalendarInsights.tsx` |

## Week / month (R2 §5.2) ↔ components

| Region | File |
|--------|------|
| Week grid | `CalendarWeekView.tsx` |
| Month grid | `CalendarMonthView.tsx` |
| View mode URLs | `CalendarViewToggle.tsx`, `buildCalendarUrl` in `lib/calendar-view.ts` |

## Appointment drawer (R2 §6) ↔ components

| Drawer area | File |
|-------------|------|
| Tab strip (URL `?tab=`) | `Tabs` in `AppointmentDrawer.tsx` |
| Tab panels | `tabs/*` under `app/admin/calendar/tabs/` |

## R2 §15.2 naming checklist (target vs actual)

| Checklist name | Status |
|----------------|--------|
| CalendarShell | **Page + layout** — `page.tsx` + `CalendarDayView` wrapper |
| CalendarToolbar | **CalendarToolbar** |
| StaffColumnHeader | **Inline** in `CalendarGrid` sticky row |
| TimeAxis | **Inline** in `CalendarGrid` gutter + rules |
| AppointmentBlock | **CalendarEventBlock** |
| OpenSlotBlock | **Gap links** in `CalendarGrid` |
| QuickBookSheet | **QuickBookPanel** (admin + staff variants) |

## Spec vs code (see plan)

- **API:** Spec mentions `/api/staff/calendar/day`; the app uses `listAppointments` with a day-bounded `from`/`to` window from `page.tsx`.
- **Week drag-reschedule, external busy:** Not in admin MVP slice.
- **Conflict API flag:** Not on `Appointment` type; UI cannot show conflict badges until the API adds a field or a dedicated calendar endpoint.

## Timezone

Operator **browser** local calendar day for filtering (`CalendarDayView` `visibleDayAppointments`). Per-tenant business TZ is a follow-up (see `lib/calendar.ts` header comment).
