import { Prisma } from '@prisma/client';
import type { Appointment, AppointmentStatus } from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  CreateAppointmentBody,
  ListAppointmentsQuery,
  UpdateAppointmentBody,
} from '../schemas/appointment.js';
import {
  InvalidStateTransitionError,
  assertTransition,
} from './appointmentStateMachine.js';

// Domain layer for Appointment admin CRUD (E3-S1).
//
// Tenant scoping: every query passes tenantId. The soft-delete extension
// auto-filters deletedAt: null on reads.
//
// Audit log: create/update/state_changed/delete write inside the same
// transaction. Action names: appointment.created, appointment.updated,
// appointment.state_changed, appointment.deleted.
//
// EXCLUDE constraint: the DB-level `appointments_no_overlap_per_staff`
// constraint guarantees no two non-terminal appointments overlap for the
// same staff. On violation, Prisma raises P2010 with the constraint name
// in the metadata; we map that to AppointmentSlotConflictError → 409.
//
// Time math: scheduledStartAt comes from the client; scheduledEndAt is
// computed from Service.durationMinutes server-side so the client cannot
// game the EXCLUDE check.

const APPOINTMENT_SAFE_FIELDS = {
  id: true,
  tenantId: true,
  locationId: true,
  clientId: true,
  staffId: true,
  serviceId: true,
  scheduledStartAt: true,
  scheduledEndAt: true,
  state: true,
  // Tier A — booking source for reporting + abuse detection.
  source: true,
  notes: true,
  createdByUserId: true,
  cancelledAt: true,
  cancelledByUserId: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.AppointmentSelect;

export type CreateAppointmentResult = { appointment: Appointment };
export type UpdateAppointmentResult = { appointment: Appointment };
export type TransitionAppointmentResult = { appointment: Appointment };

// Thrown when the DB EXCLUDE constraint fires. Route layer maps to 409.
export class AppointmentSlotConflictError extends Error {
  code = 'APPOINTMENT_SLOT_CONFLICT' as const;
  staffId: string;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  conflictingAppointmentId: string | null;
  constructor(args: {
    staffId: string;
    scheduledStartAt: Date;
    scheduledEndAt: Date;
    conflictingAppointmentId: string | null;
  }) {
    super('Slot is already booked for this staff member.');
    this.name = 'AppointmentSlotConflictError';
    this.staffId = args.staffId;
    this.scheduledStartAt = args.scheduledStartAt;
    this.scheduledEndAt = args.scheduledEndAt;
    this.conflictingAppointmentId = args.conflictingAppointmentId;
  }
}

// Thrown when one of the FK references doesn't belong to the caller's
// tenant (cross-tenant attempt) or doesn't exist. Route layer maps to 400
// with field-style errors. Mirrors INVALID_STAFF_IDS / INVALID_TAG_IDS.
export class InvalidAppointmentReferenceError extends Error {
  code = 'INVALID_APPOINTMENT_REFERENCE' as const;
  field: 'locationId' | 'clientId' | 'staffId' | 'serviceId';
  constructor(
    field: 'locationId' | 'clientId' | 'staffId' | 'serviceId',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidAppointmentReferenceError';
    this.field = field;
  }
}

// Postgres exclusion-constraint violations surface as P2010 in Prisma 5.
// We sniff the constraint name to be sure — other P2010s (e.g. raw query
// failures) must NOT be misclassified as slot conflicts.
function isExclusionViolation(err: unknown): boolean {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2010'
  ) {
    const meta = (err.meta ?? {}) as Record<string, unknown>;
    const message = typeof meta.message === 'string' ? meta.message : err.message;
    return message.includes('appointments_no_overlap_per_staff');
  }
  return false;
}

async function findConflictingAppointmentId(
  tx: ExtendedTransactionClient,
  args: {
    staffId: string;
    scheduledStartAt: Date;
    scheduledEndAt: Date;
  },
): Promise<string | null> {
  // Best-effort lookup: surface ONE overlapping appointment id so the UI can
  // link to it. EXCLUDE has already prevented the create; we just want the
  // ID for a useful error payload.
  const conflict = await tx.appointment.findFirst({
    where: {
      staffId: args.staffId,
      state: { notIn: ['cancelled', 'no_show'] },
      AND: [
        { scheduledStartAt: { lt: args.scheduledEndAt } },
        { scheduledEndAt: { gt: args.scheduledStartAt } },
      ],
    },
    select: { id: true },
    orderBy: { scheduledStartAt: 'asc' },
  });
  return conflict?.id ?? null;
}

async function validateReferences(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    locationId: string;
    clientId: string;
    staffId: string;
    serviceId: string;
  },
): Promise<{
  durationMinutes: number;
}> {
  const [location, client, staff, service] = await Promise.all([
    tx.location.findFirst({
      where: { id: args.locationId, tenantId: args.tenantId },
      select: { id: true },
    }),
    tx.client.findFirst({
      where: { id: args.clientId, tenantId: args.tenantId },
      select: { id: true },
    }),
    tx.staff.findFirst({
      where: { id: args.staffId, tenantId: args.tenantId },
      select: { id: true, active: true },
    }),
    tx.service.findFirst({
      where: { id: args.serviceId, tenantId: args.tenantId },
      select: { id: true, durationMinutes: true, active: true },
    }),
  ]);
  if (!location)
    throw new InvalidAppointmentReferenceError(
      'locationId',
      'Unknown location for this tenant.',
    );
  if (!client)
    throw new InvalidAppointmentReferenceError(
      'clientId',
      'Unknown client for this tenant.',
    );
  if (!staff)
    throw new InvalidAppointmentReferenceError(
      'staffId',
      'Unknown staff for this tenant.',
    );
  if (!service)
    throw new InvalidAppointmentReferenceError(
      'serviceId',
      'Unknown service for this tenant.',
    );
  return { durationMinutes: service.durationMinutes };
}

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action:
      | 'appointment.created'
      | 'appointment.updated'
      | 'appointment.state_changed'
      | 'appointment.deleted';
    entityId: string;
    before: Appointment | null;
    after: Appointment | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: 'appointment',
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

export async function createAppointment(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    body: CreateAppointmentBody;
  },
): Promise<CreateAppointmentResult> {
  const { tenantId, actorUserId, body } = args;
  const startAt = new Date(body.scheduledStartAt);

  return prisma.$transaction(async (tx) => {
    const { durationMinutes } = await validateReferences(tx, {
      tenantId,
      locationId: body.locationId,
      clientId: body.clientId,
      staffId: body.staffId,
      serviceId: body.serviceId,
    });

    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

    let appointment: Appointment;
    try {
      appointment = await tx.appointment.create({
        data: {
          tenantId,
          locationId: body.locationId,
          clientId: body.clientId,
          staffId: body.staffId,
          serviceId: body.serviceId,
          scheduledStartAt: startAt,
          scheduledEndAt: endAt,
          state: body.state ?? 'confirmed',
          notes: body.notes,
          createdByUserId: actorUserId,
        },
        select: APPOINTMENT_SAFE_FIELDS,
      });
    } catch (err) {
      if (isExclusionViolation(err)) {
        const conflictingAppointmentId = await findConflictingAppointmentId(tx, {
          staffId: body.staffId,
          scheduledStartAt: startAt,
          scheduledEndAt: endAt,
        });
        throw new AppointmentSlotConflictError({
          staffId: body.staffId,
          scheduledStartAt: startAt,
          scheduledEndAt: endAt,
          conflictingAppointmentId,
        });
      }
      throw err;
    }

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'appointment.created',
      entityId: appointment.id,
      before: null,
      after: appointment,
    });

    return { appointment };
  });
}

export async function listAppointments(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    query: ListAppointmentsQuery;
  },
): Promise<{ appointments: Appointment[]; total: number }> {
  const { tenantId, query } = args;

  const where: Prisma.AppointmentWhereInput = { tenantId };
  if (query.staffId) where.staffId = query.staffId;
  if (query.clientId) where.clientId = query.clientId;
  if (query.state) where.state = query.state;
  if (query.from || query.to) {
    where.scheduledStartAt = {};
    if (query.from) where.scheduledStartAt.gte = new Date(query.from);
    if (query.to) where.scheduledStartAt.lt = new Date(query.to);
  }
  if (query.includeDeleted) {
    where.deletedAt = undefined;
  }

  const [appointments, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      select: APPOINTMENT_SAFE_FIELDS,
      orderBy: [{ scheduledStartAt: 'asc' }, { id: 'asc' }],
      take: query.take,
      skip: query.skip,
    }),
    prisma.appointment.count({ where }),
  ]);

  return { appointments, total };
}

export async function getAppointmentById(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; id: string },
): Promise<Appointment | null> {
  return prisma.appointment.findFirst({
    where: { tenantId: args.tenantId, id: args.id },
    select: APPOINTMENT_SAFE_FIELDS,
  });
}

export async function updateAppointment(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    body: UpdateAppointmentBody;
  },
): Promise<UpdateAppointmentResult | null> {
  const { tenantId, actorUserId, id, body } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.appointment.findFirst({
      where: { tenantId, id },
      select: APPOINTMENT_SAFE_FIELDS,
    });
    if (!before) return null;

    // Empty PATCH → no-op. Don't write an audit row for a non-change.
    const hasChanges = Object.keys(body).length > 0;
    if (!hasChanges) {
      return { appointment: before };
    }

    const after = await tx.appointment.update({
      where: { id },
      data: body,
      select: APPOINTMENT_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'appointment.updated',
      entityId: after.id,
      before,
      after,
    });

    return { appointment: after };
  });
}

export async function transitionAppointmentState(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    to: AppointmentStatus;
    reason: string | undefined;
  },
): Promise<TransitionAppointmentResult | null> {
  const { tenantId, actorUserId, id, to, reason } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.appointment.findFirst({
      where: { tenantId, id },
      select: APPOINTMENT_SAFE_FIELDS,
    });
    if (!before) return null;

    // Validate the transition. Throws InvalidStateTransitionError on bad input.
    assertTransition(before.state, to);

    // When transitioning to cancelled, capture metadata.
    const cancellationFields =
      to === 'cancelled'
        ? {
            cancelledAt: new Date(),
            cancelledByUserId: actorUserId,
            cancelReason: reason,
          }
        : {};

    const after = await tx.appointment.update({
      where: { id },
      data: {
        state: to,
        ...cancellationFields,
      },
      select: APPOINTMENT_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'appointment.state_changed',
      entityId: after.id,
      before,
      after,
    });

    return { appointment: after };
  });
}

export async function softDeleteAppointment(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; actorUserId: string; id: string },
): Promise<{ deleted: boolean }> {
  const { tenantId, actorUserId, id } = args;

  return prisma.$transaction(async (tx) => {
    const before = await tx.appointment.findFirst({
      where: { tenantId, id },
      select: APPOINTMENT_SAFE_FIELDS,
    });
    if (!before) return { deleted: false };

    const after = await tx.appointment.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: APPOINTMENT_SAFE_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'appointment.deleted',
      entityId: id,
      before,
      after,
    });

    return { deleted: true };
  });
}

// Re-export so route layer can `import { ... } from '../services/appointmentService'`.
export { InvalidStateTransitionError };
