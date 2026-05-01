import { Prisma } from '@prisma/client';
import type { SoapNote, SoapNoteRevision } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  CreateSoapNoteBody,
  LockSoapNoteBody,
  ReviseSoapNoteBody,
  UpdateSoapNoteBody,
} from '../schemas/soapNotes.js';

// Domain layer for SOAP notes (E3-S4f).
//
// Lifecycle:
//   create     → unlocked (locked=false)
//   PATCH      → in-place edit; rejected if locked=true
//   lock       → sets locked=true, lockedAt, lockedByStaffId
//   revise     → only valid when locked=true; appends a SoapNoteRevision
//                row AND updates the SoapNote main fields with the new
//                values. Each revision auto-numbers (1, 2, 3...) per note.
//   soft-delete → idempotent
//
// Author / lock / revise IDs are explicit Staff IDs. Same Staff-has-no-
// userId-link issue as S4a/S4d; frontend resolves "current user → staff"
// itself.
//
// Multiple SOAP notes per appointment allowed (no DB unique on
// appointmentId) — supports multi-stage procedures.

const SOAP_FIELDS = {
  id: true,
  tenantId: true,
  clientId: true,
  appointmentId: true,
  authorStaffId: true,
  subjective: true,
  objective: true,
  assessment: true,
  plan: true,
  additionalNotes: true,
  templateId: true,
  icdCodes: true,
  cptCodes: true,
  locked: true,
  lockedAt: true,
  lockedByStaffId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.SoapNoteSelect;

const REVISION_FIELDS = {
  id: true,
  tenantId: true,
  noteId: true,
  revisionNumber: true,
  subjective: true,
  objective: true,
  assessment: true,
  plan: true,
  additionalNotes: true,
  revisedByStaffId: true,
  revisionReason: true,
  revisedAt: true,
} satisfies Prisma.SoapNoteRevisionSelect;

export class InvalidSoapNoteReferenceError extends Error {
  code = 'INVALID_SOAP_NOTE_REFERENCE' as const;
  field: 'appointmentId' | 'authorStaffId' | 'staffId' | 'revisedByStaffId';
  constructor(
    field: 'appointmentId' | 'authorStaffId' | 'staffId' | 'revisedByStaffId',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidSoapNoteReferenceError';
    this.field = field;
  }
}

export class InvalidSoapNoteStateError extends Error {
  code = 'INVALID_SOAP_NOTE_STATE' as const;
  field: 'locked' | 'unlocked';
  constructor(
    field: 'locked' | 'unlocked',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidSoapNoteStateError';
    this.field = field;
  }
}

async function loadAppointment(
  tx: ExtendedTransactionClient,
  args: { tenantId: string; appointmentId: string },
): Promise<{ id: string; clientId: string }> {
  const appt = await tx.appointment.findFirst({
    where: { id: args.appointmentId, tenantId: args.tenantId },
    select: { id: true, clientId: true },
  });
  if (!appt) {
    throw new InvalidSoapNoteReferenceError(
      'appointmentId',
      'Unknown appointment for this tenant.',
    );
  }
  return appt;
}

async function ensureStaffForTenant(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    staffId: string;
    field: 'authorStaffId' | 'staffId' | 'revisedByStaffId';
  },
): Promise<void> {
  const staff = await tx.staff.findFirst({
    where: { id: args.staffId, tenantId: args.tenantId },
    select: { id: true },
  });
  if (!staff) {
    throw new InvalidSoapNoteReferenceError(
      args.field,
      'Unknown staff for this tenant.',
    );
  }
}

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action:
      | 'soap_note.created'
      | 'soap_note.updated'
      | 'soap_note.locked'
      | 'soap_note.revised'
      | 'soap_note.deleted';
    entityId: string;
    before: SoapNote | SoapNoteRevision | null;
    after: SoapNote | SoapNoteRevision | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: 'soap_note',
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

// ---------- create ----------

export async function createSoapNote(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    appointmentId: string;
    body: CreateSoapNoteBody;
  },
): Promise<{ note: SoapNote }> {
  const { tenantId, actorUserId, appointmentId, body } = args;

  return prisma.$transaction(async (tx) => {
    const appt = await loadAppointment(tx, { tenantId, appointmentId });
    await ensureStaffForTenant(tx, {
      tenantId,
      staffId: body.authorStaffId,
      field: 'authorStaffId',
    });

    const note = await tx.soapNote.create({
      data: {
        tenantId,
        clientId: appt.clientId,
        appointmentId,
        authorStaffId: body.authorStaffId,
        subjective: body.subjective ?? null,
        objective: body.objective ?? null,
        assessment: body.assessment ?? null,
        plan: body.plan ?? null,
        additionalNotes: body.additionalNotes ?? null,
        templateId: body.templateId ?? null,
        icdCodes: body.icdCodes,
        cptCodes: body.cptCodes,
      },
      select: SOAP_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'soap_note.created',
      entityId: note.id,
      before: null,
      after: note,
    });

    return { note };
  });
}

// ---------- list / get ----------

export async function listSoapNotesForAppointment(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; appointmentId: string },
): Promise<{ notes: SoapNote[] } | null> {
  const { tenantId, appointmentId } = args;

  // Verify appointment exists in this tenant; null distinguishes "no
  // appointment" from "appointment exists but no notes."
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: { id: true },
  });
  if (!appt) return null;

  const notes = await prisma.soapNote.findMany({
    where: { tenantId, appointmentId },
    select: SOAP_FIELDS,
    orderBy: { createdAt: 'desc' },
  });
  return { notes };
}

export async function getSoapNoteById(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; appointmentId: string; noteId: string },
): Promise<SoapNote | null> {
  return prisma.soapNote.findFirst({
    where: {
      tenantId: args.tenantId,
      appointmentId: args.appointmentId,
      id: args.noteId,
    },
    select: SOAP_FIELDS,
  });
}

export async function listSoapNoteRevisions(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; noteId: string },
): Promise<{ revisions: SoapNoteRevision[] } | null> {
  const { tenantId, noteId } = args;

  const note = await prisma.soapNote.findFirst({
    where: { tenantId, id: noteId },
    select: { id: true },
  });
  if (!note) return null;

  const revisions = await prisma.soapNoteRevision.findMany({
    where: { tenantId, noteId },
    select: REVISION_FIELDS,
    orderBy: { revisionNumber: 'asc' },
  });
  return { revisions };
}

// ---------- in-place update (only when unlocked) ----------

export async function updateSoapNote(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    appointmentId: string;
    noteId: string;
    body: UpdateSoapNoteBody;
  },
): Promise<{ note: SoapNote } | null> {
  const { tenantId, actorUserId, appointmentId, noteId, body } = args;

  const hasChanges = Object.keys(body).length > 0;

  return prisma.$transaction(async (tx) => {
    const before = await tx.soapNote.findFirst({
      where: { tenantId, appointmentId, id: noteId },
      select: SOAP_FIELDS,
    });
    if (!before) return null;

    if (before.locked) {
      throw new InvalidSoapNoteStateError(
        'locked',
        'SOAP note is locked. Use the /revise endpoint to make changes.',
      );
    }

    if (!hasChanges) return { note: before };

    const data: Prisma.SoapNoteUpdateInput = {};
    if (body.subjective !== undefined) data.subjective = body.subjective ?? null;
    if (body.objective !== undefined) data.objective = body.objective ?? null;
    if (body.assessment !== undefined) data.assessment = body.assessment ?? null;
    if (body.plan !== undefined) data.plan = body.plan ?? null;
    if (body.additionalNotes !== undefined)
      data.additionalNotes = body.additionalNotes ?? null;
    if (body.templateId !== undefined) data.templateId = body.templateId;
    if (body.icdCodes !== undefined) data.icdCodes = { set: body.icdCodes };
    if (body.cptCodes !== undefined) data.cptCodes = { set: body.cptCodes };

    const after = await tx.soapNote.update({
      where: { id: noteId },
      data,
      select: SOAP_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'soap_note.updated',
      entityId: noteId,
      before,
      after,
    });

    return { note: after };
  });
}

// ---------- lock ----------

export async function lockSoapNote(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    appointmentId: string;
    noteId: string;
    body: LockSoapNoteBody;
  },
): Promise<{ note: SoapNote } | null> {
  const { tenantId, actorUserId, appointmentId, noteId, body } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.soapNote.findFirst({
      where: { tenantId, appointmentId, id: noteId },
      select: SOAP_FIELDS,
    });
    if (!before) return null;
    if (before.locked) {
      // Idempotent: returning the existing row keeps the lock action
      // safe to retry, but we don't write an audit row for a no-op.
      return { note: before };
    }

    await ensureStaffForTenant(tx, {
      tenantId,
      staffId: body.staffId,
      field: 'staffId',
    });

    const after = await tx.soapNote.update({
      where: { id: noteId },
      data: {
        locked: true,
        lockedAt: new Date(),
        lockedByStaffId: body.staffId,
      },
      select: SOAP_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'soap_note.locked',
      entityId: noteId,
      before,
      after,
    });

    return { note: after };
  });
}

// ---------- revise (locked notes only) ----------

export async function reviseSoapNote(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    appointmentId: string;
    noteId: string;
    body: ReviseSoapNoteBody;
  },
): Promise<{ note: SoapNote; revision: SoapNoteRevision } | null> {
  const { tenantId, actorUserId, appointmentId, noteId, body } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.soapNote.findFirst({
      where: { tenantId, appointmentId, id: noteId },
      select: SOAP_FIELDS,
    });
    if (!before) return null;

    if (!before.locked) {
      throw new InvalidSoapNoteStateError(
        'unlocked',
        'SOAP note is not locked. Use PATCH for in-place edits.',
      );
    }

    await ensureStaffForTenant(tx, {
      tenantId,
      staffId: body.revisedByStaffId,
      field: 'revisedByStaffId',
    });

    // Compute next revision number. revision_number is unique per note,
    // monotonically increasing — we look up max + 1.
    const maxRevision = await tx.soapNoteRevision.findFirst({
      where: { tenantId, noteId },
      select: { revisionNumber: true },
      orderBy: { revisionNumber: 'desc' },
    });
    const revisionNumber = (maxRevision?.revisionNumber ?? 0) + 1;

    const revision = await tx.soapNoteRevision.create({
      data: {
        tenantId,
        noteId,
        revisionNumber,
        subjective: body.subjective ?? null,
        objective: body.objective ?? null,
        assessment: body.assessment ?? null,
        plan: body.plan ?? null,
        additionalNotes: body.additionalNotes ?? null,
        revisedByStaffId: body.revisedByStaffId,
        revisionReason: body.revisionReason,
      },
      select: REVISION_FIELDS,
    });

    // Update the main row with the revised values so the "current" SOAP
    // always reflects the latest revision (the timeline still shows
    // history via SoapNoteRevision rows).
    const data: Prisma.SoapNoteUpdateInput = {};
    if (body.subjective !== undefined) data.subjective = body.subjective ?? null;
    if (body.objective !== undefined) data.objective = body.objective ?? null;
    if (body.assessment !== undefined) data.assessment = body.assessment ?? null;
    if (body.plan !== undefined) data.plan = body.plan ?? null;
    if (body.additionalNotes !== undefined)
      data.additionalNotes = body.additionalNotes ?? null;

    const after = await tx.soapNote.update({
      where: { id: noteId },
      data,
      select: SOAP_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'soap_note.revised',
      entityId: noteId,
      before,
      after,
    });

    return { note: after, revision };
  });
}

// ---------- soft-delete ----------

export async function softDeleteSoapNote(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    appointmentId: string;
    noteId: string;
  },
): Promise<{ deleted: boolean }> {
  const { tenantId, actorUserId, appointmentId, noteId } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.soapNote.findFirst({
      where: { tenantId, appointmentId, id: noteId },
      select: SOAP_FIELDS,
    });
    if (!before) return { deleted: false };

    const after = await tx.soapNote.update({
      where: { id: noteId },
      data: { deletedAt: new Date() },
      select: SOAP_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'soap_note.deleted',
      entityId: noteId,
      before,
      after,
    });

    return { deleted: true };
  });
}
