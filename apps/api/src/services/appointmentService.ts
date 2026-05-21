import { Prisma } from '@prisma/client';
import type {
  Appointment,
  AppointmentStatus,
  ClientIntakeStatus,
} from '@prisma/client';

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
import { findEligibleEntriesForOpening } from './waitlistService.js';

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
  bookedBasePriceCents: true,
  // Tier B — recurring series (docs/04-booking-flow.md / coverage matrix §3).
  // Non-null when this row was generated as one occurrence of an
  // AppointmentSeries; null for one-off bookings.
  seriesId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.AppointmentSelect;

/** List/detail wire shape: appointment scalars + client intake for CRM/calendar chips. */
export type AppointmentWithClientIntake = Appointment & {
  clientIntakeStatus: ClientIntakeStatus;
};

const APPOINTMENT_WITH_CLIENT_INTAKE_SELECT = {
  ...APPOINTMENT_SAFE_FIELDS,
  client: { select: { intakeStatus: true } },
} satisfies Prisma.AppointmentSelect;

type AppointmentClientIntakeRow = Prisma.AppointmentGetPayload<{
  select: typeof APPOINTMENT_WITH_CLIENT_INTAKE_SELECT;
}>;

function toAppointmentWithClientIntake(
  row: AppointmentClientIntakeRow,
): AppointmentWithClientIntake {
  const { client, ...rest } = row;
  return { ...rest, clientIntakeStatus: client.intakeStatus };
}

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

/** Appointment overlaps a staff schedule block (break, PTO, closure, etc.). */
export class AppointmentStaffScheduleBlockConflictError extends Error {
  code = 'APPOINTMENT_STAFF_SCHEDULE_BLOCK_CONFLICT' as const;
  blockId: string;
  blockTitle: string;
  blockStartsAt: Date;
  blockEndsAt: Date;
  staffId: string;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  constructor(args: {
    blockId: string;
    blockTitle: string;
    blockStartsAt: Date;
    blockEndsAt: Date;
    staffId: string;
    scheduledStartAt: Date;
    scheduledEndAt: Date;
  }) {
    super('This time range overlaps blocked time on the staff schedule.');
    this.name = 'AppointmentStaffScheduleBlockConflictError';
    this.blockId = args.blockId;
    this.blockTitle = args.blockTitle;
    this.blockStartsAt = args.blockStartsAt;
    this.blockEndsAt = args.blockEndsAt;
    this.staffId = args.staffId;
    this.scheduledStartAt = args.scheduledStartAt;
    this.scheduledEndAt = args.scheduledEndAt;
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

/** Terminal or completed appointments cannot move on the calendar via PATCH. */
export class AppointmentRescheduleNotAllowedError extends Error {
  code = 'APPOINTMENT_RESCHEDULE_NOT_ALLOWED' as const;
  constructor(
    message = 'This appointment cannot be rescheduled in its current state.',
  ) {
    super(message);
    this.name = 'AppointmentRescheduleNotAllowedError';
  }
}

const RESCHEDULABLE_STATES: AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
];

function appointmentAllowsCalendarReschedule(state: AppointmentStatus): boolean {
  return RESCHEDULABLE_STATES.includes(state);
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
    /** When updating an appointment, exclude its current row from overlap lookup. */
    excludeAppointmentId?: string;
  },
): Promise<string | null> {
  // Best-effort lookup: surface ONE overlapping appointment id so the UI can
  // link to it. EXCLUDE has already prevented the create; we just want the
  // ID for a useful error payload.
  const conflict = await tx.appointment.findFirst({
    where: {
      staffId: args.staffId,
      state: { notIn: ['cancelled', 'no_show'] },
      ...(args.excludeAppointmentId
        ? { id: { not: args.excludeAppointmentId } }
        : {}),
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
  basePriceCents: number;
}> {
  const [location, client, staff, service, assignmentCount, assignmentHit] =
    await Promise.all([
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
        select: {
          id: true,
          durationMinutes: true,
          active: true,
          basePriceCents: true,
        },
      }),
      tx.staffService.count({
        where: { serviceId: args.serviceId },
      }),
      tx.staffService.findFirst({
        where: { serviceId: args.serviceId, staffId: args.staffId },
        select: { staffId: true },
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
  // Staff eligibility: when the service has explicit StaffService rows, the
  // pair must exist; when no rows (legacy / open assignment), any staff OK.
  if (assignmentCount > 0 && !assignmentHit) {
    throw new InvalidAppointmentReferenceError(
      'serviceId',
      'This staff member is not assigned to this service.',
    );
  }
  return {
    durationMinutes: service.durationMinutes,
    basePriceCents: service.basePriceCents,
  };
}

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string | null;
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
      actorType: args.actorUserId ? 'user' : 'system',
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
    /** Null when created by the login-free public booking surface (Epic 4). */
    actorUserId: string | null;
    body: CreateAppointmentBody;
  },
): Promise<CreateAppointmentResult> {
  const { tenantId, actorUserId, body } = args;
  const startAt = new Date(body.scheduledStartAt);

  return prisma.$transaction(async (tx) => {
    const { durationMinutes, basePriceCents } = await validateReferences(tx, {
      tenantId,
      locationId: body.locationId,
      clientId: body.clientId,
      staffId: body.staffId,
      serviceId: body.serviceId,
    });

    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

    const blockHit = await tx.staffScheduleBlock.findFirst({
      where: {
        tenantId,
        staffId: body.staffId,
        deletedAt: null,
        AND: [
          { startsAt: { lt: endAt } },
          { endsAt: { gt: startAt } },
          {
            OR: [{ locationId: null }, { locationId: body.locationId }],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
      },
    });
    if (blockHit) {
      throw new AppointmentStaffScheduleBlockConflictError({
        blockId: blockHit.id,
        blockTitle: blockHit.title,
        blockStartsAt: blockHit.startsAt,
        blockEndsAt: blockHit.endsAt,
        staffId: body.staffId,
        scheduledStartAt: startAt,
        scheduledEndAt: endAt,
      });
    }

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
          bookedBasePriceCents: basePriceCents,
          source: body.source ?? 'staff',
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
): Promise<{ appointments: AppointmentWithClientIntake[]; total: number }> {
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

  const [rows, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      select: APPOINTMENT_WITH_CLIENT_INTAKE_SELECT,
      orderBy: [{ scheduledStartAt: 'asc' }, { id: 'asc' }],
      take: query.take,
      skip: query.skip,
    }),
    prisma.appointment.count({ where }),
  ]);

  return {
    appointments: rows.map(toAppointmentWithClientIntake),
    total,
  };
}

export async function getAppointmentById(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; id: string },
): Promise<AppointmentWithClientIntake | null> {
  const row = await prisma.appointment.findFirst({
    where: { tenantId: args.tenantId, id: args.id },
    select: APPOINTMENT_WITH_CLIENT_INTAKE_SELECT,
  });
  return row ? toAppointmentWithClientIntake(row) : null;
}

export async function updateAppointment(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    id: string;
    body: UpdateAppointmentBody;
    /** Set when PATCH includes x-wellos-calendar-drag (calendar UI drag-drop). */
    markCalendarDrag?: boolean;
  },
): Promise<UpdateAppointmentResult | null> {
  const { tenantId, actorUserId, id, body, markCalendarDrag } = args;

  const wantsReschedule =
    body.scheduledStartAt !== undefined ||
    body.staffId !== undefined ||
    body.locationId !== undefined;

  const hasPatch =
    body.notes !== undefined ||
    body.scheduledStartAt !== undefined ||
    body.staffId !== undefined ||
    body.locationId !== undefined;

  if (!hasPatch) {
    const existing = await prisma.appointment.findFirst({
      where: { tenantId, id },
      select: APPOINTMENT_SAFE_FIELDS,
    });
    return existing ? { appointment: existing } : null;
  }

  return prisma.$transaction(async (tx) => {
    const before = await tx.appointment.findFirst({
      where: { tenantId, id },
      select: APPOINTMENT_SAFE_FIELDS,
    });
    if (!before) return null;

    if (!wantsReschedule) {
      const after = await tx.appointment.update({
        where: { id },
        data: { notes: body.notes },
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
    }

    if (!appointmentAllowsCalendarReschedule(before.state)) {
      throw new AppointmentRescheduleNotAllowedError();
    }

    const nextLocationId = body.locationId ?? before.locationId;
    const nextStaffId = body.staffId ?? before.staffId;
    const nextStartAt =
      body.scheduledStartAt !== undefined
        ? new Date(body.scheduledStartAt)
        : before.scheduledStartAt;

    const { durationMinutes } = await validateReferences(tx, {
      tenantId,
      locationId: nextLocationId,
      clientId: before.clientId,
      staffId: nextStaffId,
      serviceId: before.serviceId,
    });

    const endAt = new Date(nextStartAt.getTime() + durationMinutes * 60_000);

    const blockHit = await tx.staffScheduleBlock.findFirst({
      where: {
        tenantId,
        staffId: nextStaffId,
        deletedAt: null,
        AND: [
          { startsAt: { lt: endAt } },
          { endsAt: { gt: nextStartAt } },
          {
            OR: [{ locationId: null }, { locationId: nextLocationId }],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
      },
    });
    if (blockHit) {
      throw new AppointmentStaffScheduleBlockConflictError({
        blockId: blockHit.id,
        blockTitle: blockHit.title,
        blockStartsAt: blockHit.startsAt,
        blockEndsAt: blockHit.endsAt,
        staffId: nextStaffId,
        scheduledStartAt: nextStartAt,
        scheduledEndAt: endAt,
      });
    }

    let after: Appointment;
    try {
      after = await tx.appointment.update({
        where: { id },
        data: {
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          scheduledStartAt: nextStartAt,
          scheduledEndAt: endAt,
          locationId: nextLocationId,
          staffId: nextStaffId,
          ...(markCalendarDrag ? { source: 'calendar_drag' } : {}),
        },
        select: APPOINTMENT_SAFE_FIELDS,
      });
    } catch (err) {
      if (isExclusionViolation(err)) {
        const conflictingAppointmentId = await findConflictingAppointmentId(tx, {
          staffId: nextStaffId,
          scheduledStartAt: nextStartAt,
          scheduledEndAt: endAt,
          excludeAppointmentId: id,
        });
        throw new AppointmentSlotConflictError({
          staffId: nextStaffId,
          scheduledStartAt: nextStartAt,
          scheduledEndAt: endAt,
          conflictingAppointmentId,
        });
      }
      throw err;
    }

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

  const result = await prisma.$transaction(async (tx) => {
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

  // R2 §10.2 — waitlist match on cancellation. Run AFTER the state-change tx
  // commits so a slow read on waitlist_entries can't block the appointment
  // update. Epic 8 wires SMS/email dispatch via BullMQ; this PR only logs
  // eligibility so the matching engine can be smoke-tested end-to-end.
  if (result && to === 'cancelled') {
    try {
      const eligible = await findEligibleEntriesForOpening(prisma, {
        tenantId,
        serviceId: result.appointment.serviceId,
        staffId: result.appointment.staffId,
        startsAt: result.appointment.scheduledStartAt,
        endsAt: result.appointment.scheduledEndAt,
      });
      // Service-layer logging convention is `console.info` — Fastify's Pino
      // logger captures stdout in Railway. Move to request.log when this
      // path lands behind the Epic 8 BullMQ worker.
      // eslint-disable-next-line no-console
      console.info(
        '[waitlist] would offer slot to %d eligible entries on appointment cancellation %s',
        eligible.length,
        result.appointment.id,
      );
    } catch (err) {
      // Never let a waitlist-lookup failure escape the cancellation flow —
      // the appointment is already cancelled in the DB.
      // eslint-disable-next-line no-console
      console.warn(
        '[waitlist] eligibility lookup failed after cancellation %s: %s',
        result.appointment.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return result;
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
