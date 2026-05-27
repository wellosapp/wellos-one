import { Prisma } from '@prisma/client';
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

export class FormTemplateNotFoundError extends Error {
  readonly code = 'FORM_TEMPLATE_NOT_FOUND';
  constructor(readonly templateId: string) {
    super(`Form template ${templateId} not found`);
    this.name = 'FormTemplateNotFoundError';
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

/// PR 8 — Forms tab on the appointment drawer. Returns submissions whose
/// appointmentId matches. Tenant-scoped. No mutations; the tab reuses
/// existing send/cancel flows from /admin/intake-form-submissions/...
export async function listIntakeSubmissionsForAppointment(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; appointmentId: string },
): Promise<{
  submissions: Array<
    IntakeFormSubmission & {
      definition: { id: string; title: string; version: number };
    }
  >;
}> {
  const submissions = await prisma.intakeFormSubmission.findMany({
    where: {
      tenantId: args.tenantId,
      appointmentId: args.appointmentId,
    },
    include: {
      definition: {
        select: { id: true, title: true, version: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return { submissions };
}

/// Single-record fetch used by the client-profile detail page (Forms PR 10).
/// Returns the submission + the full definition (schema included) so the
/// renderer can render fields without a second round-trip, plus the audit
/// timeline, file uploads and linked appointment/service for the rich viewer.
export async function getIntakeSubmissionForClient(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; clientId: string; submissionId: string },
): Promise<{
  submission: IntakeFormSubmission;
  definition: IntakeFormDefinition;
  appointment: {
    id: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    state: string;
    staffId: string;
  } | null;
  service: { id: string; name: string } | null;
  reviewedByStaffName: string | null;
  fileUploads: Array<{
    id: string;
    fieldKey: string;
    mediaAssetId: string;
    mediaAssetUrl: string | null;
  }>;
  audits: Array<{
    id: string;
    action: string;
    createdAt: string;
    ip: string | null;
    userAgent: string | null;
  }>;
} | null> {
  const row = await prisma.intakeFormSubmission.findFirst({
    where: {
      id: args.submissionId,
      tenantId: args.tenantId,
      clientId: args.clientId,
    },
    include: {
      definition: true,
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
      reviewedByStaff: {
        select: { id: true, firstName: true, lastName: true },
      },
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
  if (!row) return null;
  const {
    definition,
    appointment,
    reviewedByStaff,
    fileUploads,
    audits,
    ...submission
  } = row;

  const staffNameParts = reviewedByStaff
    ? [reviewedByStaff.firstName, reviewedByStaff.lastName].filter(
        (p): p is string => typeof p === 'string' && p.length > 0,
      )
    : [];

  return {
    submission,
    definition,
    appointment: appointment
      ? {
          id: appointment.id,
          scheduledStartAt: appointment.scheduledStartAt.toISOString(),
          scheduledEndAt: appointment.scheduledEndAt.toISOString(),
          state: appointment.state,
          staffId: appointment.staffId,
        }
      : null,
    service: appointment?.service
      ? { id: appointment.service.id, name: appointment.service.name }
      : null,
    reviewedByStaffName:
      staffNameParts.length > 0 ? staffNameParts.join(' ') : null,
    fileUploads: fileUploads.map((f) => ({
      id: f.id,
      fieldKey: f.fieldKey,
      mediaAssetId: f.mediaAssetId,
      mediaAssetUrl: f.mediaAsset?.objectKey ?? null,
    })),
    audits: audits.map((a) => ({
      id: a.id,
      action: a.action,
      createdAt: a.createdAt.toISOString(),
      ip: a.ip,
      userAgent: a.userAgent,
    })),
  };
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

// ---------- Forms System PR 4 — clone-from-template ----------
//
// Templates store FormBuilderSchema JSON. Cloning copies that JSON into a
// tenant-scoped IntakeFormDefinition row, but every section/field id is
// regenerated so the clone shares no IDs with the template (or with any
// other tenant's clone of the same template). Visibility rule fieldId
// references are rewritten to point at the regenerated ids.

interface CloneSchemaShape {
  schemaVersion: 2;
  sections: Array<{ id?: unknown; [k: string]: unknown }>;
  fields: Array<{
    id?: unknown;
    sectionId?: unknown;
    visibility?: unknown;
    [k: string]: unknown;
  }>;
}

function isCloneSchema(raw: unknown): raw is CloneSchemaShape {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return (
    obj.schemaVersion === 2 &&
    Array.isArray(obj.sections) &&
    Array.isArray(obj.fields)
  );
}

/**
 * Deep-copy a FormBuilderSchema and regenerate every section + field id.
 * Rewrites `fields[].sectionId` and `fields[].visibility.rules[].fieldId`
 * references so the renamed graph stays connected. Returns the schema
 * untouched if it doesn't match the expected shape (legacy array schemas
 * carry no IDs to regenerate — they get serialized as-is).
 */
export function regenerateSchemaIds(rawSchema: unknown): unknown {
  if (!isCloneSchema(rawSchema)) {
    // Legacy array shape or anything else — return a structural clone so
    // mutations to the source don't leak into the clone.
    return JSON.parse(JSON.stringify(rawSchema)) as unknown;
  }

  const cloned = JSON.parse(JSON.stringify(rawSchema)) as CloneSchemaShape;

  // Build old -> new id maps for both sections and fields.
  const sectionIdMap = new Map<string, string>();
  for (const section of cloned.sections) {
    if (typeof section.id === 'string') {
      sectionIdMap.set(section.id, crypto.randomUUID());
    }
  }
  const fieldIdMap = new Map<string, string>();
  for (const field of cloned.fields) {
    if (typeof field.id === 'string') {
      fieldIdMap.set(field.id, crypto.randomUUID());
    }
  }

  // Apply new section ids.
  for (const section of cloned.sections) {
    if (typeof section.id === 'string') {
      section.id = sectionIdMap.get(section.id) ?? section.id;
    }
  }

  // Apply new field ids + rewrite sectionId + visibility rule fieldId.
  for (const field of cloned.fields) {
    if (typeof field.id === 'string') {
      field.id = fieldIdMap.get(field.id) ?? field.id;
    }
    if (typeof field.sectionId === 'string') {
      field.sectionId = sectionIdMap.get(field.sectionId) ?? field.sectionId;
    }
    if (
      field.visibility &&
      typeof field.visibility === 'object' &&
      field.visibility !== null
    ) {
      const vis = field.visibility as { rules?: unknown };
      if (Array.isArray(vis.rules)) {
        for (const rule of vis.rules) {
          if (
            rule &&
            typeof rule === 'object' &&
            'fieldId' in rule &&
            typeof (rule as { fieldId: unknown }).fieldId === 'string'
          ) {
            const r = rule as { fieldId: string };
            r.fieldId = fieldIdMap.get(r.fieldId) ?? r.fieldId;
          }
        }
      }
    }
  }

  return cloned;
}

export async function cloneFromTemplate(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    templateId: string;
  },
): Promise<{ definition: IntakeFormDefinition }> {
  const template = await prisma.formTemplate.findUnique({
    where: { id: args.templateId },
  });
  if (!template || !template.isActive) {
    throw new FormTemplateNotFoundError(args.templateId);
  }

  const newGroupId = crypto.randomUUID();
  const newSchema = regenerateSchemaIds(template.schema);

  const definition = await prisma.$transaction(async (tx) => {
    const created = await tx.intakeFormDefinition.create({
      data: {
        tenantId: args.tenantId,
        groupId: newGroupId,
        title: template.title,
        description: template.description,
        formType: template.formType,
        schema: newSchema as object,
        version: 1,
        status: 'draft',
        isActive: true,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: args.tenantId,
        actorUserId: args.actorUserId,
        actorType: 'user',
        action: 'intake_form_definition.cloned_from_template',
        entityType: 'intake_form_definition',
        entityId: created.id,
        before: Prisma.JsonNull,
        after: {
          templateId: template.id,
          templateSlug: template.slug,
          templateTitle: template.title,
          definitionId: created.id,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return created;
  });

  return { definition };
}
