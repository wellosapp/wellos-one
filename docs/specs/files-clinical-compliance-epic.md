EPIC: Protected/Clinical Files — HIPAA-grade compliance partition

Some files require treatment as protected health information (PHI): clinical imaging, medication photos, treatment-area imagery, protected SOAP attachments. These cannot live in the standard files system because they require encryption at rest, audit logs, restricted access scoping, short-lived signed URLs, and compliance-grade access controls.

This epic is paired with the Notes Clinical Partition epic — both deal with the same protected.* schema and access control layer.

DO NOT START THIS EPIC UNTIL:
- You have at least one paying medspa or clinical customer who requires it
- Or legal counsel advises HIPAA BAA readiness is a near-term requirement
- The infrastructure cost (separate bucket, audit DB, encryption layer) is not worth carrying without active use

When triggered, build in this order:

PHASE 1 — INFRASTRUCTURE

PR 1.1 — Protected bucket setup
- Separate R2 bucket: wellos-protected (separate from app-prod-uploads)
- Encryption at rest enforced
- Short-lived signed URLs (15 min max)
- No public access ever
- Separate access keys, separate IAM

PR 1.2 — Protected schema partition
- New Prisma schema: protected/* (separate file, separate generated client)
- Tables: protected_file, protected_file_access_log
- All FKs reference public client/staff/appointment but cross-schema queries audited

PR 1.3 — Access control layer
- Service: protectedFiles.service.ts
- Every read/write goes through this service
- Every access creates a row in protected_file_access_log: who, what, when, why, from where
- Authorization based on role + appointment + client + provider relationships

PHASE 2 — UI INTEGRATION

PR 2.1 — Clinical folder in client profile Files tab
- Coming-soon item from write-up #1 becomes real
- Files in Clinical folder go to protected bucket, not standard
- Distinct visual treatment: lock icon, "protected" badge, "Access logged" notice
- Only visible to roles with clinical access permission

PR 2.2 — SOAP attachment integration
- Coordinate with Notes Clinical Partition epic — SOAP notes can attach protected files
- Files inherit SOAP's access controls and revision history

PR 2.3 — Access log viewer
- Admin-only audit view: "Who accessed Client X's clinical files in the last 30 days?"
- Tenant-scoped, immutable history

PHASE 3 — COMPLIANCE READINESS

PR 3.1 — HIPAA BAA preparation
- Document all data flows for protected files
- Cloudflare R2 BAA verification (or migration path if R2 won't sign BAA for healthcare)
- Cross-region replication strategy
- Backup encryption

PR 3.2 — Access expiration
- Provider access to a client's clinical files expires when the appointment ends
- "Just-in-time" access pattern — provider sees clinical files only during active appointment window
- Configurable per-tenant grace period

PR 3.3 — Audit reporting
- Tenant admin can export full access log per client per date range
- Compliant with HIPAA accounting-of-disclosures requirements

WHAT TO ABSOLUTELY NEVER DO IN THIS EPIC
- Never store protected files in the standard bucket "just for now"
- Never bypass the access control service "for testing"
- Never log protected file contents (only metadata)
- Never share signed URLs in plaintext logs or error messages
- Never allow client self-upload to protected bucket (clients can't authenticate to that bucket — staff uploads only)

DECISION POINTS BEFORE STARTING
- BAA viability: does Cloudflare R2 sign BAAs for healthcare customers? If not, plan migration to AWS S3 with BAA or self-hosted
- Compliance attestation strategy: SOC 2 prep, HIPAA prep, both?
- Legal counsel review: any state-specific medspa regulations affecting California, your home state?
- Insurance: cyber liability coverage for PHI?

ESTIMATED TIMELINE
3-4 weeks of focused work + several weeks of legal/compliance review depending on customer requirements.

This epic touches both infrastructure (bucket, schema, services) and product (UI, access flows, audit views). Plan for parallel infrastructure + UI tracks.