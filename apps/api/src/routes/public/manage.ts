import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { withIdempotency } from '../../middleware/idempotency.js';
import {
  CancelByMagicLinkBodySchema,
  ManageTokenParamsSchema,
  RescheduleByMagicLinkBodySchema,
} from '../../schemas/magicLink.js';
import {
  AppointmentRescheduleNotAllowedError,
  AppointmentSlotConflictError,
  AppointmentStaffScheduleBlockConflictError,
  InvalidStateTransitionError,
  transitionAppointmentState,
  updateAppointment,
} from '../../services/appointmentService.js';
import {
  MagicLinkError,
  verifyAndRefreshMagicLink,
} from '../../services/magicLinkService.js';

// Public manage routes (Flow D — reschedule + Flow E — cancel from
// docs/04-booking-flow.md). No Clerk auth — bearer is the magic-link token.
//
// All three routes share the same verify-and-refresh entry point. On the
// first successful open from a reminder, the token's expiresAt slides
// forward another 24h (sliding window per spec).

const RESCHEDULABLE_STATES = new Set([
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
]);

const CANCELLABLE_STATES = new Set([
  'requested',
  'scheduled',
  'confirmed',
  'checked_in',
]);

function zodErrorBody(err: ZodError) {
  return {
    error: 'Bad Request',
    message: 'Validation failed.',
    issues: err.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  };
}

/** Map a MagicLinkError to the public HTTP response envelope.
 *  NOT_FOUND        → 404
 *  EXPIRED / REVOKED → 410 (gone)
 *  PURPOSE_MISMATCH → 400
 */
function magicLinkErrorResponse(err: MagicLinkError): {
  status: number;
  body: { error: string; code: string; message: string };
} {
  switch (err.code) {
    case 'NOT_FOUND':
      return {
        status: 404,
        body: {
          error: 'Not Found',
          code: err.code,
          message: 'This link is invalid.',
        },
      };
    case 'EXPIRED':
      return {
        status: 410,
        body: {
          error: 'Gone',
          code: err.code,
          message: 'This link expired. Ask for a new one.',
        },
      };
    case 'REVOKED':
      return {
        status: 410,
        body: {
          error: 'Gone',
          code: err.code,
          message: 'This link is no longer active.',
        },
      };
    case 'PURPOSE_MISMATCH':
      return {
        status: 400,
        body: {
          error: 'Bad Request',
          code: err.code,
          message: 'This link is for a different action.',
        },
      };
  }
}

export default async function publicManageRoutes(
  app: FastifyInstance,
): Promise<void> {
  // ----- GET /public/manage/:token — appointment view -----
  app.get('/public/manage/:token', async (request, reply) => {
    const params = ManageTokenParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(zodErrorBody(params.error));
    }

    let verified;
    try {
      verified = await verifyAndRefreshMagicLink(
        app.prisma,
        params.data.token,
        'manage_booking',
      );
    } catch (err) {
      if (err instanceof MagicLinkError) {
        const mapped = magicLinkErrorResponse(err);
        return reply.code(mapped.status).send(mapped.body);
      }
      throw err;
    }

    const { tokenRow, appointment } = verified;
    if (!appointment) {
      // Token was valid but the appointment is gone (deleted or never
      // existed). Treat as 404 so the public UI shows a "this link is
      // invalid" state rather than a stale appointment.
      return reply.code(404).send({
        error: 'Not Found',
        code: 'APPOINTMENT_NOT_FOUND',
        message: 'This appointment is no longer available.',
      });
    }

    const now = new Date();
    const inFuture = appointment.scheduledStartAt > now;
    const rescheduleAllowed =
      inFuture && RESCHEDULABLE_STATES.has(appointment.state);
    const cancelAllowed = CANCELLABLE_STATES.has(appointment.state);

    const cancellationDeadline = new Date(
      appointment.scheduledStartAt.getTime() -
        appointment.tenant.bookingCancellationWindowHours * 60 * 60 * 1000,
    );

    return reply.send({
      appointment: {
        id: appointment.id,
        state: appointment.state,
        scheduledStartAt: appointment.scheduledStartAt.toISOString(),
        scheduledEndAt: appointment.scheduledEndAt.toISOString(),
        service: {
          name: appointment.service.name,
          durationMinutes: appointment.service.durationMinutes,
        },
        staff: { firstName: appointment.staff.firstName },
        client: { firstName: appointment.client.firstName },
        cancellationDeadline: cancellationDeadline.toISOString(),
        cancellationFeeCents: appointment.tenant.bookingCancellationFeeCents,
      },
      token: {
        expiresAt: tokenRow.expiresAt.toISOString(),
      },
      rescheduleAllowed,
      cancelAllowed,
    });
  });

  // ----- PATCH /public/manage/:token/cancel — Flow E -----
  app.patch('/public/manage/:token/cancel', async (request, reply) => {
    const params = ManageTokenParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(zodErrorBody(params.error));
    }
    const body = CancelByMagicLinkBodySchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send(zodErrorBody(body.error));
    }

    let verified;
    try {
      verified = await verifyAndRefreshMagicLink(
        app.prisma,
        params.data.token,
        'manage_booking',
      );
    } catch (err) {
      if (err instanceof MagicLinkError) {
        const mapped = magicLinkErrorResponse(err);
        return reply.code(mapped.status).send(mapped.body);
      }
      throw err;
    }

    const { tokenRow, appointment } = verified;
    if (!appointment) {
      return reply.code(404).send({
        error: 'Not Found',
        code: 'APPOINTMENT_NOT_FOUND',
        message: 'This appointment is no longer available.',
      });
    }

    return withIdempotency(
      request,
      reply,
      {
        prisma: app.prisma,
        tenantId: tokenRow.tenantId,
        scope: 'public_manage.cancel',
      },
      async () => {
        try {
          const result = await transitionAppointmentState(app.prisma, {
            tenantId: tokenRow.tenantId,
            // Magic-link cancels have no authenticated user. The service
            // signature accepts string | null; audit + cancelledByUserId
            // store null and the audit row's actorType resolves to 'system'.
            actorUserId: null,
            id: appointment.id,
            to: 'cancelled',
            reason:
              body.data.reason ??
              'Cancelled by client via magic link.',
          });
          if (!result) {
            return {
              status: 404,
              body: {
                error: 'Not Found',
                message: 'Appointment not found.',
              },
            };
          }

          await app.prisma.auditLog.create({
            data: {
              tenantId: tokenRow.tenantId,
              actorUserId: null,
              actorType: 'system',
              action: 'magic_link.used',
              entityType: 'magic_link_token',
              entityId: tokenRow.id,
              before: Prisma.JsonNull,
              after: {
                action: 'cancel',
                appointmentId: appointment.id,
              } as Prisma.InputJsonValue,
            },
          });

          return {
            status: 200,
            body: {
              appointment: {
                id: result.appointment.id,
                state: result.appointment.state,
                cancelledAt: result.appointment.cancelledAt?.toISOString() ?? null,
              },
              message:
                'Appointment cancelled. Sorry to miss you — rebook anytime.',
            },
          };
        } catch (err) {
          if (err instanceof InvalidStateTransitionError) {
            return {
              status: 409,
              body: {
                error: 'Conflict',
                code: 'INVALID_STATE_TRANSITION',
                message: `Cannot cancel an appointment in state ${err.from}.`,
              },
            };
          }
          throw err;
        }
      },
    );
  });

  // ----- PATCH /public/manage/:token/reschedule — Flow D -----
  app.patch('/public/manage/:token/reschedule', async (request, reply) => {
    const params = ManageTokenParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(zodErrorBody(params.error));
    }
    const body = RescheduleByMagicLinkBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(zodErrorBody(body.error));
    }

    let verified;
    try {
      verified = await verifyAndRefreshMagicLink(
        app.prisma,
        params.data.token,
        'manage_booking',
      );
    } catch (err) {
      if (err instanceof MagicLinkError) {
        const mapped = magicLinkErrorResponse(err);
        return reply.code(mapped.status).send(mapped.body);
      }
      throw err;
    }

    const { tokenRow, appointment } = verified;
    if (!appointment) {
      return reply.code(404).send({
        error: 'Not Found',
        code: 'APPOINTMENT_NOT_FOUND',
        message: 'This appointment is no longer available.',
      });
    }

    if (!RESCHEDULABLE_STATES.has(appointment.state)) {
      return reply.code(409).send({
        error: 'Conflict',
        code: 'RESCHEDULE_NOT_ALLOWED',
        message: 'This appointment cannot be rescheduled in its current state.',
      });
    }

    return withIdempotency(
      request,
      reply,
      {
        prisma: app.prisma,
        tenantId: tokenRow.tenantId,
        scope: 'public_manage.reschedule',
      },
      async () => {
        try {
          // updateAppointment recomputes scheduledEndAt from Service.durationMinutes
          // and runs the EXCLUDE constraint + staff-schedule-block checks. The
          // client never sends scheduledEndAt — server is the source of truth
          // for duration.
          const result = await updateAppointment(app.prisma, {
            tenantId: tokenRow.tenantId,
            actorUserId: null,
            id: appointment.id,
            body: {
              scheduledStartAt: body.data.newScheduledStartAt,
            },
          });
          if (!result) {
            return {
              status: 404,
              body: {
                error: 'Not Found',
                message: 'Appointment not found.',
              },
            };
          }

          await app.prisma.auditLog.create({
            data: {
              tenantId: tokenRow.tenantId,
              actorUserId: null,
              actorType: 'system',
              action: 'magic_link.used',
              entityType: 'magic_link_token',
              entityId: tokenRow.id,
              before: Prisma.JsonNull,
              after: {
                action: 'reschedule',
                appointmentId: appointment.id,
                previousScheduledStartAt:
                  appointment.scheduledStartAt.toISOString(),
                newScheduledStartAt:
                  result.appointment.scheduledStartAt.toISOString(),
              } as Prisma.InputJsonValue,
            },
          });

          return {
            status: 200,
            body: {
              appointment: {
                id: result.appointment.id,
                state: result.appointment.state,
                scheduledStartAt:
                  result.appointment.scheduledStartAt.toISOString(),
                scheduledEndAt:
                  result.appointment.scheduledEndAt.toISOString(),
              },
              message: 'Appointment rescheduled.',
            },
          };
        } catch (err) {
          if (err instanceof AppointmentRescheduleNotAllowedError) {
            return {
              status: 409,
              body: {
                error: 'Conflict',
                code: 'RESCHEDULE_NOT_ALLOWED',
                message: err.message,
              },
            };
          }
          if (err instanceof AppointmentSlotConflictError) {
            return {
              status: 409,
              body: {
                error: 'Conflict',
                code: 'SLOT_CONFLICT',
                message: err.message,
                conflict: {
                  appointmentId: err.conflictingAppointmentId,
                  staffId: err.staffId,
                  scheduledStartAt: err.scheduledStartAt.toISOString(),
                  scheduledEndAt: err.scheduledEndAt.toISOString(),
                },
              },
            };
          }
          if (err instanceof AppointmentStaffScheduleBlockConflictError) {
            return {
              status: 409,
              body: {
                error: 'Conflict',
                code: 'STAFF_SCHEDULE_BLOCK_CONFLICT',
                message: err.message,
                conflict: {
                  type: 'staff_schedule_block',
                  blockId: err.blockId,
                  blockTitle: err.blockTitle,
                  blockStartsAt: err.blockStartsAt.toISOString(),
                  blockEndsAt: err.blockEndsAt.toISOString(),
                  staffId: err.staffId,
                  scheduledStartAt: err.scheduledStartAt.toISOString(),
                  scheduledEndAt: err.scheduledEndAt.toISOString(),
                },
              },
            };
          }
          throw err;
        }
      },
    );
  });
}
