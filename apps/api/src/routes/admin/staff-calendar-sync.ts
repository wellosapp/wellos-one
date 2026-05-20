import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import { StaffIdParamsSchema } from '../../schemas/staff.js';
import {
  StaffCalendarFeedStaffNotFoundError,
  regenerateStaffCalendarFeedToken,
} from '../../services/staffCalendarFeedService.js';

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

/**
 * Epic 7 — calendar sync roadmap hooks. ICS minting is admin-only; OAuth is
 * intentionally unimplemented in Phase 5 (501 stub).
 */
export default async function staffCalendarSyncRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    '/staff/:id/calendar-feed/regenerate',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = StaffIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      try {
        const { rawToken, subscribeUrl } = await regenerateStaffCalendarFeedToken(
          app.prisma,
          { tenantId, staffId: params.data.id },
        );

        return reply.code(201).send({
          subscribeUrl,
          token: rawToken,
          message:
            'Store this URL or token securely. The raw token is shown once; regenerate to rotate.',
        });
      } catch (err) {
        if (err instanceof StaffCalendarFeedStaffNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  app.post(
    '/staff/:id/calendar-sync/oauth',
    { preHandler: requireRole.staff },
    async (_request, reply) => {
      return reply.code(501).send({
        error: 'Not Implemented',
        message:
          'Google Calendar and Microsoft Outlook OAuth sync is not available yet. Use the read-only ICS feed (POST …/calendar-feed/regenerate) for Apple Calendar and other clients.',
      });
    },
  );
}
