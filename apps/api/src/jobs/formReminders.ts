// Forms System PR 11 — reminder cron + expired-submission transition.
//
// Pure async functions: no scheduler binding here. The admin trigger route
// (routes/admin/jobs.ts) exposes both as POST /admin/jobs/forms/cron so a
// real scheduler (Railway cron / GitHub Actions schedule / BullMQ) can hit
// them in Epic 8. Until then, smoke-testing runs them manually.
//
// Dispatch stays STUBBED — same Pino-log shape as PR 6's sendForm. Postmark
// + TextLink wiring lands in Epic 8.

import type { FastifyBaseLogger } from 'fastify';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';

const TERMINAL_STATUSES = new Set(['submitted', 'expired', 'cancelled']);
const NON_TERMINAL_STATUSES = [
  'draft',
  'assigned',
  'sent',
  'opened',
  'in_progress',
] as const;

// Delivery channels that produce no reminder dispatch (no contact-point on
// file). The reminder row is still marked sent_at so it isn't retried — we
// processed it, the dispatch just no-ops.
const NON_DISPATCH_CHANNELS = new Set([
  'admin_only',
  'kiosk',
  'inline_booking',
]);

// ---------- processPendingReminders ----------

export interface ProcessPendingRemindersResult {
  /** Reminders that were processed (regardless of whether they actually dispatched). */
  processed: number;
  /** Reminders that dispatched email/SMS (stub-logged). */
  dispatched: number;
  /** Reminders skipped because the submission is terminal (defense-in-depth — should have been cancelled). */
  skippedTerminal: number;
  /** Reminders skipped because the submission's delivery_channel doesn't support reminders. */
  skippedChannel: number;
}

/**
 * Find FormReminder rows with scheduled_for <= NOW and not yet sent/cancelled.
 * For each: log the stub dispatch via Pino, mark sent_at. Best-effort —
 * per-row failures are caught + logged, don't halt the batch.
 *
 * Atomic claim: updateMany with WHERE sent_at IS NULL prevents double-dispatch
 * on concurrent runs.
 */
export async function processPendingReminders(
  prisma: ExtendedPrismaClient,
  args?: { log?: FastifyBaseLogger; batchSize?: number },
): Promise<ProcessPendingRemindersResult> {
  const log = args?.log;
  const batchSize = args?.batchSize ?? 100;
  const now = new Date();

  const due = await prisma.formReminder.findMany({
    where: {
      scheduledFor: { lte: now },
      sentAt: null,
      cancelledAt: null,
    },
    take: batchSize,
    orderBy: { scheduledFor: 'asc' },
    include: {
      submission: {
        include: {
          client: true,
          definition: true,
          appointment: true,
        },
      },
    },
  });

  let processed = 0;
  let dispatched = 0;
  let skippedTerminal = 0;
  let skippedChannel = 0;

  for (const reminder of due) {
    const submission = reminder.submission;

    // Pre-check terminal — should have been cancelled when the submission
    // completed; if it wasn't, cancel now (don't mark sent_at).
    if (TERMINAL_STATUSES.has(submission.status)) {
      const claimed = await prisma.formReminder.updateMany({
        where: {
          id: reminder.id,
          sentAt: null,
          cancelledAt: null,
        },
        data: { cancelledAt: now },
      });
      if (claimed.count > 0) {
        skippedTerminal += 1;
        log?.warn(
          {
            reminderId: reminder.id,
            submissionId: submission.id,
            submissionStatus: submission.status,
            tenantId: reminder.tenantId,
          },
          'form reminder skipped — submission terminal (defense-in-depth cancel)',
        );
      }
      continue;
    }

    // Channels that don't dispatch — kiosk / inline_booking / admin_only.
    // Resolve from submission's live deliveryChannel (not snapshot) — the
    // reminder.channel column stores the email/sms preference, but the
    // submission's deliveryChannel is the surface that decides dispatchability.
    const deliveryChannel = submission.deliveryChannel ?? '';
    if (NON_DISPATCH_CHANNELS.has(deliveryChannel)) {
      const claimed = await prisma.formReminder.updateMany({
        where: {
          id: reminder.id,
          sentAt: null,
          cancelledAt: null,
        },
        data: { sentAt: now },
      });
      if (claimed.count > 0) {
        processed += 1;
        skippedChannel += 1;
        log?.info(
          {
            reminderId: reminder.id,
            submissionId: submission.id,
            tenantId: reminder.tenantId,
            deliveryChannel,
            channel: reminder.channel,
          },
          'STUB: form reminder skipped (channel=admin_only/kiosk/inline_booking)',
        );
      }
      continue;
    }

    // Atomic claim — only proceed if we won the race.
    const claimed = await prisma.formReminder.updateMany({
      where: {
        id: reminder.id,
        sentAt: null,
        cancelledAt: null,
      },
      data: { sentAt: now },
    });
    if (claimed.count === 0) {
      // Another runner beat us to it.
      continue;
    }

    processed += 1;

    // Classify reminder type for observability. We don't store this on the
    // row — derive it from scheduledFor vs appointment.scheduledStartAt.
    const reminderType = classifyReminderType({
      scheduledFor: reminder.scheduledFor,
      appointmentScheduledStartAt:
        submission.appointment?.scheduledStartAt ?? null,
    });

    // Stub the dispatch. TODO(epic-8): wire real Postmark / TextLink.
    try {
      dispatched += 1;
      log?.info(
        {
          channel: reminder.channel,
          deliveryChannel,
          submissionId: submission.id,
          tenantId: reminder.tenantId,
          clientId: submission.clientId,
          formTitle: submission.definition.title,
          reminderId: reminder.id,
          reminderType,
        },
        'STUB: would send form reminder',
      );
    } catch (err) {
      // Real dispatch failures (Epic 8) need rollback + retry. For the stub
      // log, this branch only fires if the logger itself throws — unlikely
      // but cheap insurance. Roll back sent_at so the next tick retries.
      log?.error(
        {
          err: err instanceof Error ? err.message : String(err),
          reminderId: reminder.id,
        },
        'form reminder dispatch failed — rolling back sent_at',
      );
      await prisma.formReminder.update({
        where: { id: reminder.id },
        data: { sentAt: null },
      });
      dispatched -= 1;
      processed -= 1;
    }
  }

  return { processed, dispatched, skippedTerminal, skippedChannel };
}

function classifyReminderType(args: {
  scheduledFor: Date;
  appointmentScheduledStartAt: Date | null;
}): '24h_after_send' | '4h_before_appt' | 'other' {
  const appt = args.appointmentScheduledStartAt;
  if (appt) {
    // 4h-before-appt reminder lives in a ~30-minute window around (apptStart - 4h).
    const fourHoursBefore = appt.getTime() - 4 * 60 * 60 * 1000;
    const delta = Math.abs(args.scheduledFor.getTime() - fourHoursBefore);
    if (delta < 30 * 60 * 1000) return '4h_before_appt';
  }
  return '24h_after_send';
}

// ---------- processExpiredSubmissions ----------

export interface ProcessExpiredSubmissionsResult {
  /** Submissions whose status was transitioned to 'expired'. */
  expired: number;
  /** Reminders that were cancelled as a side-effect of the expiry. */
  remindersCancelled: number;
}

/**
 * Find IntakeFormSubmission rows where expires_at <= NOW and status is
 * non-terminal. Transition each to status='expired'. Side-effects: cancel
 * any pending reminders, revoke active magic-link tokens, write an audit row.
 */
export async function processExpiredSubmissions(
  prisma: ExtendedPrismaClient,
  args?: { log?: FastifyBaseLogger; batchSize?: number },
): Promise<ProcessExpiredSubmissionsResult> {
  const log = args?.log;
  const batchSize = args?.batchSize ?? 100;
  const now = new Date();

  const stale = await prisma.intakeFormSubmission.findMany({
    where: {
      expiresAt: { lte: now },
      status: { in: [...NON_TERMINAL_STATUSES] },
    },
    take: batchSize,
    include: { definition: true },
  });

  let expired = 0;
  let remindersCancelled = 0;

  for (const submission of stale) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Atomic guard — another worker may have already moved this row to
        // terminal. updateMany with status filter prevents the double-write.
        const updated = await tx.intakeFormSubmission.updateMany({
          where: {
            id: submission.id,
            status: { in: [...NON_TERMINAL_STATUSES] },
          },
          data: { status: 'expired' },
        });
        if (updated.count === 0) {
          return { transitioned: false, remindersCancelled: 0 };
        }

        await tx.intakeFormSubmissionAudit.create({
          data: {
            tenantId: submission.tenantId,
            submissionId: submission.id,
            action: 'expired',
            definitionId: submission.definitionId,
            definitionVersion: submission.definition.version,
            schemaSnapshot: submission.definition.schema as object,
            answersSnapshot: submission.answers as object,
            ip: null,
            userAgent: null,
          },
        });

        // Cancel any pending reminders.
        const cancelled = await tx.formReminder.updateMany({
          where: {
            submissionId: submission.id,
            sentAt: null,
            cancelledAt: null,
          },
          data: { cancelledAt: now },
        });

        // Revoke any active magic-link tokens — defense-in-depth on top of
        // the public route's own expiresAt check.
        await tx.magicLinkToken.updateMany({
          where: {
            intakeFormSubmissionId: submission.id,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });

        return { transitioned: true, remindersCancelled: cancelled.count };
      });

      if (result.transitioned) {
        expired += 1;
        remindersCancelled += result.remindersCancelled;
        log?.info(
          {
            submissionId: submission.id,
            tenantId: submission.tenantId,
            clientId: submission.clientId,
            remindersCancelled: result.remindersCancelled,
          },
          'intake form submission transitioned to expired',
        );
      }
    } catch (err) {
      log?.error(
        {
          err: err instanceof Error ? err.message : String(err),
          submissionId: submission.id,
        },
        'failed to expire submission — will retry on next tick',
      );
    }
  }

  return { expired, remindersCancelled };
}

// ---------- cancelPendingReminders helper ----------

/**
 * Cancel every pending reminder for the given submission. Idempotent —
 * the WHERE clause filters out already-sent and already-cancelled rows.
 * Callers pass either the prisma client or an active transaction client.
 */
export async function cancelPendingReminders(
  tx: ExtendedTransactionClient | ExtendedPrismaClient,
  submissionId: string,
): Promise<void> {
  await tx.formReminder.updateMany({
    where: { submissionId, sentAt: null, cancelledAt: null },
    data: { cancelledAt: new Date() },
  });
}
