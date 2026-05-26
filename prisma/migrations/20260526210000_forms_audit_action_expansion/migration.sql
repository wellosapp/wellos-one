-- Forms System PR 6 — IntakeFormSubmissionAuditAction enum expansion.
--
-- The submission-status enum was expanded in 20260526200000 (the lifecycle
-- migration) but the audit-action enum was overlooked. PR 6's send + cancel
-- paths need 'sent' and 'cancelled' audit values; PRs 7 / 9 / 11 will need
-- 'opened' / 'started' / 'reviewed' / 'approved' / 'denied' / 'expired'.
-- Adding them all here so future PRs don't each need their own migration.
-- Also includes 'created' so PR 5's submission creates can backfill audit
-- rows once the wiring catches up.
--
-- Followup-style additions to a recently-applied migration belong in a
-- separate file: prisma migrate tracks applied files by filename, so
-- editing an already-applied file is a no-op against the DB.

ALTER TYPE "IntakeFormSubmissionAuditAction" ADD VALUE IF NOT EXISTS 'created';
ALTER TYPE "IntakeFormSubmissionAuditAction" ADD VALUE IF NOT EXISTS 'sent';
ALTER TYPE "IntakeFormSubmissionAuditAction" ADD VALUE IF NOT EXISTS 'opened';
ALTER TYPE "IntakeFormSubmissionAuditAction" ADD VALUE IF NOT EXISTS 'started';
ALTER TYPE "IntakeFormSubmissionAuditAction" ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE "IntakeFormSubmissionAuditAction" ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE "IntakeFormSubmissionAuditAction" ADD VALUE IF NOT EXISTS 'reviewed';
ALTER TYPE "IntakeFormSubmissionAuditAction" ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE "IntakeFormSubmissionAuditAction" ADD VALUE IF NOT EXISTS 'denied';
