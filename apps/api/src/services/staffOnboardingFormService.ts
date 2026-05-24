import { Prisma } from '@prisma/client';
import type {
  StaffOnboardingFormDefinition,
  StaffOnboardingFormDefinitionStatus,
  StaffOnboardingFormSubmission,
} from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';

// Audit entityType for definition-level mutations. Distinct from intake's
// surface so the audit log clearly identifies which catalog the change came
// from.
const DEFINITION_AUDIT_ENTITY = 'staff_onboarding_form_definition';

// Mirror of intakeFormService but staff-keyed. Submissions are not appointment-
// scoped. Audit lifecycle covers created → updated* → submitted.

export class StaffOnboardingFormNotFoundError extends Error {
  readonly code = 'STAFF_ONBOARDING_FORM_NOT_FOUND';
  constructor(message = 'Staff onboarding form record not found.') {
    super(message);
    this.name = 'StaffOnboardingFormNotFoundError';
  }
}

export class StaffOnboardingFormStateError extends Error {
  readonly code = 'STAFF_ONBOARDING_FORM_INVALID_STATE';
  constructor(message: string) {
    super(message);
    this.name = 'StaffOnboardingFormStateError';
  }
}

export class StaffOnboardingFormReferenceError extends Error {
  readonly code = 'STAFF_ONBOARDING_FORM_REFERENCE';
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'StaffOnboardingFormReferenceError';
  }
}

type ListDefinitionsQuery = {
  status?: StaffOnboardingFormDefinitionStatus;
};

export async function listStaffOnboardingFormDefinitions(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; query: ListDefinitionsQuery },
): Promise<{ definitions: StaffOnboardingFormDefinition[] }> {
  const { tenantId, query } = args;
  const where: {
    tenantId: string;
    status?: StaffOnboardingFormDefinitionStatus;
    isActive?: boolean;
  } = { tenantId };
  if (query.status) where.status = query.status;
  if (query.status === 'published') {
    where.isActive = true;
  }

  const definitions = await prisma.staffOnboardingFormDefinition.findMany({
    where,
    orderBy: [{ groupId: 'asc' }, { version: 'desc' }],
  });
  return { definitions };
}

export async function getStaffOnboardingFormDefinition(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; id: string },
): Promise<StaffOnboardingFormDefinition | null> {
  return prisma.staffOnboardingFormDefinition.findFirst({
    where: { id: args.id, tenantId: args.tenantId },
  });
}

// ---- Definition CRUD (admin-only) ----------------------------------------
//
// Mirrors intakeFormService for the equivalent operations (create, update,
// publish). Adds explicit createNextVersion + archive helpers that intake
// inlines into create / leaves to a follow-up. Every mutation also writes
// an AuditLog row keyed by `entityType=staff_onboarding_form_definition`
// so the change history is queryable from the activity surface.

async function writeDefinitionAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string | null;
    action: 'created' | 'updated' | 'versioned' | 'published' | 'archived';
    entityId: string;
    before: StaffOnboardingFormDefinition | null;
    after: StaffOnboardingFormDefinition | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: args.actorUserId ? 'user' : 'system',
      action: args.action,
      entityType: DEFINITION_AUDIT_ENTITY,
      entityId: args.entityId,
      before: args.before
        ? (args.before as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      after: args.after
        ? (args.after as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

export async function createStaffOnboardingFormDefinition(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string | null;
    title: string;
    schema: unknown;
    groupId?: string;
  },
): Promise<{ definition: StaffOnboardingFormDefinition }> {
  const { tenantId, title, schema } = args;
  let groupId = args.groupId;
  let version = 1;

  if (groupId) {
    const agg = await prisma.staffOnboardingFormDefinition.aggregate({
      where: { tenantId, groupId },
      _max: { version: true },
    });
    const maxV = agg._max.version;
    if (maxV === null) {
      throw new StaffOnboardingFormReferenceError(
        'groupId',
        'Unknown form group for this tenant.',
      );
    }
    version = maxV + 1;
  } else {
    groupId = crypto.randomUUID();
  }

  const definition = await prisma.$transaction(async (tx) => {
    const created = await tx.staffOnboardingFormDefinition.create({
      data: {
        tenantId,
        groupId,
        title,
        schema: schema as object,
        version,
        status: 'draft',
      },
    });
    await writeDefinitionAudit(tx, {
      tenantId,
      actorUserId: args.actorUserId,
      action: 'created',
      entityId: created.id,
      before: null,
      after: created,
    });
    return created;
  });
  return { definition };
}

export async function updateStaffOnboardingFormDefinition(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string | null;
    id: string;
    title?: string;
    schema?: unknown;
    isActive?: boolean;
  },
): Promise<{ definition: StaffOnboardingFormDefinition }> {
  const existing = await prisma.staffOnboardingFormDefinition.findFirst({
    where: { id: args.id, tenantId: args.tenantId },
  });
  if (!existing) throw new StaffOnboardingFormNotFoundError();
  if (existing.status !== 'draft') {
    throw new StaffOnboardingFormStateError(
      'Only draft definitions can be edited.',
    );
  }

  const definition = await prisma.$transaction(async (tx) => {
    const updated = await tx.staffOnboardingFormDefinition.update({
      where: { id: existing.id },
      data: {
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(args.schema !== undefined ? { schema: args.schema as object } : {}),
        ...(args.isActive !== undefined ? { isActive: args.isActive } : {}),
      },
    });
    await writeDefinitionAudit(tx, {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      action: 'updated',
      entityId: updated.id,
      before: existing,
      after: updated,
    });
    return updated;
  });
  return { definition };
}

// Read the current row, copy title + schema, increment version, write the
// result as a new draft in the same group_id family. Used by admins who want
// to revise a published version — they call this, then edit the new draft,
// then publish (which auto-archives the previous published version).
export async function createNextVersionStaffOnboardingFormDefinition(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; actorUserId: string | null; id: string },
): Promise<{ definition: StaffOnboardingFormDefinition }> {
  const source = await prisma.staffOnboardingFormDefinition.findFirst({
    where: { id: args.id, tenantId: args.tenantId },
  });
  if (!source) throw new StaffOnboardingFormNotFoundError();

  const agg = await prisma.staffOnboardingFormDefinition.aggregate({
    where: { tenantId: args.tenantId, groupId: source.groupId },
    _max: { version: true },
  });
  const nextVersion = (agg._max.version ?? source.version) + 1;

  const definition = await prisma.$transaction(async (tx) => {
    const created = await tx.staffOnboardingFormDefinition.create({
      data: {
        tenantId: args.tenantId,
        groupId: source.groupId,
        title: source.title,
        schema: source.schema as object,
        version: nextVersion,
        status: 'draft',
      },
    });
    await writeDefinitionAudit(tx, {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      action: 'versioned',
      entityId: created.id,
      before: source,
      after: created,
    });
    return created;
  });
  return { definition };
}

export async function publishStaffOnboardingFormDefinition(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; actorUserId: string | null; id: string },
): Promise<{ definition: StaffOnboardingFormDefinition }> {
  const existing = await prisma.staffOnboardingFormDefinition.findFirst({
    where: { id: args.id, tenantId: args.tenantId },
  });
  if (!existing) throw new StaffOnboardingFormNotFoundError();
  if (existing.status !== 'draft') {
    throw new StaffOnboardingFormStateError(
      'Only a draft definition can be published.',
    );
  }

  const definition = await prisma.$transaction(async (tx) => {
    await tx.staffOnboardingFormDefinition.updateMany({
      where: {
        tenantId: args.tenantId,
        groupId: existing.groupId,
        status: 'published',
      },
      data: { status: 'archived' },
    });
    const updated = await tx.staffOnboardingFormDefinition.update({
      where: { id: existing.id },
      data: { status: 'published' },
    });
    await writeDefinitionAudit(tx, {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      action: 'published',
      entityId: updated.id,
      before: existing,
      after: updated,
    });
    return updated;
  });
  return { definition };
}

export async function archiveStaffOnboardingFormDefinition(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; actorUserId: string | null; id: string },
): Promise<{ definition: StaffOnboardingFormDefinition }> {
  const existing = await prisma.staffOnboardingFormDefinition.findFirst({
    where: { id: args.id, tenantId: args.tenantId },
  });
  if (!existing) throw new StaffOnboardingFormNotFoundError();
  if (existing.status === 'archived') {
    throw new StaffOnboardingFormStateError(
      'Definition is already archived.',
    );
  }

  const definition = await prisma.$transaction(async (tx) => {
    const updated = await tx.staffOnboardingFormDefinition.update({
      where: { id: existing.id },
      data: { status: 'archived' },
    });
    await writeDefinitionAudit(tx, {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      action: 'archived',
      entityId: updated.id,
      before: existing,
      after: updated,
    });
    return updated;
  });
  return { definition };
}

async function requirePublishedDefinition(
  prisma: ExtendedPrismaClient,
  tenantId: string,
  definitionId: string,
): Promise<StaffOnboardingFormDefinition> {
  const def = await prisma.staffOnboardingFormDefinition.findFirst({
    where: { id: definitionId, tenantId, status: 'published', isActive: true },
  });
  if (!def) {
    throw new StaffOnboardingFormReferenceError(
      'definitionId',
      'Published, active staff onboarding form definition not found.',
    );
  }
  return def;
}

async function assertStaffBelongsToTenant(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; staffId: string },
): Promise<void> {
  // softDeleteExtension auto-filters deletedAt:null.
  const staff = await prisma.staff.findFirst({
    where: { id: args.staffId, tenantId: args.tenantId },
    select: { id: true },
  });
  if (!staff) {
    throw new StaffOnboardingFormReferenceError('staffId', 'Staff not found.');
  }
}

export async function listStaffOnboardingSubmissions(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; staffId: string },
): Promise<{
  submissions: Array<
    StaffOnboardingFormSubmission & {
      definition: { id: string; title: string; version: number };
    }
  >;
}> {
  const submissions = await prisma.staffOnboardingFormSubmission.findMany({
    where: { tenantId: args.tenantId, staffId: args.staffId },
    include: {
      definition: {
        select: { id: true, title: true, version: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return { submissions };
}

export async function getStaffOnboardingSubmission(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; staffId: string; id: string },
): Promise<{
  submission: StaffOnboardingFormSubmission;
  definition: StaffOnboardingFormDefinition;
} | null> {
  const row = await prisma.staffOnboardingFormSubmission.findFirst({
    where: { id: args.id, tenantId: args.tenantId, staffId: args.staffId },
    include: { definition: true },
  });
  if (!row) return null;
  const { definition, ...submission } = row;
  return { submission, definition };
}

export async function createStaffOnboardingSubmission(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    staffId: string;
    definitionId: string;
    answers?: Record<string, unknown>;
    ip: string | null;
    userAgent: string | null;
  },
): Promise<{ submission: StaffOnboardingFormSubmission }> {
  const def = await requirePublishedDefinition(
    prisma,
    args.tenantId,
    args.definitionId,
  );
  await assertStaffBelongsToTenant(prisma, {
    tenantId: args.tenantId,
    staffId: args.staffId,
  });

  const initialAnswers = args.answers ?? {};

  const submission = await prisma.$transaction(async (tx) => {
    const created = await tx.staffOnboardingFormSubmission.create({
      data: {
        tenantId: args.tenantId,
        staffId: args.staffId,
        definitionId: args.definitionId,
        answers: initialAnswers as object,
        status: 'draft',
      },
    });
    await tx.staffOnboardingFormSubmissionAudit.create({
      data: {
        tenantId: args.tenantId,
        submissionId: created.id,
        action: 'created',
        definitionId: def.id,
        definitionVersion: def.version,
        schemaSnapshot: def.schema as object,
        answersSnapshot: initialAnswers as object,
        ip: args.ip,
        userAgent: args.userAgent,
      },
    });
    return created;
  });
  return { submission };
}

export async function patchStaffOnboardingSubmission(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    staffId: string;
    id: string;
    answers?: Record<string, unknown>;
    status?: 'submitted';
    ip: string | null;
    userAgent: string | null;
  },
): Promise<{ submission: StaffOnboardingFormSubmission }> {
  const existing = await prisma.staffOnboardingFormSubmission.findFirst({
    where: {
      id: args.id,
      tenantId: args.tenantId,
      staffId: args.staffId,
    },
  });
  if (!existing) {
    throw new StaffOnboardingFormNotFoundError('Submission not found.');
  }

  if (existing.status === 'submitted') {
    // Idempotent re-submit returns the existing row; any other mutation is
    // refused — submitted forms are locked.
    if (args.status === 'submitted' && args.answers === undefined) {
      return { submission: existing };
    }
    throw new StaffOnboardingFormStateError(
      'Submitted staff onboarding forms cannot be edited.',
    );
  }

  if (args.status === 'submitted') {
    const def = await prisma.staffOnboardingFormDefinition.findFirst({
      where: { id: existing.definitionId, tenantId: args.tenantId },
    });
    if (!def || def.status !== 'published') {
      throw new StaffOnboardingFormStateError(
        'Cannot submit against an unpublished form version.',
      );
    }

    const answers =
      args.answers !== undefined
        ? args.answers
        : (existing.answers as Record<string, unknown>);

    const submission = await prisma.$transaction(async (tx) => {
      const updated = await tx.staffOnboardingFormSubmission.update({
        where: { id: existing.id },
        data: {
          answers: answers as object,
          status: 'submitted',
          submittedAt: new Date(),
        },
      });
      await tx.staffOnboardingFormSubmissionAudit.create({
        data: {
          tenantId: args.tenantId,
          submissionId: updated.id,
          action: 'submitted',
          definitionId: def.id,
          definitionVersion: def.version,
          schemaSnapshot: def.schema as object,
          answersSnapshot: answers as object,
          ip: args.ip,
          userAgent: args.userAgent,
        },
      });
      return updated;
    });
    return { submission };
  }

  // Answers-only update on a draft. Write an audit row with the snapshot so
  // the compliance trail captures every change the staff member made.
  if (args.answers === undefined) {
    return { submission: existing };
  }

  const def = await prisma.staffOnboardingFormDefinition.findFirst({
    where: { id: existing.definitionId, tenantId: args.tenantId },
  });
  if (!def) {
    // Shouldn't happen — FK is RESTRICT — but guard anyway.
    throw new StaffOnboardingFormStateError(
      'Definition for this submission is missing.',
    );
  }

  const submission = await prisma.$transaction(async (tx) => {
    const updated = await tx.staffOnboardingFormSubmission.update({
      where: { id: existing.id },
      data: { answers: args.answers as object },
    });
    await tx.staffOnboardingFormSubmissionAudit.create({
      data: {
        tenantId: args.tenantId,
        submissionId: updated.id,
        action: 'updated',
        definitionId: def.id,
        definitionVersion: def.version,
        schemaSnapshot: def.schema as object,
        answersSnapshot: args.answers as object,
        ip: args.ip,
        userAgent: args.userAgent,
      },
    });
    return updated;
  });
  return { submission };
}
