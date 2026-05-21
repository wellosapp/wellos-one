import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { resolveStaffMemberIdForUser } from '../auth/calendarStaffScope.js';
import { requireRole } from '../middleware/requireRole.js';
import { UpdateStaffBookingPreferencesBodySchema } from '../schemas/bookingSettings.js';
import {
  getStaffBookingPreferences,
  updateStaffBookingPreferences,
} from '../services/bookingSettingsService.js';

// Top-level /staff/* self-service surface for the signed-in staff member.
// Thin wrapper over the same service the admin route uses — the wrapper
// exists so staff don't need to know their own staffId in the URL.

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

export default async function staffSelfRoutes(
  app: FastifyInstance,
): Promise<void> {
  // Helper: resolve current user's own Staff row. Returns null + 403-style
  // reply when the user has no linked Staff profile. Returning null from
  // the helper signals "reply already sent" to the caller.
  async function loadOwnStaffId(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ staffId: string; tenantId: string } | null> {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;
    const staffId = await resolveStaffMemberIdForUser(
      app.prisma,
      tenantId,
      user.email,
    );
    if (!staffId) {
      reply.code(403).send({
        error: 'Forbidden',
        message:
          'No staff profile linked to your account. Ask an admin to set your Work email on Staff.',
      });
      return null;
    }
    return { staffId, tenantId };
  }

  app.get(
    '/staff/my-booking-preferences',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const ctx = await loadOwnStaffId(request, reply);
      if (!ctx) return;

      const prefs = await getStaffBookingPreferences(app.prisma, ctx);
      if (!prefs) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Staff profile not found.',
        });
      }
      return reply.send({ preferences: prefs });
    },
  );

  app.patch(
    '/staff/my-booking-preferences',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const body = UpdateStaffBookingPreferencesBodySchema.safeParse(
        request.body,
      );
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      const ctx = await loadOwnStaffId(request, reply);
      if (!ctx) return;

      const prefs = await updateStaffBookingPreferences(app.prisma, {
        tenantId: ctx.tenantId,
        actorUserId: request.currentUser!.id,
        staffId: ctx.staffId,
        body: body.data,
      });
      if (!prefs) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Staff profile not found.',
        });
      }
      return reply.send({ preferences: prefs });
    },
  );
}
