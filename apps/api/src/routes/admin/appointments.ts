import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  AppointmentIdParamsSchema,
  CreateAppointmentBodySchema,
  ListAppointmentsQuerySchema,
  TransitionAppointmentBodySchema,
  UpdateAppointmentBodySchema,
} from '../../schemas/appointment.js';
import {
  AppointmentSlotConflictError,
  InvalidAppointmentReferenceError,
  InvalidStateTransitionError,
  createAppointment,
  getAppointmentById,
  listAppointments,
  softDeleteAppointment,
  transitionAppointmentState,
  updateAppointment,
} from '../../services/appointmentService.js';

// /admin/appointments — admin CRUD for the booking engine (E3-S1).
//
// Auth: requireRole.admin (chained loadCurrentUser + admin-only guard).
//
// Validation: Zod parsing of body / query / params at the route layer.
//
// Tenant scoping: every query passes request.currentUser.tenantId.
//
// Error mapping:
//   - InvalidAppointmentReferenceError → 400 with field-style issue
//   - AppointmentSlotConflictError     → 409 with conflict payload
//   - InvalidStateTransitionError      → 400 with field on `to`
//   - Validation                       → 400 with issues array

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

export default async function appointmentsRoutes(
  app: FastifyInstance,
): Promise<void> {
  // POST /admin/appointments
  app.post(
    '/appointments',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = CreateAppointmentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      try {
        const result = await createAppointment(app.prisma, {
          tenantId,
          actorUserId: user.id,
          body: parsed.data,
        });
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof InvalidAppointmentReferenceError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: err.field, message: err.message }],
          });
        }
        if (err instanceof AppointmentSlotConflictError) {
          return reply.code(409).send({
            error: 'Conflict',
            message: err.message,
            conflict: {
              appointmentId: err.conflictingAppointmentId,
              staffId: err.staffId,
              scheduledStartAt: err.scheduledStartAt.toISOString(),
              scheduledEndAt: err.scheduledEndAt.toISOString(),
            },
          });
        }
        throw err;
      }
    },
  );

  // GET /admin/appointments
  app.get(
    '/appointments',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListAppointmentsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const result = await listAppointments(app.prisma, {
        tenantId,
        query: parsed.data,
      });
      return reply.send(result);
    },
  );

  // GET /admin/appointments/:id
  app.get(
    '/appointments/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = AppointmentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const appointment = await getAppointmentById(app.prisma, {
        tenantId,
        id: params.data.id,
      });
      if (!appointment) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Appointment not found.',
        });
      }
      return reply.send({ appointment });
    },
  );

  // PATCH /admin/appointments/:id (notes only — see schema comments)
  app.patch(
    '/appointments/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = AppointmentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = UpdateAppointmentBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      const result = await updateAppointment(app.prisma, {
        tenantId,
        actorUserId: user.id,
        id: params.data.id,
        body: body.data,
      });
      if (!result) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Appointment not found.',
        });
      }
      return reply.send(result);
    },
  );

  // DELETE /admin/appointments/:id (soft-delete)
  app.delete(
    '/appointments/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = AppointmentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const { deleted } = await softDeleteAppointment(app.prisma, {
        tenantId,
        actorUserId: user.id,
        id: params.data.id,
      });
      if (!deleted) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Appointment not found.',
        });
      }
      return reply.code(204).send();
    },
  );

  // POST /admin/appointments/:id/transition
  app.post(
    '/appointments/:id/transition',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = AppointmentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = TransitionAppointmentBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await transitionAppointmentState(app.prisma, {
          tenantId,
          actorUserId: user.id,
          id: params.data.id,
          to: body.data.to,
          reason: body.data.reason,
        });
        if (!result) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Appointment not found.',
          });
        }
        return reply.send(result);
      } catch (err) {
        if (err instanceof InvalidStateTransitionError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [
              {
                path: 'to',
                message: `Cannot transition from ${err.from} to ${err.to}.`,
              },
            ],
          });
        }
        throw err;
      }
    },
  );
}
