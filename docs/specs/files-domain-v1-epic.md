EPIC: Files Domain v1 — turn the file gallery into operational media infrastructure

The Client Profile Files fidelity work shipped the visual gallery surface. This epic builds the schema + features that turn it from a basic upload list into the "operational media intelligence" the spec calls for. Excludes protected/clinical files (those go in the Clinical Compliance epic — separate work because of HIPAA implications).

PHASE 1 — SCHEMA + FOLDERS

PR 1.1 — File schema expansion
Add to File model:
- category (enum: photo, document, before_after_before, before_after_after, intake, consent, reference)
- folder (free-form string for tenant custom organization)
- tags (string array)
- appointmentId (nullable FK to Appointment)
- serviceId (nullable FK to Service)
- formSubmissionId (nullable FK to FormSubmission)
- uploaderStaffId (FK to Staff)
- visibility (enum: location, provider_only, subcontractor_scoped) — default 'location'
- reviewState (enum: pending_review, reviewed, approved, flagged, archived)
- pinned (boolean)
- expiresAt (datetime, nullable — for client docs that expire like IDs)
- metadata (json — EXIF, image dimensions, etc.)

Migration strategy: handle migration drift per memory/project_migration_drift_2026_05.md — hand-write SQL OR defer if drift unresolved.

PR 1.2 — Folder filter wiring on Files tab
Wire the folder filter pills shipped in the fidelity PR. Each pill filters by category.
Add a "Custom folders" section in the filter row showing tenant-defined folders.

PR 1.3 — Tags + search
Add tag chip display on each file tile. Tag picker on upload. Tag-based filtering.
Simple full-text search across file names + tags.

PHASE 2 — APPOINTMENT + WORKFLOW INTEGRATION

PR 2.1 — Appointment linkage
"Link to appointment" picker on upload + edit. Tile chip in top-left showing linked appointment.
Click chip → opens AppointmentDrawer.

PR 2.2 — Files in appointment timeline
In Visits tab, each visit card shows a small file count badge ("3 photos") if files are linked.
Click badge → expands inline gallery preview of those files.

PR 2.3 — Provider briefing surface
Pre-appointment view in /admin/calendar AppointmentDrawer:
- "Latest uploads" section showing last 5 files linked to this client
- "Flagged files" section for files marked reviewState='flagged'
- "Before/After" section if those exist for the linked service

PHASE 3 — BEFORE / AFTER SYSTEM

PR 3.1 — Before/After pairing
When uploading photos, option to mark as "Before" or "After" + link to specific appointment.
Pairs auto-link by appointmentId.

PR 3.2 — Comparison slider component
Side-by-side comparison slider component using the paired Before/After files.
Lives at /admin/clients/[id]/files when Before/After folder is active.

PR 3.3 — Transformation gallery
Timeline view of all Before/After pairs for a client. Useful for medspa progress tracking.

PHASE 4 — CLIENT SELF-UPLOAD (limited scope)

PR 4.1 — Magic link upload page
Public route /upload/[token] — clients arrive via SMS/email, upload files, files auto-link to their client record + optional appointment.
No login required. Token-scoped, short-lived.

PR 4.2 — Booking flow uploads
Inside the public booking flow, add optional "Upload reference photos" step.
Files attach to the resulting appointment.

PR 4.3 — Intake form uploads
File upload fields inside intake forms (separate epic — coordinate with Intake forms backend work).
Uploaded files auto-attach to client + intake submission.

PHASE 5 — EXPIRATION + COMPLIANCE (non-clinical)

PR 5.1 — Expiration tracking on files
Files with expiresAt show expiration banner when approaching.
Admin dashboard widget: "Files expiring soon" — IDs, insurance cards, certifications.

PR 5.2 — Renewal reminders
Email/SMS reminders to client (for client docs) or admin (for business/staff docs) before expiration.

PR 5.3 — Provider certifications surface
Each Staff profile has a Certifications section showing uploaded credentials with expiration tracking.
Warning state in /admin/staff list for staff with expiring credentials.

WHAT THIS EPIC EXPLICITLY EXCLUDES
- Protected clinical files (separate Clinical Compliance epic — different bucket, audit logs, HIPAA)
- AI photo analysis (way later)
- Tenant-side Business File Center for licenses/W9/insurance (separate Business Onboarding epic)
- Image processing pipeline beyond R2 defaults (separate Image Pipeline epic if needed)

DECISION POINTS DURING THE EPIC
- When PR 4.1 (magic link upload) ships, decide if it needs its own auth model or if it piggybacks on existing booking token infrastructure
- When PR 5.1 ships, decide notification channels (in-app banner vs SMS vs email) per file category
- Image processing: do we need a separate image worker (Cloudflare Workers/Vercel Functions) or is R2's built-in transform enough? Decide after PR 1.1 lands and we see real file sizes
- Folder system: tenant-defined folders only, or fixed categories + custom tags? Recommend: fixed categories at the schema level, custom tags for flexibility. Validate after Phase 1.

ESTIMATED TIMELINE
- Phase 1: 1 week
- Phase 2: 1 week  
- Phase 3: 1 week
- Phase 4: 1-2 weeks (depends on token infrastructure decisions)
- Phase 5: 1 week
Total: 5-6 weeks of focused work, can run partially in parallel