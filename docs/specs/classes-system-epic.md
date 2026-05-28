# Classes System Epic

> **Status:** Architecture spec for the Classes feature. Self-contained — does not depend on the Geofence Auto Check-in epic, but enables it. Build this first.

## Why this matters

Wellos currently supports 1:1 services (massage, facial, consultation). Group classes (yoga, fitness, meditation, drop-in spin, group treatments) are how studio-format wellness businesses actually run. Adding classes turns Wellos from "appointment scheduler" into "studio operating system" and opens a customer segment competitors (Mindbody, Vagaro, Booker) have locked up.

This epic ships a complete classes system: catalog, scheduling, public booking with capacity + waitlist, and staff manual check-in. After this epic ships, studios can fully run classes through Wellos. The Geofence Auto Check-in epic (separate spec) is the optional layer on top that automates the check-in step.

## Four-phase build order

| Phase | Scope | Duration |
|---|---|---|
| 1 | Class catalog (the "what") | 1 week |
| 2 | Class scheduling + recurrence (the "when") | 1 week |
| 3 | Public booking into classes (the "who") | 1 week |
| 4 | Staff manual check-in (the "did they show up") | 3 days |

Total: ~3-4 weeks of focused work, partially parallelizable. Each phase ships independently and adds real value. After Phase 4 ships, the system is competitive with most market alternatives.

---

# Phase 1 — Class Catalog

## New schema — Class model

Parallel to Service but with capacity-aware properties: