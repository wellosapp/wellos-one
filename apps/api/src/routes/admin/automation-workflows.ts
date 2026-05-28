import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { withIdempotency } from '../../middleware/idempotency.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  AutomationWorkflowIdParamsSchema,
  CreateAutomationWorkflowBodySchema,
  ListAutomationWorkflowsQuerySchema,
  UpdateAutomationWorkflowBodySchema,
} from '../../schemas/automationWorkflow.js';
import {
  AutomationWorkflowInvalidStateTransitionError,
  AutomationWorkflowJsonInvalidError,
  AutomationWorkflowNotFoundError,
  archiveAutomationWorkflow,
  createAutomationWorkflow,
  getAutomationWorkflow,
  listAutomationWorkflows,
  updateAutomationWorkflow,
} from '../../services/automationWorkflowService.js';

// /admin/automation-workflows/* — PR 6 of the Automation System epic.
// CRUD over AutomationWorkflow rows. Powers the list page at
// /admin/automations and the canvas page at /admin/automations/[id]/edit.

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

export default async function automationWorkflowsRoutes(
  app: FastifyInstance,
): Promise<void> {
  // GET /admin/automation-workflows
  app.get(
    '/automation-workflows',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListAutomationWorkflowsQuerySchema.safeParse(
        request.query ?? {},
      );
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const result = await listAutomationWorkflows(app.prisma, {
        tenantId,
        status: parsed.data.status,
        cursor: parsed.data.cursor,
        take: parsed.data.take,
      });
      return reply.send(result);
    },
  );

  // GET /admin/automation-workflows/:id
  app.get(
    '/automation-workflows/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = AutomationWorkflowIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const workflow = await getAutomationWorkflow(app.prisma, {
        tenantId,
        id: params.data.id,
      });
      if (!workflow) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Automation workflow not found.',
          code: 'AUTOMATION_WORKFLOW_NOT_FOUND',
        });
      }
      return reply.send({ workflow });
    },
  );

  // POST /admin/automation-workflows
  app.post(
    '/automation-workflows',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const body = CreateAutomationWorkflowBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      return withIdempotency(
        request,
        reply,
        {
          prisma: app.prisma,
          tenantId,
          scope: 'automation_workflow.create',
        },
        async () => {
          const result = await createAutomationWorkflow(app.prisma, {
            tenantId,
            actorUserId: user.id,
            name: body.data.name,
            description: body.data.description,
            triggerType: body.data.triggerType,
          });
          return { status: 201, body: result };
        },
      );
    },
  );

  // PATCH /admin/automation-workflows/:id
  app.patch(
    '/automation-workflows/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = AutomationWorkflowIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = UpdateAutomationWorkflowBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await updateAutomationWorkflow(app.prisma, {
          tenantId,
          actorUserId: user.id,
          id: params.data.id,
          name: body.data.name,
          description: body.data.description,
          triggerType: body.data.triggerType,
          status: body.data.status,
          workflowJson: body.data.workflowJson,
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof AutomationWorkflowNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: err.message,
            code: err.code,
          });
        }
        if (err instanceof AutomationWorkflowInvalidStateTransitionError) {
          return reply.code(409).send({
            error: 'Conflict',
            message: err.message,
            code: err.code,
            from: err.from,
            to: err.to,
          });
        }
        if (err instanceof AutomationWorkflowJsonInvalidError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: err.message,
            code: err.code,
            issues: err.issues,
          });
        }
        throw err;
      }
    },
  );

  // POST /admin/automation-workflows/:id/archive
  app.post(
    '/automation-workflows/:id/archive',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = AutomationWorkflowIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      return withIdempotency(
        request,
        reply,
        {
          prisma: app.prisma,
          tenantId,
          scope: 'automation_workflow.archive',
        },
        async () => {
          try {
            const result = await archiveAutomationWorkflow(app.prisma, {
              tenantId,
              actorUserId: user.id,
              id: params.data.id,
            });
            return { status: 200, body: result };
          } catch (err) {
            if (err instanceof AutomationWorkflowNotFoundError) {
              return {
                status: 404,
                body: {
                  error: 'Not Found',
                  message: err.message,
                  code: err.code,
                },
              };
            }
            if (err instanceof AutomationWorkflowInvalidStateTransitionError) {
              return {
                status: 409,
                body: {
                  error: 'Conflict',
                  message: err.message,
                  code: err.code,
                  from: err.from,
                  to: err.to,
                },
              };
            }
            throw err;
          }
        },
      );
    },
  );
}
