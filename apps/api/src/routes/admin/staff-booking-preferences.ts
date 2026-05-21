import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import {
  isPrivilegedCalendarUser,
  resolveStaffMemberIdForUser,
} from '../../auth/calendarStaffScope.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  StaffIdParamsSchema,
  UpdateStaffBookingPreferencesBodySchema,
} from '../../schemas/bookingSettings.js';
import {
  getStaffBookingPreferences,
  updateStaffBookingPreferences,
} from '../../services/bookingSettingsService.js';

// /admin/staff/:id/booking-preferences — per-staff booking override fields
// (R2 §12). Admin/manager can read+write any staff row in their tenant;
// rank-and-file staff can only read+write their own row.

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

export default async function staffBookingPreferencesRoutes(
  app: FastifyInstance,
): Promise<void> {
  // Helper: enforce "admin/manager OR own staff row".
  async function authorize(
    request: FastifyRequest,
    reply: FastifyReply,
    paramsStaffId: string,
  ): Promise<true | undefined> {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;
    if (isPrivilegedCalendarUser(user)) return true;
    const selfId = await resolveStaffMemberIdForUser(
      app.prisma,
      tenantId,
      user.email,
    );
    if (!selfId) {
      reply.code(403).send({
        error: 'Forbidden',
        message:
          'No staff profile linked to your account. Ask an admin to set your Work email on Staff.',
      });
      return undefined;
    }
    if (paramsStaffId !== selfId) {
      reply.code(403).send({
        error: 'Forbidden',
        message: 'You can only view your own staff preferences.',
      });
      return undefined;
    }
    return true;
  }

  app.get(
    '/staff/:id/booking-preferences',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const params = StaffIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const ok = await authorize(request, reply, params.data.id);
      if (!ok) return;

      const tenantId = request.currentUser!.tenantId!;
      const prefs = await getStaffBookingPreferences(app.prisma, {
        tenantId,
        staffId: params.data.id,
      });
      if (!prefs) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Staff not found.',
        });
      }
      return reply.send({ preferences: prefs });
    },
  );

  app.patch(
    '/staff/:id/booking-preferences',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const params = StaffIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = UpdateStaffBookingPreferencesBodySchema.safeParse(
        request.body,
      );
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      const ok = await authorize(request, reply, params.data.id);
      if (!ok) return;

      const user = request.currentUser!;
      const tenantId = user.tenantId!;
      const prefs = await updateStaffBookingPreferences(app.prisma, {
        tenantId,
        actorUserId: user.id,
        staffId: params.data.id,
        body: body.data,
      });
      if (!prefs) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Staff not found.',
        });
      }
      return reply.send({ preferences: prefs });
    },
  );
}
