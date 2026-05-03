import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import {
  isPrivilegedCalendarUser,
  resolveStaffMemberIdForUser,
} from '../../auth/calendarStaffScope.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ListAvailabilityQuerySchema } from '../../schemas/appointment.js';
import {
  InvalidAvailabilityRequestError,
  listAvailableSlots,
} from '../../services/availabilityService.js';

// /admin/availability — read-only slot computation for the booking engine
// (E3-S1). Separate from appointments.ts because the auth/audit shape
// differs (no audit row written for reads).

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

export default async function availabilityRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/availability',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListAvailabilityQuerySchema.safeParse(request.query);
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
              'You can only load availability for your own schedule.',
          });
        }
      }

      try {
        const result = await listAvailableSlots(app.prisma, {
          tenantId,
          query: parsed.data,
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof InvalidAvailabilityRequestError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: err.field, message: err.message }],
          });
        }
        throw err;
      }
    },
  );
}
