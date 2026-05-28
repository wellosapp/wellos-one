// Admin-trigger endpoints for background-job processors.
//
//   POST /admin/jobs/forms/cron        — Forms PR 11; runs processPendingReminders
//                                        + processExpiredSubmissions.
//   POST /admin/jobs/automations/cron  — Automation PR 4; runs processDelayedNodes.
//
// Both designed to be hit by a real scheduler (Railway cron / GitHub Actions
// schedule / BullMQ recurring job) in Epic 8 — until then admins can hit them
// manually for smoke-testing.
//
// Note: requireRole.admin gates ALL access. The scheduler in Epic 8 will
// need a service token mechanism (not yet built); for now the trigger is
// human-only.

import type { FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import { processDelayedNodes } from '../../jobs/automationDelays.js';
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

  // Automation PR 4 — process due delayed-node sentinels. Reuses the same
  // body shape as the forms cron (just an optional batchSize).
  app.post(
    '/jobs/automations/cron',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const parsed = RunCronBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const delays = await processDelayedNodes(app.prisma, {
        log: request.log,
        batchSize: parsed.data.batchSize,
      });

      return reply.send({ delays });
    },
  );
}
