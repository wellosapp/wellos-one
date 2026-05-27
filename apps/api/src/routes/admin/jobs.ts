// Forms System PR 11 — admin-trigger endpoint for the form reminder cron.
//
// POST /admin/jobs/forms/cron — runs processPendingReminders +
// processExpiredSubmissions sequentially and returns batch counts. Designed
// to be hit by a real scheduler (Railway cron / GitHub Actions schedule /
// BullMQ recurring job) in Epic 8 — until then admins can hit it manually
// for smoke-testing.
//
// Note: requireRole.admin gates ALL access. The scheduler in Epic 8 will
// need a service token mechanism (not yet built); for now the trigger is
// human-only.

import type { FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  processExpiredSubmissions,
  processPendingReminders,
} from '../../jobs/formReminders.js';

const RunCronBodySchema = z
  .object({
    batchSize: z.number().int().min(1).max(1000).optional(),
  })
  .default({});

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

export default async function jobsRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/jobs/forms/cron',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const parsed = RunCronBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const batchSize = parsed.data.batchSize;

      const reminders = await processPendingReminders(app.prisma, {
        log: request.log,
        batchSize,
      });
      const expiry = await processExpiredSubmissions(app.prisma, {
        log: request.log,
        batchSize,
      });

      return reply.send({ reminders, expiry });
    },
  );
}
