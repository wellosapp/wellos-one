// Forms System PR 9 — provider review queue + review state machine.
//
// Backs /admin/form-review/* routes. The review track is opt-in per
// FormAssignmentRule: when a rule has requireProviderReview=true, every
// submission produced by that rule is auto-set to review_status='unreviewed'
// on submit (see publicFormService.submitSubmission). Reviewers move the
// row through the four verdict states via reviewSubmission below.
//
// Allowed review_status transitions (CHECK enforced at the DB layer):
//   null              → no review track applies (default for non-reviewed forms)
//   'unreviewed'      → in queue, awaiting reviewer
//   'reviewed'        → reviewer acknowledged without verdict
//   'requires_follow_up' → reviewer flagged for client follow-up
//   'approved'        → reviewer approved
//   'denied'          → reviewer denied
//
// Transitions are unconstrained once the row has any non-null review_status:
// requires_follow_up → approved (after client provides info), approved → denied
// (mistake caught), etc. Every transition writes an IntakeFormSubmissionAudit
// row.
//
// Audit-action enum from PR 6 only has 'reviewed' | 'approved' | 'denied' —
// 'requires_follow_up' maps to action='reviewed' with the decision distinguished
// in the metadata snapshot. PR 11 may add a dedicated action; not needed yet.

import { Prisma } from '@prisma/client';
import type {
  IntakeFormSubmission,
  IntakeFormDefinition,
  Client,
  Appointment,
  Service,
} from '@prisma/client';

import type { ExtendedPrismaClient, ExtendedTransactionClient } from '../db/client.js';

// ----- types -----

export type ReviewDecision =
  | 'reviewed'
  | 'requires_follow_up'
  | 'approved'
  | 'denied';

export type ReviewStatusFilter =
  | 'unreviewed'
  | 'reviewed'
  | 'requires_follow_up'
  | 'approved'
  | 'denied'
  | 'all';

export interface ReviewQueueRow {
  id: string;
  definitionId: string;
  definitionTitle: string;
  definitionFormType: string | null;
  clientId: string | null;
  clientName: string | null;
  appointmentId: string | null;
  appointmentScheduledStartAt: string | null;
  appointmentServiceId: string | null;
  appointmentServiceName: string | null;
  submittedAt: string | null;
  reviewStatus: string;
  reviewedAt: string | null;
  reviewedByStaffName: string | null;
  hasSignature: boolean;
}

export interface ListSubmissionsForReviewArgs {
  tenantId: string;
  /** Filter by review state. Default 'unreviewed' (the queue). 'all' includes every state. */
  reviewStatus?: ReviewStatusFilter;
  formType?: string;
  /** base64-encoded { id, updatedAt } */
  cursor?: string;
  /** default 50, max 200 */
  take?: number;
}

export interface ListSubmissionsForReviewResult {
  submissions: ReviewQueueRow[];
  cursor: string | null;
}

export interface AuditTimelineEntry {
  id: string;
  action: string;
  createdAt: string;
  ip: string | null;
  userAgent: string | null;
}

export interface GetSubmissionForReviewResult {
  submission: {
    id: string;
    tenantId: string;
    definitionId: string;
    clientId: string | null;
    appointmentId: string | null;
    answers: Record<string, unknown>;
    status: string;
    submittedAt: string | null;
    openedAt: string | null;
    startedAt: string | null;
    expiresAt: string | null;
    deliveryChannel: string | null;
    signatureData: unknown;
    reviewStatus: string | null;
    reviewedAt: string | null;
    reviewedByStaffId: string | null;
    reviewedByStaffName: string | null;
    reviewNotes: string | null;
    createdAt: string;
    updatedAt: string;
  };
  definition: {
    id: string;
    title: string;
    description: string | null;
    formType: string | null;
    schema: unknown;
    version: number;
    status: string;
  };
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  appointment: {
    id: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    state: string;
    staffId: string;
  } | null;
  service: {
    id: string;
    name: string;
  } | null;
  fileUploads: Array<{
    id: string;
    fieldKey: string;
    mediaAssetId: string;
    mediaAssetUrl: string | null;
  }>;
  audits: AuditTimelineEntry[];
}

export interface ReviewSubmissionArgs {
  tenantId: string;
  actorUserId: string;
  /** Resolved Staff row id when the actor has one; null otherwise (admin without staff profile). */
  actorStaffId: string | null;
  submissionId: string;
  decision: ReviewDecision;
  notes?: string;
}

// ----- errors -----

export class IntakeFormSubmissionNotFoundForReviewError extends Error {
  readonly code = 'INTAKE_FORM_SUBMISSION_NOT_FOUND' as const;
  constructor(public submissionId: string) {
    super(`Submission ${submissionId} not found`);
    this.name = 'IntakeFormSubmissionNotFoundForReviewError';
  }
}

export class IntakeFormSubmissionNotReviewableError extends Error {
  readonly code = 'INTAKE_FORM_SUBMISSION_NOT_REVIEWABLE' as const;
  constructor(public status: string) {
    super(`Submission in status '${status}' is not reviewable`);
    this.name = 'IntakeFormSubmissionNotReviewableError';
  }
}

// ----- helpers -----

interface CursorPayload {
  id: string;
  updatedAt: string;
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): CursorPayload | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<CursorPayload>;
    if (typeof parsed.id !== 'string' || typeof parsed.updatedAt !== 'string') {
      return null;
    }
    return { id: parsed.id, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

function clientDisplayName(c: Pick<Client, 'firstName' | 'lastName'> | null): string | null {
  if (!c) return null;
  const parts = [c.firstName, c.lastName].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  return parts.length > 0 ? parts.join(' ') : null;
}

function staffDisplayName(
  s: { firstName: string | null; lastName: string | null } | null,
): string | null {
  if (!s) return null;
  const parts = [s.firstName, s.lastName].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  return parts.length > 0 ? parts.join(' ') : null;
}

// ----- listSubmissionsForReview -----

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

export async function listSubmissionsForReview(
  prisma: ExtendedPrismaClient,
  args: ListSubmissionsForReviewArgs,
): Promise<ListSubmissionsForReviewResult> {
  const take = Math.min(Math.max(args.take ?? DEFAULT_TAKE, 1), MAX_TAKE);
  const filter: ReviewStatusFilter = args.reviewStatus ?? 'unreviewed';

  // Queue eligibility: status='submitted' AND review_status matches.
  // 'all' returns every review-track row (review_status not null).
  const where: Prisma.IntakeFormSubmissionWhereInput = {
    tenantId: args.tenantId,
    status: 'submitted',
  };
  if (filter === 'all') {
    where.reviewStatus = { not: null };
  } else {
    where.reviewStatus = filter;
  }

  if (args.formType) {
    where.definition = { formType: args.formType };
  }

  // Cursor: order by updatedAt desc, id desc as tiebreaker. Decoded cursor
  // values become a strict "less than" bound so we don't re-emit the seen row.
  if (args.cursor) {
    const decoded = decodeCursor(args.cursor);
    if (decoded) {
      where.OR = [
        { updatedAt: { lt: new Date(decoded.updatedAt) } },
        {
          updatedAt: new Date(decoded.updatedAt),
          id: { lt: decoded.id },
        },
      ];
    }
  }

  const rows = await prisma.intakeFormSubmission.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: take + 1, // peek one extra to know if a next page exists
    include: {
      definition: { select: { id: true, title: true, formType: true } },
      client: { select: { id: true, firstName: true, lastName: true } },
      appointment: {
        select: {
          id: true,
          scheduledStartAt: true,
          serviceId: true,
          service: { select: { id: true, name: true } },
        },
      },
      reviewedByStaff: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const hasNext = rows.length > take;
  const sliced = hasNext ? rows.slice(0, take) : rows;
  const last = sliced[sliced.length - 1];

  const submissions: ReviewQueueRow[] = sliced.map((r) => ({
    id: r.id,
    definitionId: r.definitionId,
    definitionTitle: r.definition.title,
    definitionFormType: r.definition.formType,
    clientId: r.clientId,
    clientName: clientDisplayName(r.client),
    appointmentId: r.appointmentId,
    appointmentScheduledStartAt:
      r.appointment?.scheduledStartAt?.toISOString() ?? null,
    appointmentServiceId: r.appointment?.serviceId ?? null,
    appointmentServiceName: r.appointment?.service?.name ?? null,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    reviewStatus: r.reviewStatus ?? 'unreviewed',
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewedByStaffName: staffDisplayName(r.reviewedByStaff),
    hasSignature: r.signatureData !== null && r.signatureData !== undefined,
  }));

  const cursor =
    hasNext && last
      ? encodeCursor({ id: last.id, updatedAt: last.updatedAt.toISOString() })
      : null;

  return { submissions, cursor };
}

// ----- getSubmissionForReview -----

export async function getSubmissionForReview(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; submissionId: string },
): Promise<GetSubmissionForReviewResult> {
  const row = await prisma.intakeFormSubmission.findFirst({
    where: { id: args.submissionId, tenantId: args.tenantId },
    include: {
      definition: true,
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
      appointment: {
        select: {
          id: true,
          scheduledStartAt: true,
          scheduledEndAt: true,
          state: true,
          staffId: true,
          serviceId: true,
          service: { select: { id: true, name: true } },
        },
      },
      reviewedByStaff: { select: { id: true, firstName: true, lastName: true } },
      fileUploads: {
        select: {
          id: true,
          fieldKey: true,
          mediaAssetId: true,
          mediaAsset: { select: { objectKey: true } },
        },
      },
      audits: {
        select: {
          id: true,
          action: true,
          createdAt: true,
          ip: true,
          userAgent: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!row) {
    throw new IntakeFormSubmissionNotFoundForReviewError(args.submissionId);
  }

  const def = row.definition as IntakeFormDefinition;
  const appt = row.appointment as
    | (Pick<
        Appointment,
        'id' | 'scheduledStartAt' | 'scheduledEndAt' | 'state' | 'staffId' | 'serviceId'
      > & { service: Pick<Service, 'id' | 'name'> | null })
    | null;

  return {
    submission: {
      id: row.id,
      tenantId: row.tenantId,
      definitionId: row.definitionId,
      clientId: row.clientId,
      appointmentId: row.appointmentId,
      answers: (row.answers as Record<string, unknown>) ?? {},
      status: row.status,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      openedAt: row.openedAt?.toISOString() ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      deliveryChannel: row.deliveryChannel,
      signatureData: row.signatureData,
      reviewStatus: row.reviewStatus,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewedByStaffId: row.reviewedByStaffId,
      reviewedByStaffName: staffDisplayName(row.reviewedByStaff),
      reviewNotes: row.reviewNotes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
    definition: {
      id: def.id,
      title: def.title,
      description: def.description,
      formType: def.formType,
      schema: def.schema,
      version: def.version,
      status: def.status,
    },
    client: row.client
      ? {
          id: row.client.id,
          firstName: row.client.firstName,
          lastName: row.client.lastName,
          email: row.client.email,
          phone: row.client.phone,
        }
      : null,
    appointment: appt
      ? {
          id: appt.id,
          scheduledStartAt: appt.scheduledStartAt.toISOString(),
          scheduledEndAt: appt.scheduledEndAt.toISOString(),
          state: appt.state,
          staffId: appt.staffId,
        }
      : null,
    service: appt?.service ? { id: appt.service.id, name: appt.service.name } : null,
    fileUploads: row.fileUploads.map((f) => ({
      id: f.id,
      fieldKey: f.fieldKey,
      mediaAssetId: f.mediaAssetId,
      // Object key alone isn't a fetchable URL — the admin client will signed-URL via
      // /admin/media/:id when needed. PR 9 surfaces the key so the audit panel can show it.
      mediaAssetUrl: f.mediaAsset?.objectKey ?? null,
    })),
    audits: row.audits.map((a) => ({
      id: a.id,
      action: a.action,
      createdAt: a.createdAt.toISOString(),
      ip: a.ip,
      userAgent: a.userAgent,
    })),
  };
}

// ----- reviewSubmission -----

function decisionToReviewStatus(d: ReviewDecision): string {
  // 1:1 mapping today — kept explicit so a future decision rename (e.g. 'approve' verb)
  // doesn't silently corrupt the column.
  switch (d) {
    case 'approved':
      return 'approved';
    case 'denied':
      return 'denied';
    case 'requires_follow_up':
      return 'requires_follow_up';
    case 'reviewed':
      return 'reviewed';
  }
}

function decisionToAuditAction(
  d: ReviewDecision,
): 'approved' | 'denied' | 'reviewed' {
  // 'requires_follow_up' has no dedicated audit-action enum value — folds into
  // 'reviewed' with the decision distinguished in the metadata snapshot.
  if (d === 'approved') return 'approved';
  if (d === 'denied') return 'denied';
  return 'reviewed';
}

export async function reviewSubmission(
  prisma: ExtendedPrismaClient,
  args: ReviewSubmissionArgs,
): Promise<{ submission: IntakeFormSubmission }> {
  const existing = await prisma.intakeFormSubmission.findFirst({
    where: { id: args.submissionId, tenantId: args.tenantId },
    include: { definition: true },
  });
  if (!existing) {
    throw new IntakeFormSubmissionNotFoundForReviewError(args.submissionId);
  }

  if (existing.status !== 'submitted') {
    throw new IntakeFormSubmissionNotReviewableError(existing.status);
  }

  const nextReviewStatus = decisionToReviewStatus(args.decision);
  const auditAction = decisionToAuditAction(args.decision);
  const notes = args.notes ?? null;
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.intakeFormSubmission.update({
      where: { id: existing.id },
      data: {
        reviewStatus: nextReviewStatus,
        reviewedAt: now,
        reviewedByStaffId: args.actorStaffId,
        reviewNotes: notes,
      },
    });

    await tx.intakeFormSubmissionAudit.create({
      data: {
        tenantId: args.tenantId,
        submissionId: existing.id,
        action: auditAction,
        definitionId: existing.definitionId,
        definitionVersion: existing.definition.version,
        schemaSnapshot: existing.definition.schema as object,
        answersSnapshot: existing.answers as object,
        ip: null,
        userAgent: null,
      },
    });

    // Also write to the global audit log so super-admin review queries can
    // attribute the action to the user (not the staff row, which may be null).
    await tx.auditLog.create({
      data: {
        tenantId: args.tenantId,
        actorUserId: args.actorUserId,
        actorType: 'user',
        action: `intake_form_submission.${auditAction}`,
        entityType: 'intake_form_submission',
        entityId: existing.id,
        before: {
          reviewStatus: existing.reviewStatus,
          reviewedAt: existing.reviewedAt?.toISOString() ?? null,
          reviewedByStaffId: existing.reviewedByStaffId,
          reviewNotes: existing.reviewNotes,
        } as Prisma.InputJsonValue,
        after: {
          decision: args.decision,
          reviewStatus: nextReviewStatus,
          reviewedAt: now.toISOString(),
          reviewedByStaffId: args.actorStaffId,
          reviewNotes: notes,
        } as Prisma.InputJsonValue,
      },
    });

    return next;
  });

  return { submission: updated };
}

// ----- checkRequiresReview -----
//
// Called from publicFormService.submitSubmission to decide whether a fresh
// submission should land in the review queue. Returns true iff an active
// FormAssignmentRule exists for the (serviceId, definitionGroupId) pair with
// requireProviderReview=true. Lives here (not on formAssignmentRuleService)
// so the review domain owns the policy.

export async function checkRequiresReview(
  prisma: ExtendedPrismaClient | ExtendedTransactionClient,
  args: { tenantId: string; serviceId: string | null; definitionGroupId: string },
): Promise<boolean> {
  if (!args.serviceId) return false;
  const rule = await prisma.formAssignmentRule.findFirst({
    where: {
      tenantId: args.tenantId,
      serviceId: args.serviceId,
      formDefinitionGroupId: args.definitionGroupId,
      requireProviderReview: true,
      active: true,
    },
    select: { id: true },
  });
  return rule !== null;
}
