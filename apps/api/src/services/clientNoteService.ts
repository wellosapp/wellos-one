import { Prisma } from '@prisma/client';
import type {
  ClientNote,
  ClientNoteAcknowledgment,
  ClientNoteAckTriggerContext,
  ClientNoteSourceSurface,
} from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  AcknowledgeClientNoteBody,
  CreateClientNoteBody,
  ListClientNotesQuery,
  UpdateClientNoteBody,
} from '../schemas/clientNote.js';

// Domain layer for ClientNote admin CRUD + lifecycle (E3-S4a).
//
// Tenant scoping: every query passes tenantId. The soft-delete extension
// auto-filters deletedAt: null on reads; archived notes are filtered out at
// the query layer (archivedAt: null) unless includeArchived is set.
//
// Author identity: for the admin surface in S4a, all server-derived authors
// are stamped as authorType='admin' with authorUserId=actorUserId. The
// 'staff' authorType requires a Staff.userId link that doesn't exist yet
// (master-spec §5.4); the staff-app PR adds that and a separate code path.
// Non-admin role callers are still allowed to create — they just write
// authorType='admin' for now. Documented as a known gap in the PR.
//
// Audit log: every mutation writes inside the same transaction. Action
// names: client_note.created, .updated, .deleted, .pinned, .unpinned,
// .archived, .unarchived, .acknowledged.
//
// Visibility constraints (enforced server-side, not Zod):
//   - customerVisible=true requires visibility='customer_submitted'
//   - visibility='customer_submitted' is REJECTED on create from the admin
//     surface — that visibility is reserved for public-booking-authored
//     rows (E3-S4d).
//   - visibility='admin_only' is REJECTED for non-admin role callers.
//   - visibility='protected_clinical' is REJECTED at MVP — SOAP / clinical
//     records ride a separate partition (E3-S4f).

const NOTE_SAFE_FIELDS = {
  id: true,
  tenantId: true,
  clientId: true,
  category: true,
  priority: true,
  title: true,
  body: true,
  appointmentId: true,
  serviceId: true,
  authorType: true,
  authorStaffId: true,
  authorClientId: true,
  authorUserId: true,
  sourceSurface: true,
  visibility: true,
  customerVisible: true,
  alertTriggers: true,
  pinned: true,
  expiresAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.ClientNoteSelect;

export type CreateClientNoteResult = { note: ClientNote };
export type UpdateClientNoteResult = { note: ClientNote };
export type ToggleClientNoteFlagResult = { note: ClientNote };
export type AcknowledgeClientNoteResult = {
  acknowledgment: ClientNoteAcknowledgment;
};

// Thrown when a referenced FK doesn't belong to the caller's tenant or
// doesn't exist. Route layer maps to 400 with a field-level issue.
export class InvalidClientNoteReferenceError extends Error {
  code = 'INVALID_CLIENT_NOTE_REFERENCE' as const;
  field: 'clientId' | 'appointmentId' | 'serviceId' | 'staffId';
  constructor(
    field: 'clientId' | 'appointmentId' | 'serviceId' | 'staffId',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidClientNoteReferenceError';
    this.field = field;
  }
}

// Thrown when a visibility/customerVisible/role rule is violated. Route
// layer maps to 422 with field-level issues so the UI can highlight the
// offending control.
export class InvalidClientNoteStateError extends Error {
  code = 'INVALID_CLIENT_NOTE_STATE' as const;
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'InvalidClientNoteStateError';
    this.field = field;
  }
}

async function ensureClientForTenant(
  tx: ExtendedTransactionClient,
  args: { tenantId: string; clientId: string },
): Promise<void> {
  const client = await tx.client.findFirst({
    where: { id: args.clientId, tenantId: args.tenantId },
    select: { id: true },
  });
  if (!client) {
    throw new InvalidClientNoteReferenceError(
      'clientId',
      'Unknown client for this tenant.',
    );
  }
}

async function ensureOptionalAppointmentForClient(
  tx: ExtendedTransactionClient,
  args: { tenantId: string; clientId: string; appointmentId?: string },
): Promise<void> {
  if (!args.appointmentId) return;
  const appt = await tx.appointment.findFirst({
    where: {
      id: args.appointmentId,
      tenantId: args.tenantId,
    },
    select: { id: true, clientId: true },
  });
  if (!appt) {
    throw new InvalidClientNoteReferenceError(
      'appointmentId',
      'Unknown appointment for this tenant.',
    );
  }
  if (appt.clientId !== args.clientId) {
    throw new InvalidClientNoteReferenceError(
      'appointmentId',
      'Appointment belongs to a different client.',
    );
  }
}

async function ensureOptionalServiceForTenant(
  tx: ExtendedTransactionClient,
  args: { tenantId: string; serviceId?: string },
): Promise<void> {
  if (!args.serviceId) return;
  const svc = await tx.service.findFirst({
    where: { id: args.serviceId, tenantId: args.tenantId },
    select: { id: true },
  });
  if (!svc) {
    throw new InvalidClientNoteReferenceError(
      'serviceId',
      'Unknown service for this tenant.',
    );
  }
}

function validateVisibilityRules(args: {
  visibility: CreateClientNoteBody['visibility'];
  customerVisible: boolean | undefined;
  callerHasAdminRole: boolean;
}): void {
  if (args.visibility === 'customer_submitted') {
    throw new InvalidClientNoteStateError(
      'visibility',
      'customer_submitted notes are created via the public booking flow, not the admin surface.',
    );
  }
  if (args.visibility === 'protected_clinical') {
    throw new InvalidClientNoteStateError(
      'visibility',
      'protected_clinical visibility is reserved for the SOAP/clinical partition (not in MVP).',
    );
  }
  if (args.visibility === 'admin_only' && !args.callerHasAdminRole) {
    throw new InvalidClientNoteStateError(
      'visibility',
      'admin_only visibility requires the admin role.',
    );
  }
  if (args.customerVisible) {
    // The schema enforces customerVisible=false for non-customer_submitted
    // rows at the application layer; reject here so the rule is one place.
    throw new InvalidClientNoteStateError(
      'customerVisible',
      'customerVisible can only be set on customer_submitted notes.',
    );
  }
}

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action:
      | 'client_note.created'
      | 'client_note.updated'
      | 'client_note.deleted'
      | 'client_note.pinned'
      | 'client_note.unpinned'
      | 'client_note.archived'
      | 'client_note.unarchived'
      | 'client_note.acknowledged';
    entityId: string;
    before: ClientNote | ClientNoteAcknowledgment | null;
    after: ClientNote | ClientNoteAcknowledgment | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: 'client_note',
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

export async function createClientNote(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    callerHasAdminRole: boolean;
    clientId: string;
    body: CreateClientNoteBody;
  },
): Promise<CreateClientNoteResult> {
  const { tenantId, actorUserId, callerHasAdminRole, clientId, body } = args;

  validateVisibilityRules({
    visibility: body.visibility,
    customerVisible: body.customerVisible,
    callerHasAdminRole,
  });

  return prisma.$transaction(async (tx) => {
    await ensureClientForTenant(tx, { tenantId, clientId });
    await ensureOptionalAppointmentForClient(tx, {
      tenantId,
      clientId,
      appointmentId: body.appointmentId,
    });
    await ensureOptionalServiceForTenant(tx, {
      tenantId,
      serviceId: body.serviceId,
    });

    const note = await tx.clientNote.create({
      data: {
        tenantId,
        clientId,
        category: body.category,
        priority: body.priority ?? 'normal',
        title: body.title ?? null,
        body: body.body,
        appointmentId: body.appointmentId ?? null,
        serviceId: body.serviceId ?? null,
        // S4a: server-derived author is always 'admin' authorType — see file
        // header note. Refines when staff app + Staff.userId land.
        authorType: 'admin',
        authorUserId: actorUserId,
        // Zod allows surfaces added after Prisma schema bumps (e.g. quick_book);
        // regenerate Prisma client locally when node_modules types lag CI/schema.
        sourceSurface: body.sourceSurface as unknown as ClientNoteSourceSurface,
        visibility: body.visibility,
        customerVisible: false,
        alertTriggers: body.alertTriggers,
        pinned: body.pinned ?? false,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      select: NOTE_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'client_note.created',
      entityId: note.id,
      before: null,
      after: note,
    });

    return { note };
  });
}

export async function listClientNotes(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    clientId: string;
    query: ListClientNotesQuery;
  },
): Promise<{ notes: ClientNote[]; total: number }> {
  const { tenantId, clientId, query } = args;

  const where: Prisma.ClientNoteWhereInput = {
    tenantId,
    clientId,
  };
  if (query.category) where.category = query.category;
  if (query.priority) where.priority = query.priority;
  if (query.visibility) where.visibility = query.visibility;
  if (query.appointmentId) where.appointmentId = query.appointmentId;
  if (query.serviceId) where.serviceId = query.serviceId;
  if (query.pinned) where.pinned = true;
  if (!query.includeArchived) {
    where.archivedAt = null;
  }

  const [notes, total] = await Promise.all([
    prisma.clientNote.findMany({
      where,
      select: NOTE_SAFE_FIELDS,
      // Pinned first, then most recent. Matches the briefing-card UX.
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: query.take,
      skip: query.skip,
    }),
    prisma.clientNote.count({ where }),
  ]);

  return { notes, total };
}

export async function getClientNoteById(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; clientId: string; noteId: string },
): Promise<ClientNote | null> {
  return prisma.clientNote.findFirst({
    where: {
      tenantId: args.tenantId,
      clientId: args.clientId,
      id: args.noteId,
    },
    select: NOTE_SAFE_FIELDS,
  });
}

export async function updateClientNote(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    callerHasAdminRole: boolean;
    clientId: string;
    noteId: string;
    body: UpdateClientNoteBody;
  },
): Promise<UpdateClientNoteResult | null> {
  const { tenantId, actorUserId, callerHasAdminRole, clientId, noteId, body } =
    args;

  // Empty PATCH → no-op. No DB roundtrip beyond the read.
  const hasChanges = Object.keys(body).length > 0;

  return prisma.$transaction(async (tx) => {
    const before = await tx.clientNote.findFirst({
      where: { tenantId, clientId, id: noteId },
      select: NOTE_SAFE_FIELDS,
    });
    if (!before) return null;

    if (!hasChanges) {
      return { note: before };
    }

    // If visibility is changing, re-run the visibility rules.
    if (body.visibility) {
      validateVisibilityRules({
        visibility: body.visibility,
        customerVisible: body.customerVisible,
        callerHasAdminRole,
      });
    }

    if (body.appointmentId !== undefined) {
      await ensureOptionalAppointmentForClient(tx, {
        tenantId,
        clientId,
        appointmentId: body.appointmentId ?? undefined,
      });
    }
    if (body.serviceId !== undefined) {
      await ensureOptionalServiceForTenant(tx, {
        tenantId,
        serviceId: body.serviceId ?? undefined,
      });
    }

    const data: Prisma.ClientNoteUpdateInput = {};
    if (body.category !== undefined) data.category = body.category;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.title !== undefined) data.title = body.title ?? null;
    if (body.body !== undefined) data.body = body.body;
    if (body.visibility !== undefined) data.visibility = body.visibility;
    if (body.customerVisible !== undefined) {
      data.customerVisible = body.customerVisible;
    }
    if (body.alertTriggers !== undefined) {
      data.alertTriggers = { set: body.alertTriggers };
    }
    if (body.expiresAt !== undefined) {
      data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    }
    if (body.appointmentId !== undefined) {
      data.appointment = body.appointmentId
        ? { connect: { id: body.appointmentId } }
        : { disconnect: true };
    }
    if (body.serviceId !== undefined) {
      data.service = body.serviceId
        ? { connect: { id: body.serviceId } }
        : { disconnect: true };
    }

    const after = await tx.clientNote.update({
      where: { id: noteId },
      data,
      select: NOTE_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'client_note.updated',
      entityId: noteId,
      before,
      after,
    });

    return { note: after };
  });
}

export async function softDeleteClientNote(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    clientId: string;
    noteId: string;
  },
): Promise<{ deleted: boolean }> {
  const { tenantId, actorUserId, clientId, noteId } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.clientNote.findFirst({
      where: { tenantId, clientId, id: noteId },
      select: NOTE_SAFE_FIELDS,
    });
    if (!before) return { deleted: false };

    const after = await tx.clientNote.update({
      where: { id: noteId },
      data: { deletedAt: new Date() },
      select: NOTE_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'client_note.deleted',
      entityId: noteId,
      before,
      after,
    });

    return { deleted: true };
  });
}

// Pin / unpin / archive / unarchive share a single state-toggle pattern.
// Idempotent — flipping a flag to its current value is a no-op (no audit
// row, no DB write past the read).
async function setNoteFlag(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    clientId: string;
    noteId: string;
    field: 'pinned' | 'archived';
    next: boolean;
  },
): Promise<ToggleClientNoteFlagResult | null> {
  const { tenantId, actorUserId, clientId, noteId, field, next } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.clientNote.findFirst({
      where: { tenantId, clientId, id: noteId },
      select: NOTE_SAFE_FIELDS,
    });
    if (!before) return null;

    let isUnchanged = false;
    let data: Prisma.ClientNoteUpdateInput;
    let action:
      | 'client_note.pinned'
      | 'client_note.unpinned'
      | 'client_note.archived'
      | 'client_note.unarchived';

    if (field === 'pinned') {
      isUnchanged = before.pinned === next;
      data = { pinned: next };
      action = next ? 'client_note.pinned' : 'client_note.unpinned';
    } else {
      const currentlyArchived = before.archivedAt !== null;
      isUnchanged = currentlyArchived === next;
      data = { archivedAt: next ? new Date() : null };
      action = next ? 'client_note.archived' : 'client_note.unarchived';
    }

    if (isUnchanged) {
      return { note: before };
    }

    const after = await tx.clientNote.update({
      where: { id: noteId },
      data,
      select: NOTE_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action,
      entityId: noteId,
      before,
      after,
    });

    return { note: after };
  });
}

export function setClientNotePinned(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    clientId: string;
    noteId: string;
    pinned: boolean;
  },
): Promise<ToggleClientNoteFlagResult | null> {
  return setNoteFlag(prisma, { ...args, field: 'pinned', next: args.pinned });
}

export function setClientNoteArchived(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    clientId: string;
    noteId: string;
    archived: boolean;
  },
): Promise<ToggleClientNoteFlagResult | null> {
  return setNoteFlag(prisma, {
    ...args,
    field: 'archived',
    next: args.archived,
  });
}

export async function acknowledgeClientNote(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    clientId: string;
    noteId: string;
    body: AcknowledgeClientNoteBody;
  },
): Promise<AcknowledgeClientNoteResult | null> {
  const { tenantId, actorUserId, clientId, noteId, body } = args;

  return prisma.$transaction(async (tx) => {
    const note = await tx.clientNote.findFirst({
      where: { tenantId, clientId, id: noteId, archivedAt: null },
      select: { id: true },
    });
    if (!note) return null;

    // Staff must exist within the same tenant. Soft-delete extension auto-
    // filters deletedAt: null on this read.
    const staff = await tx.staff.findFirst({
      where: { id: body.staffId, tenantId },
      select: { id: true },
    });
    if (!staff) {
      throw new InvalidClientNoteReferenceError(
        'staffId',
        'Unknown staff for this tenant.',
      );
    }

    if (body.appointmentId) {
      const appt = await tx.appointment.findFirst({
        where: { id: body.appointmentId, tenantId },
        select: { id: true, clientId: true },
      });
      if (!appt) {
        throw new InvalidClientNoteReferenceError(
          'appointmentId',
          'Unknown appointment for this tenant.',
        );
      }
      if (appt.clientId !== clientId) {
        throw new InvalidClientNoteReferenceError(
          'appointmentId',
          'Appointment belongs to a different client than this note.',
        );
      }
    }

    const acknowledgment = await tx.clientNoteAcknowledgment.create({
      data: {
        tenantId,
        noteId,
        staffId: body.staffId,
        triggerContext: body.triggerContext as ClientNoteAckTriggerContext,
        appointmentId: body.appointmentId ?? null,
      },
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'client_note.acknowledged',
      entityId: noteId,
      before: null,
      after: acknowledgment,
    });

    return { acknowledgment };
  });
}
