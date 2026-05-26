import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import { ListClassCheckInAttemptsQuerySchema } from '../../schemas/classCheckInAttempts.js';
import { listClassCheckInAttempts } from '../../services/classCheckInAttemptService.js';

// GET /admin/class-check-in-attempts — fraud-audit list. PR 10 of the
// Geofence Auto Check-in epic.
//
// Auth: requireRole.staff — staff can read the audit log for their tenant.
// Acting on flagged attempts (blocking clients, reversing check-ins from
// review) is out of scope here; that's a future fraud-response epic.

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

const DEFAULT_LOOKBACK_DAYS = 7;

export default async function classCheckInAttemptsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/class-check-in-attempts',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListClassCheckInAttemptsQuerySchema.safeParse(
        request.query ?? {},
      );
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      // Default window: last 7 days. Only applies when BOTH endpoints are
      // omitted — a caller passing only `from` (or only `to`) gets that
      // half-open range respected as-is.
      let from: Date | undefined;
      let to: Date | undefined;
      if (parsed.data.from) from = new Date(parsed.data.from);
      if (parsed.data.to) to = new Date(parsed.data.to);
      if (!from && !to) {
        to = new Date();
        from = new Date(
          to.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
        );
      }

      const result = await listClassCheckInAttempts(app.prisma, {
        tenantId,
        from,
        to,
        result: parsed.data.result,
        classInstanceId: parsed.data.classInstanceId,
        cursor: parsed.data.cursor,
        take: parsed.data.take,
      });

      return reply.send(result);
    },
  );
}
