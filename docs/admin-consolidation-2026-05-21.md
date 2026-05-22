# Admin codebase consolidation audit — 2026-05-21

**Branch:** `chore/admin-consolidation-audit` (off `main`)
**Status:** Audit deliverable. No code changes, no merges, no deletions in this PR.

## TL;DR

- **Three live admin redesign PRs** (`#84` shell · `#85` overview stacked on `#84` · `#87` calendar off `main`). All three should land. They build the same warm-cream + sage admin UI, but their branch topology requires a specific merge order.
- **Three local-but-not-pushed branches** named the same as the live PRs (`feature/admin-calendar-redesign`, `feature/admin-overview-page`, `feature/admin-shell-redesign` exist remotely AND there are extra local-only branches like `feature/admin-calendar-redesign` from the abandoned PR #86). These are leftover worktree-state; safe to delete after confirmation.
- **No V1/V2 parallel implementations** on a single route. Every URL on `app.wellos.one/admin/*` resolves to ONE component tree. The "parallel files" concern raised in the ticket — `CalendarRiverGrid.tsx` alongside `CalendarGrid.tsx` etc. — is **route-scoped parallel**, not within-route parallel: admin's day view uses River*, staff's day view uses the old grid. The two routes need different layouts. The cleanup is **file relocation**, not deduplication.
- **Recommended merge sequence:** `#84` → `#85` (already rebases automatically since it stacks on `#84`) → `#87` rebased onto `main`. After all three land, a small cleanup PR moves the staff-shared calendar components to `apps/web/app/staff/schedule/` so each route's file ownership is unambiguous.

---

## 1. Branch inventory

### 1A. Open PRs that touch `apps/web/app/admin/*`

| Branch | PR | State | Last commit | Files modified in `apps/web/app/admin/*` (+ shell/tokens) | Recommendation |
|---|---|---|---|---|---|
| `feature/admin-shell-redesign` | [#84](https://github.com/wellosapp/wellos-one/pull/84) | OPEN | `a7c3681` · 2026-05-21 15:02 | `apps/web/app/admin/_shell/*` (NEW 6 files) · `apps/web/app/admin/layout.tsx` (modify) · `apps/web/app/globals.css` (token swap) · `apps/web/app/layout.tsx` (font swap) · `apps/web/tailwind.config.ts` (extend) | **Merge first.** Brings the global token swap (Instrument Serif + Manrope + warm cream + extended sage tokens) the other two PRs depend on. |
| `feature/admin-overview-page` | [#85](https://github.com/wellosapp/wellos-one/pull/85) | OPEN | `eb98707` · 2026-05-21 15:54 | All of #84 + `apps/web/app/admin/_overview/*` (NEW 11 files) + `apps/web/app/admin/page.tsx` (rewrite) + `apps/web/app/admin/resources/page.tsx` (NEW — old page moved here) | **Merge second.** Stacks on `#84` (`gh pr view 85` shows base = `feature/admin-shell-redesign`). After `#84` lands, GitHub auto-retargets `#85` to `main` and the diff trims to just `_overview/*` + `page.tsx` + `resources/page.tsx`. |
| `feature/calendar-redesign` | [#87](https://github.com/wellosapp/wellos-one/pull/87) | OPEN | `2fb6d35` · 2026-05-21 17:31 | `apps/web/app/admin/calendar/*` only — 10 NEW files (`CalendarRiverGrid.tsx`, `CalendarRiverChip.tsx`, `CalendarRiverStaffBlock.tsx`, `CalendarDensityWave.tsx`, `CalendarNowMarker.tsx`, `CalendarLeftRail.tsx`, `CalendarStaffLoadStrip.tsx`, `CalendarFilterPills.tsx`, `CalendarRiverSessionDetail.tsx`, `CalendarInsightsPanel.tsx`) + 4 modified (`CalendarDayView.tsx`, `CalendarToolbar.tsx`, `page.tsx`, `AdminCalendarInsights.tsx`) | **Merge third.** Branched off `main`, NOT stacked on `#84`/`#85`. Has 3 `TODO(shell-pr)` comments for hex values that should swap to expanded tokens once shell lands. After `#84` + `#85` merge, **rebase `#87` onto `main`** to inherit the warm-cream palette; then replace the 3 arbitrary hex values with proper tokens (a one-commit follow-up on the branch); then merge. |

### 1B. Other open PRs (not on admin path — keep)

| Branch | PR | Status | Why it stays |
|---|---|---|---|
| `feat/marketing-landing-page` | `#83` OPEN | Apex marketing landing, awaiting DNS work | Keep — separate scope from admin |
| `chore/epic-8-notifications-wip-isolate` | `#74` DRAFT | Epic 8 notifications WIP holding pen | Keep — DRAFT marker indicates "do not merge until Epic 8 starts" |
| `pr/docs-specs-parity` | `#63` OPEN | Pure docs (spec parity sweep) | Keep — separate scope |

### 1C. Local-only branches (no `origin/` counterpart)

These exist locally but were never pushed; some have associated git worktrees (the `+` prefix in `git branch` output). Most are stale work from previous session resets or one-off worktrees that were never cleaned.

| Branch | Has worktree? | Recommendation |
|---|---|---|
| `backup/pre-split-20260503092911` | No | **DELETE** — historical pre-split backup; main has long since superseded it |
| `feat/api-appointment-media-list-e3-s6` | No | **DELETE** — old E3 ticket, content long merged via successor PRs |
| `feat/api-staff-booking-onboarding-schedule` | No | **DELETE** — same |
| `feat/booking-policies` · `feat/booking-settings` · `feat/booking-slot-holds` · `feat/booking-waitlist` | Yes (worktrees) | **DELETE worktree + branch** — PRs #77-#81 merged 5/20/26. Local worktrees are leftover; nothing in them. |
| `feature/admin-calendar-redesign` | Yes (worktree) | **DELETE worktree + branch** — backed PR #86 which I closed earlier. Superseded by `feature/calendar-redesign` (PR #87). |
| `feat/marketing-landing-page` | Yes (worktree) | Linked to OPEN PR #83 — **keep** until DNS work lands. |
| `feature/payments-phase3` | Yes (worktree) | Not tied to any open PR. **CONFIRM with user** — looks abandoned but the name suggests intentional WIP. |
| `feat/web-admin-note-composer-e3-s5-t10` · `feat/web-appointments-ui` · `feat/web-calendar-crm-client-ui` · `feat/web-calendar-week-month-views` · `feat/web-client-profile-revamp-e3-s7` | Mix | **DELETE** all — E3 tickets long merged. |
| `feature/intake-forms-phase2` | No | **DELETE** — content merged via PR #67. |
| `feature/public-booking-mvp-phase1` | No | **DELETE** — content merged via PR #67. |
| `prisma/catalog-schedule-notes` | No | **DELETE** — prior catalog work merged. |
| `pr/docs-specs-parity` | No | Linked to OPEN PR #63 — **keep**. |
| `worktree-agent-a*` (8 of them) | All worktrees | **DELETE worktree + branch each** — all leftover from prior subagent sessions; no live PRs. |

> **None of these local-only branches need to merge to main.** They're cleanup-only work, separate from the consolidation goal.

---

## 2. Duplicate / parallel files

### 2A. The "parallel" files raised in the ticket — they're route-scoped, not within-route

After `#87` merges, the admin calendar directory contains both the **old** vertical-columns components and the **new** horizontal-river components. Both stay because they serve different routes:

| Concept | Admin (`/admin/calendar`) | Staff (`/staff/schedule`) | After-#87 status |
|---|---|---|---|
| Day-view grid | `CalendarRiverGrid.tsx` (new) | `CalendarGrid.tsx` (existing) | **Both kept.** Admin's `CalendarDayView.tsx` now imports `CalendarRiverGrid`. Staff's `StaffScheduleView.tsx` still imports `CalendarGrid`. |
| Appointment chip | `CalendarRiverChip.tsx` (new) | `CalendarEventBlock.tsx` (existing, imported only via `CalendarGrid.tsx`) | **Both kept.** Admin's day view uses River chip; staff's day view uses Event block. |
| Schedule block chip | `CalendarRiverStaffBlock.tsx` (new) | `CalendarStaffBlock.tsx` (existing, imported via `CalendarGrid.tsx` + admin `page.tsx`'s drawer pieces) | **Both kept.** Same split. |

**This is not V1/V2 of the SAME route's component.** Per the new ONE-PATH policy:

> Every URL on the production site corresponds to exactly ONE component tree in the repo.

That holds: `/admin/calendar` has ONE day-view tree (River*). `/staff/schedule` has ONE day-view tree (Grid+Event+StaffBlock). Two routes legitimately render different layouts. The components share a directory (`apps/web/app/admin/calendar/`) only because they were historically co-located.

**The actual hygiene issue is file location:** components consumed exclusively by `/staff/schedule` shouldn't live under `apps/web/app/admin/calendar/`. The cleanup PR (§4 below) relocates them.

Verified import topology after `#87` merges (from `git show feature/calendar-redesign:apps/web/app/admin/calendar/CalendarDayView.tsx`):

- **Admin day view** → `CalendarRiverGrid` → `CalendarRiverChip` + `CalendarRiverStaffBlock`
- **Admin week view** → `CalendarWeekView` (renders appointments inline — does NOT import `CalendarEventBlock`)
- **Admin month view** → `CalendarMonthView` (same — does NOT import `CalendarEventBlock`)
- **Admin drawer/panels** → `AppointmentDrawer`, `QuickBookPanel`, `BlockTimeSheet` (unchanged)
- **Staff day view** → `CalendarGrid` → `CalendarEventBlock` + `CalendarStaffBlock`

Grep confirms (`grep -rln "from.*CalendarEventBlock" apps/web`): on `main`, **only `CalendarGrid.tsx`** imports `CalendarEventBlock`. After `#87` merges, `CalendarGrid.tsx` itself is only imported by staff. So `CalendarEventBlock` + `CalendarStaffBlock` + `CalendarGrid` are effectively staff-exclusive — they just happen to sit under `apps/web/app/admin/calendar/`.

### 2B. Other duplicate-file candidates checked

Greppped across the repo for naming patterns commonly used for V2 variants (`*New.tsx`, `*V2.tsx`, `*Next.tsx`, `*Old.tsx`, `*Legacy.tsx`, `*Experimental.tsx`) — **no matches** under `apps/web/app/admin/`. No other parallel implementations exist.

### 2C. Token-related "duplicate" (transient)

`feature/calendar-redesign` carries 3 `TODO(shell-pr)` comments where arbitrary `bg-[#…]` hex values are used for warm/plum/sky service-color variants. These are placeholders for tokens that LAND in the shell PR `#84`'s expanded palette. **Not a duplicate file; transient state.** Resolved by the rebase + token swap step in §4 below.

---

## 3. Unreachable files

Computed by walking the admin route's import graph from `apps/web/app/admin/layout.tsx` + every `apps/web/app/admin/**/page.tsx` and recursively resolving local imports.

**On `main`:** no unreachable files in `apps/web/app/admin/`. Every component is imported by at least one page or layout.

**On `#84` merged + `#85` merged + `#87` merged (projected post-merge state):** no unreachable files within `apps/web/app/admin/`, with the caveat that `CalendarGrid.tsx`, `CalendarEventBlock.tsx`, `CalendarStaffBlock.tsx` are only reachable through `/staff/schedule` — they remain reachable from a production route, just from a non-admin one.

**No dead code identified.** The "parallel" files all have at least one production consumer.

---

## 4. Recommended merge sequence

### Phase A — land the three live admin redesign PRs

1. **PR #84** (`feature/admin-shell-redesign`) — squash-merge into `main`.
   - Why first: brings the global token swap (`globals.css`, Tailwind config, `layout.tsx` fonts) the other two PRs reference.
   - Verify after merge: `app.wellos.one/admin` loads with new chrome (rail + topbar + warm-cream palette).

2. **PR #85** (`feature/admin-overview-page`) — auto-retargets to `main` after #84 merges; squash-merge.
   - Why second: stacks on #84. GitHub will auto-rebase when the base merges. Trim diff = `_overview/*` widgets + `page.tsx` rewrite + `/admin/resources/page.tsx` move only.
   - Verify after merge: `app.wellos.one/admin` shows the new operational dashboard; `app.wellos.one/admin/resources` shows the legacy 3-card index.

3. **PR #87** (`feature/calendar-redesign`) — rebase + token-fix commit, then squash-merge.
   - Why third: branched off `main`, NOT stacked. After #84 + #85 land on `main`, do `git rebase main` on the branch.
   - **Mandatory token fix** before merging: the 3 `TODO(shell-pr)` arbitrary hex values in `CalendarRiverChip.tsx`'s service-color palette should be replaced with the expanded sage/sand/plum/sky/warm tokens that #84 brought into the design system. Add a single follow-up commit on the branch for this swap (no functional change; just `bg-[#F4E4DA]` → `bg-warm-pale` etc.).
   - Verify after merge: `app.wellos.one/admin/calendar` renders the horizontal river + density wave + pulsing NOW + left rail; week/month views still work; `/staff/schedule` still works.

### Phase B — small cleanup PR (after Phase A complete)

**Branch:** `chore/admin-calendar-component-relocation`
**Purpose:** Move staff-exclusive calendar components out of the admin directory so file ownership is unambiguous.

| Action | Path |
|---|---|
| Move `apps/web/app/admin/calendar/CalendarGrid.tsx` → `apps/web/app/staff/schedule/CalendarDayGrid.tsx` (rename to clarify staff-day-grid) | Or keep the name; the rename is optional |
| Move `apps/web/app/admin/calendar/CalendarEventBlock.tsx` → `apps/web/app/staff/schedule/StaffAppointmentBlock.tsx` | Or `staff/schedule/_components/CalendarEventBlock.tsx` |
| Move `apps/web/app/admin/calendar/CalendarStaffBlock.tsx` → `apps/web/app/staff/schedule/StaffScheduleBlock.tsx` | Same pattern |
| Update `apps/web/app/staff/schedule/StaffScheduleView.tsx` imports | |
| Confirm no admin file imports any of the relocated files | grep verify |

Net effect: `apps/web/app/admin/calendar/` contains ONLY admin-route components. `apps/web/app/staff/schedule/` owns its own day-view components. The "parallel implementation" smell goes away entirely because the components live in different route directories — they were never V1/V2 of the same route, just historically co-located.

**Alternative consolidation strategy (NOT recommended):** modify `CalendarGrid.tsx` in place to accept a `layout: 'columns' | 'river'` prop and delete the River* variants. The two layouts share very little code (different positioning math, different chip shape, different drag axis), so a unified component would be larger and less clear than two purpose-built ones. Recommended: keep them separate, just put them under their respective route directories.

### Phase C — local branch cleanup (after Phase A complete, before Phase B)

Delete the stale local-only branches enumerated in §1C above. Two commands cover most of them:

```bash
# Worktree branches (have linked worktrees — must remove worktree first)
for w in worktree-agent-a1317f792ced9aa09 worktree-agent-aa19f9b6ee4172cc1 worktree-agent-aa3dd8a1d919cb2fa worktree-agent-acae6ab630dd7f7e3 worktree-agent-addee4d30c8f8d93b worktree-agent-ae78ed9a390763f69 worktree-agent-af09a33f4c4fd9bab worktree-agent-af66d73573763dbae feat/booking-policies feat/booking-settings feat/booking-slot-holds feat/booking-waitlist feature/admin-calendar-redesign; do
  git worktree remove --force ".claude/worktrees/$w" 2>/dev/null
  git branch -D "$w"
done

# Plain branches (no worktree)
for b in backup/pre-split-20260503092911 feat/api-appointment-media-list-e3-s6 feat/api-staff-booking-onboarding-schedule feat/web-admin-note-composer-e3-s5-t10 feat/web-appointments-ui feat/web-calendar-crm-client-ui feat/web-calendar-week-month-views feat/web-client-profile-revamp-e3-s7 feature/intake-forms-phase2 feature/public-booking-mvp-phase1 prisma/catalog-schedule-notes; do
  git branch -D "$b"
done
```

`feature/payments-phase3` — **confirm with user before deleting**; not tied to any open PR but name suggests deliberate WIP.

---

## 5. CLAUDE.md rule addition

After this audit PR is approved, append to `CLAUDE.md` §6 "Hard rules" as rule #15:

> **15. ONE PATH PER ROUTE.** Every URL on the production site corresponds to exactly ONE component tree in the repo. Do NOT create parallel "V2", "New", "experimental", or alternate-route versions of existing components. Redesigns update the live files in place, on a feature branch that merges back into the same paths. If a redesign is too large for one PR, ship it as multiple PRs against the SAME files. The branch is temporary; the file path is permanent.

A separate small PR (`chore/claude-md-add-rule-15-one-path-per-route`) can add this in one commit so the rule is in `CLAUDE.md` for the next session even before Phases B and C complete.

---

## 6. Confirmation checklist (please review before any execution)

Before I open follow-up PRs for Phase B / Phase C / the CLAUDE.md update, please confirm:

- [ ] Merge order is acceptable: `#84` → `#85` → `#87` (with the inline `TODO(shell-pr)` token fix as a follow-up commit on `#87` before merging)
- [ ] Phase B is the right cleanup approach (relocate staff-shared files vs unify via a prop)
- [ ] Phase C local-branch cleanup list is complete (especially `feature/payments-phase3` — delete or keep?)
- [ ] CLAUDE.md rule #15 wording is approved as-is
- [ ] This audit PR (`chore/admin-consolidation-audit`) is ready to commit + push + open (audit report only — no code changes)
