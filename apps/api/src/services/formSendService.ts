// Forms System PR 6 — form-send service.
//
// Mints a magic-link token scoped to an IntakeFormSubmission and stubs the
// email/SMS delivery. Postmark + TextLink dispatch is deferred to Epic 8 —
// for now the resolved URL is logged via Pino + returned to the caller.
//
// State machine:
//   draft | assigned | sent | opened | in_progress  →  sent
//   submitted | expired | cancelled                 →  FormSendNotEligibleError
//
// Resend semantics: any prior active magic-link tokens for this submission
// are revoked inside the same transaction as the new token is minted.

import type { FastifyBaseLogger } from 'fastify';
import type {
  IntakeFormSubmission,
  IntakeFormDefinition,
  Client,
  Appointment,
} from '@prisma/client';

import type { ExtendedPrismaClient } from '../db/client.js';
import { mintToken } from './magicLinkService.js';

export type FormDeliveryChannel =
  | 'email'
  | 'sms'
  | 'both'
  | 'kiosk'
  | 'inline_booking'
  | 'admin_only';

const NON_TERMINAL_STATUSES = [
  'draft',
  'assigned',
  'sent',
  'opened',
  'in_progress',
] as const;

const TERMINAL_STATUSES = ['submitted', 'expired', 'cancelled'] as const;

function isTerminalStatus(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

// ----- errors -----

export class IntakeFormSubmissionNotFoundError extends Error {
  code = 'INTAKE_FORM_SUBMISSION_NOT_FOUND' as const;
  constructor(public submissionId: string) {
    super(`Submission ${submissionId} not found`);
  }
}

export class FormSendNotEligibleError extends Error {
  code = 'FORM_SEND_NOT_ELIGIBLE' as const;
  constructor(public status: string, public reason: string) {
    super(`Cannot send form in status '${status}': ${reason}`);
  }
}

export class IntakeFormSubmissionNotCancellableError extends Error {
  code = 'INTAKE_FORM_SUBMISSION_NOT_CANCELLABLE' as const;
  constructor(public status: string) {
    super(
      `Cannot cancel submission in terminal status '${status}'. Only non-terminal submissions can be cancelled.`,
    );
  }
}

// ----- sendForm -----

export interface SendFormArgs {
  tenantId: string;
  /** null for system-initiated sends (booking auto-send). */
  actorUserId: string | null;
  submissionId: string;
  /**
   * Override the channel. If omitted, falls back to the submission's stored
   * deliveryChannel, then auto-detects from the client's contact info
   * ('email' > 'sms' > 'admin_only').
   */
  deliveryChannel?: FormDeliveryChannel;
  /** Override the magic-link host (testing). */
  publicHostOverride?: string;
  /** Fastify request logger so the STUB log line lives alongside request context. */
  log?: FastifyBaseLogger;
}

export interface SendFormResult {
  submission: IntakeFormSubmission;
  /** Magic-link URL — admin UI displays this for copy-to-clipboard / kiosk. */
  url: string;
  /** Channels we attempted (empty for 'admin_only' / 'kiosk' / 'inline_booking'). */
  channels: ('email' | 'sms')[];
  /** The channel that was actually resolved + stored on the submission. */
  resolvedChannel: FormDeliveryChannel;
}

export async function sendForm(
  prisma: ExtendedPrismaClient,
  args: SendFormArgs,
): Promise<SendFormResult> {
  // 1. Load submission with the relations we need for resolution + audit.
  const submission = await prisma.intakeFormSubmission.findFirst({
    where: { id: args.submissionId, tenantId: args.tenantId },
    include: {
      client: true,
      definition: true,
      appointment: true,
    },
  });
  if (!submission) {
    throw new IntakeFormSubmissionNotFoundError(args.submissionId);
  }

  // 2. State-machine gate.
  if (isTerminalStatus(submission.status)) {
    throw new FormSendNotEligibleError(
      submission.status,
      `terminal state — create a new submission instead`,
    );
  }
  if (
    !(NON_TERMINAL_STATUSES as readonly string[]).includes(submission.status)
  ) {
    throw new FormSendNotEligibleError(
      submission.status,
      'unknown status — refusing to dispatch',
    );
  }

  // 3. Resolve channel.
  const resolvedChannel: FormDeliveryChannel = resolveChannel({
    requested: args.deliveryChannel,
    stored: submission.deliveryChannel ?? undefined,
    client: submission.client,
  });

  // 4. Resolve expiry — submission > appointment + 30min > now + 7d.
  const expiresAt = resolveExpiry({
    storedExpiresAt: submission.expiresAt,
    appointment: submission.appointment,
  });

  // 5. Resend revocation + new-token mint + status update (inside a tx).
  const baseUrl =
    args.publicHostOverride ??
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'https://app.wellos.one';

  const isResend = submission.status !== 'draft' && submission.status !== 'assigned';

  const { url, updatedSubmission, tokenId } = await prisma.$transaction(
    async (tx) => {
      // Revoke any prior active tokens for this submission.
      await tx.magicLinkToken.updateMany({
        where: {
          intakeFormSubmissionId: submission.id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      // Mint the new token. Scope to both the submission AND the client so
      // verifyToken eagerly loads both for the public renderer.
      const mintResult = await mintToken(tx, {
        tenantId: args.tenantId,
        purpose: 'form_submission',
        expiresAt,
        scope: {
          intakeFormSubmissionId: submission.id,
          ...(submission.clientId ? { clientId: submission.clientId } : {}),
        },
      });

      // Update submission status + delivery channel + (if not yet set) expiry.
      const updated = await tx.intakeFormSubmission.update({
        where: { id: submission.id },
        data: {
          status: 'sent',
          deliveryChannel: resolvedChannel,
          ...(submission.expiresAt ? {} : { expiresAt }),
        },
      });

      // Audit row.
      await tx.intakeFormSubmissionAudit.create({
        data: {
          tenantId: args.tenantId,
          submissionId: submission.id,
          action: 'sent',
          definitionId: submission.definitionId,
          definitionVersion: submission.definition.version,
          schemaSnapshot: submission.definition.schema as object,
          answersSnapshot: submission.answers as object,
          ip: null,
          userAgent: null,
        },
      });

      return {
        url: `${baseUrl}/forms/${mintResult.rawToken}`,
        updatedSubmission: updated,
        tokenId: mintResult.token.id,
      };
    },
  );

  // 6. Stub the dispatch. TODO(epic-8): wire real Postmark / TextLink.
  const channels: ('email' | 'sms')[] = [];
  const formTitle = submission.definition.title;
  const stubFields = {
    url,
    clientId: submission.clientId,
    submissionId: submission.id,
    tenantId: args.tenantId,
    formTitle,
    tokenId,
    resend: isResend,
  };

  const log = args.log;

  if (resolvedChannel === 'email' || resolvedChannel === 'both') {
    if (submission.client?.email) {
      channels.push('email');
      log?.info(
        { ...stubFields, channel: 'email' },
        'STUB: would send form magic link',
      );
    } else {
      log?.warn(
        { ...stubFields, channel: 'email' },
        'STUB: form magic-link skipped (channel=email, no client email)',
      );
    }
  }

  if (resolvedChannel === 'sms' || resolvedChannel === 'both') {
    if (submission.client?.phone) {
      channels.push('sms');
      log?.info(
        { ...stubFields, channel: 'sms' },
        'STUB: would send form magic link',
      );
    } else {
      log?.warn(
        { ...stubFields, channel: 'sms' },
        'STUB: form magic-link skipped (channel=sms, no client phone)',
      );
    }
  }

  // 'kiosk' / 'admin_only' / 'inline_booking' — no dispatch, URL returned.

  return {
    submission: updatedSubmission,
    url,
    channels,
    resolvedChannel,
  };
}

// ----- cancelSubmission -----

export interface CancelSubmissionArgs {
  tenantId: string;
  actorUserId: string;
  submissionId: string;
  reason?: string;
}

export async function cancelSubmission(
  prisma: ExtendedPrismaClient,
  args: CancelSubmissionArgs,
): Promise<{ submission: IntakeFormSubmission }> {
  const existing = await prisma.intakeFormSubmission.findFirst({
    where: { id: args.submissionId, tenantId: args.tenantId },
    include: { definition: true },
  });
  if (!existing) {
    throw new IntakeFormSubmissionNotFoundError(args.submissionId);
  }

  if (isTerminalStatus(existing.status)) {
    throw new IntakeFormSubmissionNotCancellableError(existing.status);
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Revoke any active magic-link tokens for this submission.
    await tx.magicLinkToken.updateMany({
      where: {
        intakeFormSubmissionId: existing.id,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    const submission = await tx.intakeFormSubmission.update({
      where: { id: existing.id },
      data: { status: 'cancelled' },
    });

    await tx.intakeFormSubmissionAudit.create({
      data: {
        tenantId: args.tenantId,
        submissionId: existing.id,
        action: 'cancelled',
        definitionId: existing.definitionId,
        definitionVersion: existing.definition.version,
        schemaSnapshot: existing.definition.schema as object,
        answersSnapshot: existing.answers as object,
        ip: null,
        userAgent: null,
      },
    });

    return submission;
  });

  return { submission: updated };
}

// ----- helpers -----

function resolveChannel(args: {
  requested?: FormDeliveryChannel;
  stored?: FormDeliveryChannel | string;
  client: Client | null;
}): FormDeliveryChannel {
  if (args.requested) return args.requested;
  if (args.stored && args.stored !== 'admin_only') {
    return args.stored as FormDeliveryChannel;
  }
  if (args.client?.email) return 'email';
  if (args.client?.phone) return 'sms';
  return 'admin_only';
}

function resolveExpiry(args: {
  storedExpiresAt: Date | null;
  appointment: Appointment | null;
}): Date {
  if (args.storedExpiresAt) return args.storedExpiresAt;
  if (args.appointment?.scheduledStartAt) {
    const t = new Date(args.appointment.scheduledStartAt);
    t.setMinutes(t.getMinutes() + 30);
    return t;
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 7);
  return fallback;
}
