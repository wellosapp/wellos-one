// Public form completion service — PR 7 of the Forms System epic.
//
// Backs the four /public/forms/:token/* routes. Each function takes the
// `magicLinkAuth` payload from the requireMagicLinkAuthFromPath middleware
// (already verified + scope-eager-loaded). Tenant scoping derives from
// auth.token.tenantId — never trust the path/body for tenant identity.
//
// State machine moves implemented here:
//   sent          → opened          (on first GET — idempotent)
//   opened        → in_progress     (on first PATCH autosave — idempotent)
//   in_progress   → submitted       (on POST submit)
// Plus the time-based passive transition past expiresAt → expired (GET only).

import type {
  IntakeFormDefinition,
  IntakeFormSubmission,
  Client,
} from '@prisma/client';

import type { ExtendedPrismaClient } from '../db/client.js';
import {
  coerceSchema,
  schemaRequiresSignature,
  validateAnswers,
  type FieldError,
} from '../lib/formValidation.js';
import { checkRequiresReview } from './formReviewService.js';

// Terminal states — no further mutations allowed on the public surface.
const TERMINAL_STATUSES = new Set(['submitted', 'expired', 'cancelled']);

export class SubmissionTerminalError extends Error {
  code = 'SUBMISSION_TERMINAL' as const;
  status: number;
  constructor(public submissionStatus: string) {
    super(`Submission is in terminal status '${submissionStatus}'`);
    this.name = 'SubmissionTerminalError';
    // 410 Gone for expired/cancelled; 409 Conflict for already-submitted —
    // already-submitted is "you already did this" rather than "this is dead".
    this.status =
      submissionStatus === 'expired' || submissionStatus === 'cancelled'
        ? 410
        : 409;
  }
}

export class SubmissionValidationError extends Error {
  code = 'VALIDATION_FAILED' as const;
  status = 422 as const;
  constructor(public fieldErrors: FieldError[]) {
    super('Form validation failed.');
    this.name = 'SubmissionValidationError';
  }
}

export class SignatureMissingError extends Error {
  code = 'SIGNATURE_REQUIRED' as const;
  status = 422 as const;
  constructor() {
    super('Signature is required to submit this form.');
    this.name = 'SignatureMissingError';
  }
}

// ---------- Helpers ----------

function isExpired(submission: IntakeFormSubmission): boolean {
  return (
    submission.expiresAt !== null &&
    submission.expiresAt.getTime() < Date.now()
  );
}

async function markExpired(
  prisma: ExtendedPrismaClient,
  submission: IntakeFormSubmission & { definition: IntakeFormDefinition },
): Promise<IntakeFormSubmission> {
  // Idempotent — only transition if not already terminal.
  if (TERMINAL_STATUSES.has(submission.status)) return submission;
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.intakeFormSubmission.update({
      where: { id: submission.id },
      data: { status: 'expired' },
    });
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
    // Revoke any active magic-link tokens so the link stops working.
    await tx.magicLinkToken.updateMany({
      where: {
        intakeFormSubmissionId: submission.id,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return next;
  });
  return updated;
}

async function loadTenantName(
  prisma: ExtendedPrismaClient,
  tenantId: string,
): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  return tenant?.name ?? 'Wellos';
}

function clientForDisplay(
  client: Client | null,
): { id: string; firstName: string; lastName: string | null; email: string | null } | null {
  if (!client) return null;
  return {
    id: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    email: client.email,
  };
}

// ---------- getSubmissionForView ----------
//
// Loads + serializes the submission for the public renderer. Transitions
//   sent → opened
// (idempotent — second hit no-ops). Detects expiry and transitions
//   * → expired
// when applicable, then throws SubmissionTerminalError so the route
// can return 410.

export interface GetPublicSubmissionResult {
  submission: {
    id: string;
    status: string;
    answers: Record<string, unknown>;
    expiresAt: string | null;
    submittedAt: string | null;
    deliveryChannel: string | null;
    updatedAt: string;
  };
  definition: {
    id: string;
    title: string;
    description: string | null;
    schema: unknown;
    formType: string | null;
    version: number;
  };
  client: ReturnType<typeof clientForDisplay>;
  tenantName: string;
}

export async function getSubmissionForView(
  prisma: ExtendedPrismaClient,
  args: {
    submission: IntakeFormSubmission & { definition: IntakeFormDefinition };
    client: Client | null;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<GetPublicSubmissionResult> {
  let submission = args.submission;

  // Passive expiry — past expiresAt and not yet marked terminal.
  if (isExpired(submission) && !TERMINAL_STATUSES.has(submission.status)) {
    const updated = await markExpired(prisma, submission);
    submission = { ...submission, ...updated };
    throw new SubmissionTerminalError('expired');
  }

  if (TERMINAL_STATUSES.has(submission.status) && submission.status !== 'submitted') {
    // expired / cancelled — caller handles via 410.
    throw new SubmissionTerminalError(submission.status);
  }

  // First-open transition. submitted forms re-render in read-only mode and
  // skip the audit row (already-submitted has its own audit history).
  if (submission.status === 'sent') {
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.intakeFormSubmission.update({
        where: { id: submission.id },
        data: { status: 'opened', openedAt: new Date() },
      });
      await tx.intakeFormSubmissionAudit.create({
        data: {
          tenantId: submission.tenantId,
          submissionId: submission.id,
          action: 'opened',
          definitionId: submission.definitionId,
          definitionVersion: submission.definition.version,
          schemaSnapshot: submission.definition.schema as object,
          answersSnapshot: submission.answers as object,
          ip: args.ip,
          userAgent: args.userAgent,
        },
      });
      return next;
    });
    submission = { ...submission, ...updated };
  }

  const tenantName = await loadTenantName(prisma, submission.tenantId);

  return {
    submission: {
      id: submission.id,
      status: submission.status,
      answers: (submission.answers as Record<string, unknown>) ?? {},
      expiresAt: submission.expiresAt?.toISOString() ?? null,
      submittedAt: submission.submittedAt?.toISOString() ?? null,
      deliveryChannel: submission.deliveryChannel,
      updatedAt: submission.updatedAt.toISOString(),
    },
    definition: {
      id: args.submission.definition.id,
      title: args.submission.definition.title,
      description: args.submission.definition.description,
      schema: args.submission.definition.schema,
      formType: args.submission.definition.formType,
      version: args.submission.definition.version,
    },
    client: clientForDisplay(args.client),
    tenantName,
  };
}

// ---------- autosaveSubmission ----------
//
// PATCH endpoint. Merges body.answers into the stored answers (shallow,
// per-fieldId). Transitions
//   sent / opened → in_progress
// on first call. Subsequent calls are pure updates.

export interface AutosaveResult {
  submission: {
    id: string;
    status: string;
    updatedAt: string;
  };
}

export async function autosaveSubmission(
  prisma: ExtendedPrismaClient,
  args: {
    submission: IntakeFormSubmission & { definition: IntakeFormDefinition };
    answers: Record<string, unknown>;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<AutosaveResult> {
  const { submission } = args;

  if (TERMINAL_STATUSES.has(submission.status)) {
    throw new SubmissionTerminalError(submission.status);
  }

  const previousAnswers =
    (submission.answers as Record<string, unknown>) ?? {};
  const mergedAnswers = { ...previousAnswers, ...args.answers };

  const isFirstInteraction =
    submission.status === 'sent' || submission.status === 'opened';

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.intakeFormSubmission.update({
      where: { id: submission.id },
      data: {
        answers: mergedAnswers,
        ...(isFirstInteraction
          ? { status: 'in_progress', startedAt: new Date() }
          : {}),
      },
    });
    if (isFirstInteraction) {
      await tx.intakeFormSubmissionAudit.create({
        data: {
          tenantId: submission.tenantId,
          submissionId: submission.id,
          action: 'started',
          definitionId: submission.definitionId,
          definitionVersion: submission.definition.version,
          schemaSnapshot: submission.definition.schema as object,
          answersSnapshot: mergedAnswers,
          ip: args.ip,
          userAgent: args.userAgent,
        },
      });
    }
    return next;
  });

  return {
    submission: {
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    },
  };
}

// ---------- submitSubmission ----------
//
// Final submit. Validates the answers server-side (mirror of the client
// validation), captures the signature blob, transitions to `submitted`,
// audits, and revokes any active magic-link tokens scoped to this
// submission so the link can't be reused.

export interface SubmitSignaturePayload {
  imageBase64?: string;
  typedSignature?: string;
}

export interface SubmitResult {
  submission: {
    id: string;
    status: string;
    submittedAt: string | null;
  };
  confirmation: {
    formTitle: string;
    clientFirstName: string | null;
  };
}

export async function submitSubmission(
  prisma: ExtendedPrismaClient,
  args: {
    submission: IntakeFormSubmission & { definition: IntakeFormDefinition };
    client: Client | null;
    answers: Record<string, unknown>;
    signatureData?: SubmitSignaturePayload | null;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<SubmitResult> {
  const { submission, client } = args;

  if (TERMINAL_STATUSES.has(submission.status)) {
    throw new SubmissionTerminalError(submission.status);
  }

  const schema = coerceSchema(submission.definition.schema);
  const errors = validateAnswers(schema, args.answers);
  if (errors.length > 0) {
    throw new SubmissionValidationError(errors);
  }

  const signatureRequired = schemaRequiresSignature(schema, args.answers);
  if (signatureRequired) {
    const hasImage =
      args.signatureData?.imageBase64 &&
      args.signatureData.imageBase64.length > 0;
    const hasTyped =
      args.signatureData?.typedSignature &&
      args.signatureData.typedSignature.trim().length > 0;
    if (!hasImage && !hasTyped) {
      throw new SignatureMissingError();
    }
  }

  // Build the signature blob with full audit context. Stored on the
  // submission row — recoverable for PR 9 (provider review) + PR 12 (PDF).
  const signatureBlob = signatureRequired
    ? {
        ...(args.signatureData?.imageBase64
          ? { imageBase64: args.signatureData.imageBase64 }
          : {}),
        ...(args.signatureData?.typedSignature
          ? { typedSignature: args.signatureData.typedSignature.trim() }
          : {}),
        signedAt: new Date().toISOString(),
        ip: args.ip,
        userAgent: args.userAgent,
        formVersion: submission.definition.version,
      }
    : null;

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.intakeFormSubmission.update({
      where: { id: submission.id },
      data: {
        status: 'submitted',
        submittedAt: new Date(),
        answers: args.answers,
        ...(signatureBlob ? { signatureData: signatureBlob } : {}),
      },
    });
    await tx.intakeFormSubmissionAudit.create({
      data: {
        tenantId: submission.tenantId,
        submissionId: submission.id,
        action: 'submitted',
        definitionId: submission.definitionId,
        definitionVersion: submission.definition.version,
        schemaSnapshot: submission.definition.schema as object,
        answersSnapshot: args.answers,
        ip: args.ip,
        userAgent: args.userAgent,
      },
    });
    // Revoke active tokens — the link is single-use post-submit.
    await tx.magicLinkToken.updateMany({
      where: {
        intakeFormSubmissionId: submission.id,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    // Forms System PR 9 — auto-enroll in the review queue when the
    // originating rule has requireProviderReview=true. Submissions without
    // an appointment (admin-sent for a client outside any booking) skip the
    // lookup; review_status stays null and the row never lands in the queue.
    let appointmentServiceId: string | null = null;
    if (submission.appointmentId) {
      const appt = await tx.appointment.findFirst({
        where: { id: submission.appointmentId, tenantId: submission.tenantId },
        select: { serviceId: true },
      });
      appointmentServiceId = appt?.serviceId ?? null;
    }
    const requiresReview = await checkRequiresReview(tx, {
      tenantId: submission.tenantId,
      serviceId: appointmentServiceId,
      definitionGroupId: submission.definition.groupId,
    });
    if (requiresReview) {
      const reviewed = await tx.intakeFormSubmission.update({
        where: { id: submission.id },
        data: { reviewStatus: 'unreviewed' },
      });
      return reviewed;
    }
    return next;
  });

  return {
    submission: {
      id: updated.id,
      status: updated.status,
      submittedAt: updated.submittedAt?.toISOString() ?? null,
    },
    confirmation: {
      formTitle: submission.definition.title,
      clientFirstName: client?.firstName ?? null,
    },
  };
}
