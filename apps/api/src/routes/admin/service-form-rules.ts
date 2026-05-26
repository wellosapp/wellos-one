import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  ServiceFormRuleIdParamsSchema,
  ServiceFormRuleParamsSchema,
  UpdateFormAssignmentRuleBodySchema,
  UpsertFormAssignmentRuleBodySchema,
} from '../../schemas/formAssignmentRule.js';
import {
  FormAssignmentRuleConflictError,
  FormAssignmentRuleNotFoundError,
  FormDefinitionGroupNotFoundError,
  ServiceNotFoundError,
  createFormAssignmentRule,
  deleteFormAssignmentRule,
  listFormAssignmentRules,
  updateFormAssignmentRule,
} from '../../services/formAssignmentRuleService.js';

// /admin/services/:serviceId/form-rules — per-service form attachment rules.
// Reads (staff). Writes (admin). Tenant scoping via request.currentUser.

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

export default async function serviceFormRulesRoutes(
  app: FastifyInstance,
): Promise<void> {
  // GET /admin/services/:serviceId/form-rules
  app.get(
    '/services/:serviceId/form-rules',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ServiceFormRuleParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      try {
        const result = await listFormAssignmentRules(app.prisma, {
          tenantId,
          serviceId: params.data.serviceId,
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof ServiceNotFoundError) {
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

  // POST /admin/services/:serviceId/form-rules
  app.post(
    '/services/:serviceId/form-rules',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ServiceFormRuleParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = UpsertFormAssignmentRuleBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await createFormAssignmentRule(app.prisma, {
          tenantId,
          actorUserId: user.id,
          serviceId: params.data.serviceId,
          ...body.data,
        });
        return reply.code(201).send({ ...result, created: true });
      } catch (err) {
        if (err instanceof ServiceNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: err.message,
            code: err.code,
          });
        }
        if (err instanceof FormDefinitionGroupNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: err.message,
            code: err.code,
          });
        }
        if (err instanceof FormAssignmentRuleConflictError) {
          return reply.code(409).send({
            error: 'Conflict',
            message: err.message,
            code: err.code,
          });
        }
        throw err;
      }
    },
  );

  // PATCH /admin/services/:serviceId/form-rules/:ruleId
  app.patch(
    '/services/:serviceId/form-rules/:ruleId',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ServiceFormRuleIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = UpdateFormAssignmentRuleBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await updateFormAssignmentRule(app.prisma, {
          tenantId,
          actorUserId: user.id,
          ruleId: params.data.ruleId,
          ...body.data,
        });
        return reply.send({ ...result, created: false });
      } catch (err) {
        if (err instanceof FormAssignmentRuleNotFoundError) {
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

  // DELETE /admin/services/:serviceId/form-rules/:ruleId
  app.delete(
    '/services/:serviceId/form-rules/:ruleId',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ServiceFormRuleIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      try {
        await deleteFormAssignmentRule(app.prisma, {
          tenantId,
          actorUserId: user.id,
          ruleId: params.data.ruleId,
        });
        return reply.code(204).send();
      } catch (err) {
        if (err instanceof FormAssignmentRuleNotFoundError) {
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
