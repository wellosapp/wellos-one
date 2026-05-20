import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import { StaffBookingClientContextQuerySchema } from '../../schemas/staffBooking.js';
import { getStaffBookingClientContext } from '../../services/staffBookingClientContextService.js';

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

export default async function staffBookingRoutes(
  app: FastifyInstance,
): Promise<void> {
  // GET /admin/staff-booking/client-context
  app.get(
    '/staff-booking/client-context',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = StaffBookingClientContextQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const { clientId, serviceId, staffId } = parsed.data;

      const result = await getStaffBookingClientContext(app.prisma, {
        tenantId,
        clientId,
        serviceId,
        staffId,
      });

      if (!result) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Client not found.',
        });
      }

      return reply.send(result);
    },
  );
}
