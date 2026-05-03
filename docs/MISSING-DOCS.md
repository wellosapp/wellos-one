# Missing Docs — Pending Export from Claude.ai Project

The CLAUDE.md and README in this repo reference several docs that **do not yet exist on disk** because they live in the Claude.ai web project ("Rebuild application") and have not been exported.

These need to be downloaded from the Claude.ai project's "Project knowledge" panel and saved into this `docs/` folder before Epic 1 work begins.

## Imported ✅

| Filename | Imported | Notes |
|---|---|---|
| `09-dev-handoff.md` | 2026-04-26 | Canonical accounts roster, consolidated env var reference, 11-epic index. v1.2 of the doc — matches what `00-V2-per-build-setup.md` was derived from. |

## Stubs / placeholders (replace with full exports)

| Filename | Status | Notes |
|---|---|---|
| `onboarding-forms-write-up.md` | **Stub** (2026-05-03) | Placeholder until the full *Wellos — Onboarding & Forms Write-Up* markdown is pasted from project knowledge or chat. Parity tracking lives in [`onboarding-forms-implementation-map.md`](./onboarding-forms-implementation-map.md). |

## Still pending

| Filename | Why it matters | Blocks |
|---|---|---|
| `technical-build-spec.md` | "What we're building" companion to the master spec | General project context |
| `01-design-system.md` | Design system intent (paired with `10-design-system-buildout.md` which IS present) | Any UI ticket needing the original design rationale |
| `02-onboarding-flow.md` | Onboarding UX intent (paired with `11-onboarding-buildout.md` which IS present) | Epic 2 (Client + staff data model) |
| `03-dashboard-today-view.md` | Dashboard UX intent (paired with `12-dashboard-buildout.md` which IS present) | Epic 9 (Staff-facing app views), Epic 10 (Admin dashboard) |
| `textlink-integration-guide.md` | SMS architecture, SIM allocation strategy | Epic 8 (Notifications), `.env.example` `TEXTLINK_SIM_*` values |
| `textlink-api-reference.md` | TextLink API surface | Epic 8 (Notifications) |

## How to export the rest

1. Open the Claude.ai web app → Projects → "Rebuild application"
2. Find the "Project knowledge" panel
3. For each file above:
   - If it appears as an attached file: download it
   - If it appears as a text snippet: copy and save as a `.md` file with the matching name
4. Save into the project root (`H:/OneDrive/OneDrive - Evo Tech/Apps/WellOs/`) so we can copy into the repo via PR
5. Delete this `MISSING-DOCS.md` file once all 6 remaining are in place

## Env var reconciliation note

`09-dev-handoff.md` § "Environment variables required (consolidated reference)" lists the canonical env var schema. Our `.env.example` differs slightly — both work, our naming is newer:

| Variable | 09-dev-handoff | Our `.env.example` |
|---|---|---|
| Supabase frontend key | `SUPABASE_ANON_KEY` (legacy JWT) | `SUPABASE_PUBLISHABLE_KEY` (new `sb_publishable_*`) |
| Supabase backend key | `SUPABASE_SERVICE_ROLE_KEY` (legacy JWT) | `SUPABASE_SECRET_KEY` (new `sb_secret_*`) |

Supabase introduced the new naming in late 2025 and both work side-by-side. We use the newer names throughout — no action needed.

## Related

- `00-V2-per-build-setup.md` is the canonical setup doc, IS present.
- `00-V2-pre-build-setup-start.txt` (an earlier draft of v2) exists at the project root but is **superseded** — do NOT import.
- `mindbody-rebuild-master-spec.md` is the master engineering spec, IS present.
- All `*-buildout.md` design / onboarding / dashboard companion docs are present; only their original "intent" pairs are missing.
