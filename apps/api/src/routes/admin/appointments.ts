import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import {
  isPrivilegedCalendarUser,
  resolveStaffMemberIdForUser,
  staffAppointmentScope,
} from '../../auth/calendarStaffScope.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  AppointmentIdParamsSchema,
  CreateAppointmentBodySchema,
  ListAppointmentsQuerySchema,
  LogRequiredFormsBookingAckBodySchema,
  TransitionAppointmentBodySchema,
  UpdateAppointmentBodySchema,
} from '../../schemas/appointment.js';
import {
  AppointmentRescheduleNotAllowedError,
  AppointmentSlotConflictError,
  AppointmentStaffScheduleBlockConflictError,
  InvalidAppointmentReferenceError,
  InvalidStateTransitionError,
  createAppointment,
  getAppointmentById,
  listAppointments,
  softDeleteAppointment,
  transitionAppointmentState,
  updateAppointment,
} from '../../services/appointmentService.js';
import {
  StaffBookingComplianceError,
  logRequiredFormsBookingAcknowledgment,
} from '../../services/staffBookingComplianceService.js';

// /admin/appointments — booking engine CRUD (E3-S1).
//
// Auth: reads + transitions + creates use requireRole.staff; staff without
// admin/manager is scoped to appointments where staff_id matches their linked
// Staff row (email match). Deletes stay admin-only.
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
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = CreateAppointmentBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      if (!isPrivilegedCalendarUser(user)) {
        const selfId = await resolveStaffMemberIdForUser(
          app.prisma,
          tenantId,
          user.email,
        );
        if (!selfId || parsed.data.staffId !== selfId) {
          return reply.code(403).send({
            error: 'Forbidden',
            message:
              'You can only book appointments on your own schedule. Ask an admin for cross-staff booking.',
          });
        }
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
        if (err instanceof AppointmentStaffScheduleBlockConflictError) {
          return reply.code(409).send({
            error: 'Conflict',
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
          });
        }
        throw err;
      }
    },
  );

  // GET /admin/appointments
  app.get(
    '/appointments',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListAppointmentsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      let query = parsed.data;
      if (!isPrivilegedCalendarUser(user)) {
        const selfId = await resolveStaffMemberIdForUser(
          app.prisma,
          tenantId,
          user.email,
        );
        if (!selfId) {
          return reply.code(403).send({
            error: 'Forbidden',
            message:
              'No staff profile linked to your account. Ask an admin to set your Work email on Staff.',
          });
        }
        query = { ...query, staffId: selfId };
      }

      const result = await listAppointments(app.prisma, {
        tenantId,
        query,
      });
      return reply.send(result);
    },
  );

  // GET /admin/appointments/:id
  app.get(
    '/appointments/:id',
    { preHandler: requireRole.staff },
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

      const scope = await staffAppointmentScope(
        app.prisma,
        user,
        tenantId,
        appointment.staffId,
      );
      if (scope === 'no_staff_profile') {
        return reply.code(403).send({
          error: 'Forbidden',
          message:
            'No staff profile linked to your account. Ask an admin to set your Work email on Staff.',
        });
      }
      if (scope === 'forbidden') {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Appointment not found.',
        });
      }

      return reply.send({ appointment });
    },
  );

  // POST /admin/appointments/:id/required-forms-booking-ack
  app.post(
    '/appointments/:id/required-forms-booking-ack',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = AppointmentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const parsedBody = LogRequiredFormsBookingAckBodySchema.safeParse(
        request.body,
      );
      if (!parsedBody.success) {
        return reply.code(400).send(zodErrorBody(parsedBody.error));
      }

      const existing = await getAppointmentById(app.prisma, {
        tenantId,
        id: params.data.id,
      });
      if (!existing) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Appointment not found.',
        });
      }

      const scope = await staffAppointmentScope(
        app.prisma,
        user,
        tenantId,
        existing.staffId,
      );
      if (scope === 'no_staff_profile') {
        return reply.code(403).send({
          error: 'Forbidden',
          message:
            'No staff profile linked to your account. Ask an admin to set your Work email on Staff.',
        });
      }
      if (scope === 'forbidden') {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Appointment not found.',
        });
      }

      try {
        await logRequiredFormsBookingAcknowledgment(app.prisma, {
          tenantId,
          actorUserId: user.id,
          appointmentId: params.data.id,
          staffId: parsedBody.data.staffId,
          clientId: parsedBody.data.clientId,
          serviceId: parsedBody.data.serviceId,
        });
        return reply.code(201).send({ ok: true });
      } catch (err) {
        if (err instanceof StaffBookingComplianceError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  // PATCH /admin/appointments/:id — notes and/or calendar reschedule (see schema).
  app.patch(
    '/appointments/:id',
    { preHandler: requireRole.staff },
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

      const existing = await getAppointmentById(app.prisma, {
        tenantId,
        id: params.data.id,
      });
      if (!existing) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Appointment not found.',
        });
      }

      const scope = await staffAppointmentScope(
        app.prisma,
        user,
        tenantId,
        existing.staffId,
      );
      if (scope === 'no_staff_profile') {
        return reply.code(403).send({
          error: 'Forbidden',
          message:
            'No staff profile linked to your account. Ask an admin to set your Work email on Staff.',
        });
      }
      if (scope === 'forbidden') {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Appointment not found.',
        });
      }

      const payload = body.data;
      const rescheduleRequested =
        payload.scheduledStartAt !== undefined ||
        payload.staffId !== undefined ||
        payload.locationId !== undefined;

      if (rescheduleRequested && !isPrivilegedCalendarUser(user)) {
        const selfId = await resolveStaffMemberIdForUser(
          app.prisma,
          tenantId,
          user.email,
        );
        if (
          payload.staffId !== undefined &&
          payload.staffId !== selfId
        ) {
          return reply.code(403).send({
            error: 'Forbidden',
            message:
              'You can only reschedule within your own column. Ask an admin to move appointments between providers.',
          });
        }
      }

      const dragHeader = request.headers['x-wellos-calendar-drag'];
      const markCalendarDrag =
        rescheduleRequested &&
        (dragHeader === '1' || dragHeader === 'true');

      try {
        const result = await updateAppointment(app.prisma, {
          tenantId,
          actorUserId: user.id,
          id: params.data.id,
          body: body.data,
          markCalendarDrag,
        });
        if (!result) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Appointment not found.',
          });
        }
        return reply.send(result);
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
        if (err instanceof AppointmentStaffScheduleBlockConflictError) {
          return reply.code(409).send({
            error: 'Conflict',
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
          });
        }
        if (err instanceof AppointmentRescheduleNotAllowedError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: err.message,
          });
        }
        throw err;
      }
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
    { preHandler: requireRole.staff },
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

      const existing = await getAppointmentById(app.prisma, {
        tenantId,
        id: params.data.id,
      });
      if (!existing) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Appointment not found.',
        });
      }

      const scope = await staffAppointmentScope(
        app.prisma,
        user,
        tenantId,
        existing.staffId,
      );
      if (scope === 'no_staff_profile') {
        return reply.code(403).send({
          error: 'Forbidden',
          message:
            'No staff profile linked to your account. Ask an admin to set your Work email on Staff.',
        });
      }
      if (scope === 'forbidden') {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Appointment not found.',
        });
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
