import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import { UpdateTenantBookingSettingsBodySchema } from '../../schemas/bookingSettings.js';
import {
  getTenantBookingSettings,
  updateTenantBookingSettings,
} from '../../services/bookingSettingsService.js';

// /admin/booking-settings — tenant-level booking defaults (R2 §12).
// Per-staff overrides live in admin/staff-booking-preferences and the
// staff self-service routes registered at root level.

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

export default async function bookingSettingsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/booking-settings',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const settings = await getTenantBookingSettings(app.prisma, tenantId);
      if (!settings) {
        // Should never happen — admin requireRole already verified tenant
        // membership. Defensive 404 in case the tenant row was deleted out
        // from under the session.
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Tenant not found.',
        });
      }
      return reply.send({ settings });
    },
  );

  app.patch(
    '/booking-settings',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = UpdateTenantBookingSettingsBodySchema.safeParse(
        request.body,
      );
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const settings = await updateTenantBookingSettings(app.prisma, {
        tenantId,
        actorUserId: user.id,
        body: parsed.data,
      });
      if (!settings) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Tenant not found.',
        });
      }
      return reply.send({ settings });
    },
  );
}
