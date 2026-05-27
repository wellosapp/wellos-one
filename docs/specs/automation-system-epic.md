# Automation System Epic

> **Status:** Native visual workflow automation builder, n8n-style. Started 2026-05-27. **In progress** — PR 1 (schema + event bus foundation) dispatching now.

## Decisions locked in (2026-05-27)

| Decision | Choice |
|---|---|
| Scope | **Phases A–F** — engine + canvas + internal actions + templates + safety. SMS/email actions stub via Pino (same as forms-send service) until Epic 8 wires Postmark + TextLink. Payment/membership triggers show as "Coming soon" placeholders until Epic 6 / a memberships epic ship. |
| Canvas library | **React Flow (`@xyflow/react`)** — de facto standard for n8n-style React node editors. ~50kb gzipped, MIT |
| Event bus / queue strategy | **Incremental** — in-process event bus (extends Geofence PR 10's `rosterBroadcast` pattern) + manual cron-poll for delays (extends Forms PR 11's `processPendingReminders` pattern). `// TODO(scale)` markers everywhere. Swap to Redis pub/sub + BullMQ when Epic 8 wires them. |
| Timing | **Start now**, one PR at a time, same cadence as forms epic |

## Why this can't fully ship without Epic 6 + 8

The spec's trigger/action library is ambitious. Honest reality check:

**Works today (Phase A–F covers these):**
- Booking triggers (need event emission in `appointmentService` + `classBookingService`)
- Form triggers (forms epic just shipped — audit log captures every transition)
- Client / file / staff triggers (data exists, need event emission)
- Internal actions — notifications, tasks, tags, alerts, notes, audit-log entries, webhook dispatch
- Form actions — bridges to the forms epic
- Variable substitution + message editor UI
- Run history + logs
- Test mode + dry runs
- Safety guardrails (throttling, loop prevention, opt-out respect)
- 17 prebuilt templates (filtered to triggers/actions that work)

**Stubbed until Epic 8 (Phase G):**
- SMS via TextLink
- Email via Postmark
- Push notifications

**Deferred to Epic 6 + memberships epic (Phase H):**
- All payment triggers (7)
- All membership/package triggers (7)
- All payment/membership actions

**Deferred to a future AI epic:**
- AI nodes (generate summaries, draft SOAP, identify risk from form answers)

## Proposed PR sequence

### Phase A — Engine + schema foundation (PRs 1–5)

| PR | Scope |
|---|---|
| **PR 1** | Schema: 5 new tables (workflows, runs, node_runs, templates, webhook_deliveries). In-process event bus skeleton (`apps/api/src/lib/automationEventBus.ts`). Event-type union for all triggers. No UI, no engine logic yet — just the foundation. |
| **PR 2** | Workflow engine — reads `workflow_json`, walks nodes, dispatches conditions/branches/filters/delays/actions. Single-node execution per call (caller loops). No real action implementations yet — just the runtime that calls registered handlers. |
| **PR 3** | Trigger dispatcher — subscribes to the event bus, queries active workflows matching each event's trigger type, creates `AutomationRun` records, kicks off engine. |
| **PR 4** | Delay queue — `automation_delayed_nodes` table + cron-poll endpoint (extends Forms PR 11's pattern). When a delay-node fires, the engine resumes from the next node. |
| **PR 5** | Run + node-run audit + admin run-history viewer. Read-only `/admin/automations/runs` list page. |

### Phase B — Visual canvas (PRs 6–10)

| PR | Scope |
|---|---|
| **PR 6** | React Flow integration. Empty canvas at `/admin/automations/[id]/edit`. Save/load `workflow_json`. |
| **PR 7** | Trigger + action + condition palette (left sidebar). Drag-drop onto canvas. Connection validation. |
| **PR 8** | Node settings drawer (right sidebar). Per-node config form per node-type. Variable picker. |
| **PR 9** | Branch/delay/filter visualization. Curved connections. Branch labels. Animated test-run state. |
| **PR 10** | Test mode — pick sample client + appointment, run workflow with mocked output, render the path + node statuses on the canvas. |

### Phase C — Trigger emission across the codebase (PRs 11–13)

| PR | Scope |
|---|---|
| **PR 11** | Booking + class triggers — instrument `appointmentService`, `classBookingService`, `classInstanceService`. Emit events on every state transition. |
| **PR 12** | Form triggers — bridge from existing `IntakeFormSubmissionAudit` writes to the event bus. (PR 6 of forms epic already writes the audit rows; just emit on top.) |
| **PR 13** | Client + file + staff triggers + birthday/inactivity cron. |

### Phase D — Internal-only actions (PRs 14–16)

| PR | Scope |
|---|---|
| **PR 14** | Internal notification action + task creation action. New `internal_notifications` table + admin inbox. |
| **PR 15** | CRM actions — add/remove tag, create client note, create alert, update client field. |
| **PR 16** | Webhook dispatch action with retry. `AutomationWebhookDelivery` table from PR 1 gets exercised. |

### Phase E — Templates (PRs 17–18)

| PR | Scope |
|---|---|
| **PR 17** | Seed 17 prebuilt templates (filtered to triggers/actions that work without Epic 6/8). Clone-from-template flow. |
| **PR 18** | Template library page + template-detail preview. |

### Phase F — Safety + guardrails (PRs 19–20)

| PR | Scope |
|---|---|
| **PR 19** | Throttling (per-client, per-workflow rate limits) + opt-out respect + loop prevention. |
| **PR 20** | Failure handling — retry config + admin notification on critical failures + auto-pause on repeated failures. |

### Phase G — SMS/email actions (PRs 21–22, BLOCKED on Epic 8)

| PR | Scope |
|---|---|
| **PR 21** | SMS action via TextLink (when Epic 8 wires it). |
| **PR 22** | Email action via Postmark (when Epic 8 wires it). Existing `formSendService` STUB log pattern shows what the wired version looks like. |

### Phase H — Stripe + memberships (DEFERRED to Epic 6 + memberships epic)

Payment triggers, payment actions, membership/package actions all wait on their data-model and integration dependencies.

## Notes for future sessions

- **Phase C wires trigger emission** — touches every existing service. Cross-cutting. Don't underestimate.
- **The event-type union grows as we add categories.** PR 1 declares the full list; subsequent PRs implement each.
- **`workflow_json` is React Flow's shape**, extended with per-node config payloads. Roughly `{ nodes: Array<{ id, type, position, data: {...} }>, edges: Array<{ id, source, target, sourceHandle?, targetHandle?, label? }> }`.
- **Cron endpoint** for delay queue mirrors the Forms PR 11 pattern (`POST /admin/jobs/automations/cron`). Epic 8 hooks a real scheduler.

## Closes-out from other specs

- The forms `// TODO(workflow)` markers from PR 6 / 11 — wired when Phase C ships
- The geofence epic's "intentional carryover" event hooks
- The "automation events" section in `forms-system-epic.md` (deferred per user instruction during forms-epic build)

## Estimated timeline

- **Phase A (PRs 1–5)**: ~2 weeks
- **Phase B (PRs 6–10)**: ~2 weeks
- **Phase C (PRs 11–13)**: ~1 week
- **Phase D (PRs 14–16)**: ~1 week
- **Phase E (PRs 17–18)**: ~1 week
- **Phase F (PRs 19–20)**: ~1 week

Total: **~8 weeks across 20 PRs** for Phases A–F. G + H wait on dependencies.

One-PR-at-a-time cadence per the working memory.
