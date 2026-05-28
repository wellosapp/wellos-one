import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  AutomationRunIdParamsSchema,
  ListAutomationRunsQuerySchema,
} from '../../schemas/automationRun.js';
import {
  AutomationRunNotFoundError,
  getAutomationRunDetail,
  listAutomationRuns,
} from '../../services/automationRunService.js';

// /admin/automation-runs/* — PR 5 of the Automation System epic. Read-only
// list + detail of AutomationRun rows. Acting on runs (retry / cancel)
// lands in Phase F.

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

export default async function automationRunsRoutes(
  app: FastifyInstance,
): Promise<void> {
  // GET /admin/automation-runs
  app.get(
    '/automation-runs',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListAutomationRunsQuerySchema.safeParse(
        request.query ?? {},
      );
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const from = parsed.data.from ? new Date(parsed.data.from) : undefined;
      const to = parsed.data.to ? new Date(parsed.data.to) : undefined;

      const result = await listAutomationRuns(app.prisma, {
        tenantId,
        status: parsed.data.status,
        workflowId: parsed.data.workflowId,
        from,
        to,
        cursor: parsed.data.cursor,
        take: parsed.data.take,
      });

      return reply.send(result);
    },
  );

  // GET /admin/automation-runs/:id
  app.get(
    '/automation-runs/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = AutomationRunIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      try {
        const result = await getAutomationRunDetail(app.prisma, {
          tenantId,
          runId: params.data.id,
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof AutomationRunNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: err.message,
            code: err.code,
          });
        }
        throw err;
      }
    },
  );
}
