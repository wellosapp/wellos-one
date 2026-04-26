# Missing Docs — Pending Export from Claude.ai Project

The CLAUDE.md and README in this repo reference several docs that **do not yet exist on disk** because they live in the Claude.ai web project ("Rebuild application") and have not been exported.

These need to be downloaded from the Claude.ai project's "Project knowledge" panel and saved into this `docs/` folder before Epic 1 work begins. Several blocks of the v2 setup checklist (`00-V2-per-build-setup.md`) defer to these documents as canonical.

## Pending exports

| Filename | Why it matters | Blocks |
|---|---|---|
| `09-dev-handoff.md` | **Most critical.** Canonical accounts roster, env var reference, epic + ticket sequencing. | v2 §1 (accounts checklist), §3.5 (`.env.example`), every epic kickoff |
| `technical-build-spec.md` | "What we're building" companion to the master spec | General project context |
| `01-design-system.md` | Design system intent (paired with `10-design-system-buildout.md` which IS present) | Any UI ticket needing the original design rationale |
| `02-onboarding-flow.md` | Onboarding UX intent (paired with `11-onboarding-buildout.md` which IS present) | Epic 2 (onboarding) |
| `03-dashboard-today-view.md` | Dashboard UX intent (paired with `12-dashboard-buildout.md` which IS present) | Epic 3 (dashboard) |
| `textlink-integration-guide.md` | SMS architecture, SIM allocation strategy | Epic 7 (notifications), `.env.example` `TEXTLINK_SIM_*` values |
| `textlink-api-reference.md` | TextLink API surface | Epic 7 (notifications) |

## How to export

1. Open the Claude.ai web app → Projects → "Rebuild application"
2. Find the "Project knowledge" panel
3. For each file above:
   - If it appears as an attached file: download it
   - If it appears as a text snippet: copy and save as a `.md` file with the matching name
4. Save into this `docs/` folder
5. Delete this `MISSING-DOCS.md` file once all 7 are in place

## Related

- `00-V2-per-build-setup.md` is the canonical setup doc and IS present (copied from project root).
- `mindbody-rebuild-master-spec.md` is the master engineering spec and IS present.
- All `*-buildout.md` design / onboarding / dashboard companion docs are present; only their original "intent" pairs are missing.
