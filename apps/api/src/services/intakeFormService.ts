import type {
  IntakeFormDefinition,
  IntakeFormDefinitionStatus,
  IntakeFormSubmission,
} from '@prisma/client';

import type { ExtendedPrismaClient } from '../db/client.js';

export class IntakeFormNotFoundError extends Error {
  readonly code = 'INTAKE_FORM_NOT_FOUND';
  constructor(message = 'Intake form record not found.') {
    super(message);
    this.name = 'IntakeFormNotFoundError';
  }
}

export class IntakeFormStateError extends Error {
  readonly code = 'INTAKE_FORM_INVALID_STATE';
  constructor(message: string) {
    super(message);
    this.name = 'IntakeFormStateError';
  }
}

export class IntakeFormReferenceError extends Error {
  readonly code = 'INTAKE_FORM_REFERENCE';
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'IntakeFormReferenceError';
  }
}

type ListDefinitionsQuery = {
  status?: IntakeFormDefinitionStatus;
  groupId?: string;
  includeInactive?: boolean;
};

export async function listIntakeFormDefinitions(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; query: ListDefinitionsQuery },
): Promise<{ definitions: IntakeFormDefinition[] }> {
  const { tenantId, query } = args;
  const where: {
    tenantId: string;
    status?: IntakeFormDefinitionStatus;
    groupId?: string;
    isActive?: boolean;
  } = { tenantId };
  if (query.status) where.status = query.status;
  if (query.groupId) where.groupId = query.groupId;
  if (query.status === 'published' && !query.includeInactive) {
    where.isActive = true;
  }

  const definitions = await prisma.intakeFormDefinition.findMany({
    where,
    orderBy: [{ groupId: 'asc' }, { version: 'desc' }],
  });
  return { definitions };
}

export async function getIntakeFormDefinitionById(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; id: string },
): Promise<IntakeFormDefinition | null> {
  return prisma.intakeFormDefinition.findFirst({
    where: { id: args.id, tenantId: args.tenantId },
  });
}

export async function createIntakeFormDefinition(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    title: string;
    schema: unknown;
    groupId?: string;
  },
): Promise<{ definition: IntakeFormDefinition }> {
  const { tenantId, title, schema } = args;
  let groupId = args.groupId;
  let version = 1;

  if (groupId) {
    const agg = await prisma.intakeFormDefinition.aggregate({
      where: { tenantId, groupId },
      _max: { version: true },
    });
    const maxV = agg._max.version;
    if (maxV === null) {
      throw new IntakeFormReferenceError('groupId', 'Unknown form group for this tenant.');
    }
    version = maxV + 1;
  } else {
    groupId = crypto.randomUUID();
  }

  const definition = await prisma.intakeFormDefinition.create({
    data: {
      tenantId,
      groupId,
      title,
      schema: schema as object,
      version,
      status: 'draft',
    },
  });
  return { definition };
}

export async function updateIntakeFormDefinition(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    id: string;
    title?: string;
    schema?: unknown;
    isActive?: boolean;
  },
): Promise<{ definition: IntakeFormDefinition }> {
  const existing = await prisma.intakeFormDefinition.findFirst({
    where: { id: args.id, tenantId: args.tenantId },
  });
  if (!existing) throw new IntakeFormNotFoundError();
  if (existing.status !== 'draft') {
    throw new IntakeFormStateError('Only draft definitions can be edited.');
  }

  const definition = await prisma.intakeFormDefinition.update({
    where: { id: existing.id },
    data: {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.schema !== undefined ? { schema: args.schema as object } : {}),
      ...(args.isActive !== undefined ? { isActive: args.isActive } : {}),
    },
  });
  return { definition };
}

export async function publishIntakeFormDefinition(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; id: string },
): Promise<{ definition: IntakeFormDefinition }> {
  const existing = await prisma.intakeFormDefinition.findFirst({
    where: { id: args.id, tenantId: args.tenantId },
  });
  if (!existing) throw new IntakeFormNotFoundError();
  if (existing.status !== 'draft') {
    throw new IntakeFormStateError('Only a draft definition can be published.');
  }

  const definition = await prisma.$transaction(async (tx) => {
    await tx.intakeFormDefinition.updateMany({
      where: {
        tenantId: args.tenantId,
        groupId: existing.groupId,
        status: 'published',
      },
      data: { status: 'archived' },
    });
    return tx.intakeFormDefinition.update({
      where: { id: existing.id },
      data: { status: 'published' },
    });
  });
  return { definition };
}

async function requirePublishedDefinition(
  prisma: ExtendedPrismaClient,
  tenantId: string,
  definitionId: string,
): Promise<IntakeFormDefinition> {
  const def = await prisma.intakeFormDefinition.findFirst({
    where: { id: definitionId, tenantId, status: 'published', isActive: true },
  });
  if (!def) {
    throw new IntakeFormReferenceError(
      'definitionId',
      'Published, active intake form definition not found.',
    );
  }
  return def;
}

async function assertAppointmentForClient(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; appointmentId: string; clientId: string },
): Promise<void> {
  const appt = await prisma.appointment.findFirst({
    where: {
      id: args.appointmentId,
      tenantId: args.tenantId,
      clientId: args.clientId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!appt) {
    throw new IntakeFormReferenceError(
      'appointmentId',
      'Appointment not found for this client and tenant.',
    );
  }
}

export async function listIntakeSubmissionsForClient(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; clientId: string },
): Promise<{
  submissions: Array<
    IntakeFormSubmission & {
      definition: { id: string; title: string; version: number };
    }
  >;
}> {
  const submissions = await prisma.intakeFormSubmission.findMany({
    where: { tenantId: args.tenantId, clientId: args.clientId },
    include: {
      definition: {
        select: { id: true, title: true, version: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return { submissions };
}

/// Single-record fetch used by the fill-out page. Returns the submission + the
/// full definition (schema included) so the renderer can render fields without
/// a second round-trip.
export async function getIntakeSubmissionForClient(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; clientId: string; submissionId: string },
): Promise<{
  submission: IntakeFormSubmission;
  definition: IntakeFormDefinition;
} | null> {
  const row = await prisma.intakeFormSubmission.findFirst({
    where: {
      id: args.submissionId,
      tenantId: args.tenantId,
      clientId: args.clientId,
    },
    include: { definition: true },
  });
  if (!row) return null;
  const { definition, ...submission } = row;
  return { submission, definition };
}

export async function createIntakeFormSubmission(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    clientId: string;
    definitionId: string;
    appointmentId?: string;
    answers?: Record<string, unknown>;
  },
): Promise<{ submission: IntakeFormSubmission }> {
  await requirePublishedDefinition(prisma, args.tenantId, args.definitionId);

  const client = await prisma.client.findFirst({
    where: { id: args.clientId, tenantId: args.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!client) {
    throw new IntakeFormReferenceError('clientId', 'Client not found.');
  }

  if (args.appointmentId) {
    await assertAppointmentForClient(prisma, {
      tenantId: args.tenantId,
      appointmentId: args.appointmentId,
      clientId: args.clientId,
    });
  }

  const submission = await prisma.intakeFormSubmission.create({
    data: {
      tenantId: args.tenantId,
      clientId: args.clientId,
      definitionId: args.definitionId,
      appointmentId: args.appointmentId,
      answers: (args.answers ?? {}) as object,
      status: 'draft',
    },
  });
  return { submission };
}

export async function patchIntakeFormSubmission(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    clientId: string;
    submissionId: string;
    answers?: Record<string, unknown>;
    status?: 'draft' | 'submitted';
    ip: string | null;
    userAgent: string | null;
  },
): Promise<{ submission: IntakeFormSubmission }> {
  const existing = await prisma.intakeFormSubmission.findFirst({
    where: {
      id: args.submissionId,
      tenantId: args.tenantId,
      clientId: args.clientId,
    },
  });
  if (!existing) throw new IntakeFormNotFoundError('Submission not found.');

  if (existing.status === 'submitted') {
    if (args.status === 'submitted' && args.answers === undefined) {
      return { submission: existing };
    }
    if (args.answers !== undefined || args.status === 'draft') {
      throw new IntakeFormStateError('Submitted intake forms cannot be edited.');
    }
    if (args.status === undefined) {
      return { submission: existing };
    }
  }

  if (args.status === 'submitted') {
    const def = await prisma.intakeFormDefinition.findFirst({
      where: { id: existing.definitionId, tenantId: args.tenantId },
    });
    if (!def || def.status !== 'published') {
      throw new IntakeFormStateError('Cannot submit against an unpublished form version.');
    }

    const answers =
      args.answers !== undefined
        ? args.answers
        : (existing.answers as Record<string, unknown>);

    const submission = await prisma.$transaction(async (tx) => {
      const updated = await tx.intakeFormSubmission.update({
        where: { id: existing.id },
        data: {
          answers: answers as object,
          status: 'submitted',
          submittedAt: new Date(),
        },
      });
      await tx.intakeFormSubmissionAudit.create({
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

  if (existing.status !== 'draft') {
    throw new IntakeFormStateError('Only draft submissions can be updated this way.');
  }

  if (args.answers === undefined) {
    return { submission: existing };
  }

  const submission = await prisma.intakeFormSubmission.update({
    where: { id: existing.id },
    data: { answers: args.answers as object },
  });
  return { submission };
}
