import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  CreateRecurrenceRuleBodySchema,
  GenerateInstancesBodySchema,
  ListRecurrenceRulesQuerySchema,
  RecurrenceRuleIdParamsSchema,
  UpdateRecurrenceRuleBodySchema,
} from '../../schemas/recurrenceRule.js';
import {
  InvalidInstructorForRecurrenceRuleError,
  InvalidRecurrenceRuleReferenceError,
  createRecurrenceRule,
  generateInstancesForRule,
  getRecurrenceRuleById,
  listRecurrenceRules,
  updateRecurrenceRule,
} from '../../services/recurrenceRuleService.js';

// /admin/recurrence-rules — admin CRUD for class recurrence templates.
// Phase 2b of the Classes epic. Mirrors /admin/class-instances for shape.
//
// Auth: reads gated by requireRole.staff; writes (including generate)
// gated by requireRole.admin. The generate endpoint is treated as a
// write because it materialises ClassInstance rows.
//
// Error mapping:
//   - InvalidRecurrenceRuleReferenceError    → 400 with field-style issue
//   - InvalidInstructorForRecurrenceRuleError → 400 with field=staffId
//   - Validation                              → 400 with issues array

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

export default async function recurrenceRulesRoutes(
  app: FastifyInstance,
): Promise<void> {
  // POST /admin/recurrence-rules — create
  app.post(
    '/recurrence-rules',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = CreateRecurrenceRuleBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      try {
        const result = await createRecurrenceRule(app.prisma, {
          tenantId,
          actorUserId: user.id,
          body: parsed.data,
        });
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof InvalidRecurrenceRuleReferenceError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: err.field, message: err.message }],
          });
        }
        if (err instanceof InvalidInstructorForRecurrenceRuleError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: 'staffId', message: err.message }],
          });
        }
        throw err;
      }
    },
  );

  // GET /admin/recurrence-rules — list with filters
  app.get(
    '/recurrence-rules',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListRecurrenceRulesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const result = await listRecurrenceRules(app.prisma, {
        tenantId,
        query: parsed.data,
      });
      return reply.send(result);
    },
  );

  // GET /admin/recurrence-rules/:id — single
  app.get(
    '/recurrence-rules/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = RecurrenceRuleIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const rule = await getRecurrenceRuleById(app.prisma, {
        tenantId,
        id: params.data.id,
      });
      if (!rule) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Recurrence rule not found.',
        });
      }
      return reply.send({ rule });
    },
  );

  // PATCH /admin/recurrence-rules/:id — partial update (incl. pause via active=false)
  app.patch(
    '/recurrence-rules/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = RecurrenceRuleIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = UpdateRecurrenceRuleBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await updateRecurrenceRule(app.prisma, {
          tenantId,
          actorUserId: user.id,
          id: params.data.id,
          body: body.data,
        });
        if (!result) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Recurrence rule not found.',
          });
        }
        return reply.send(result);
      } catch (err) {
        if (err instanceof InvalidRecurrenceRuleReferenceError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: err.field, message: err.message }],
          });
        }
        if (err instanceof InvalidInstructorForRecurrenceRuleError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: 'staffId', message: err.message }],
          });
        }
        throw err;
      }
    },
  );

  // POST /admin/recurrence-rules/:id/generate-instances — manual generation.
  // Idempotent: re-runs in the same window skip existing rows. Returns
  // { created, skipped, skippedReason? } so the UI can show "Added 18
  // sessions (24 already existed)." Epic 8 wires a BullMQ scheduled job
  // that calls this exact endpoint — no domain changes needed at that
  // point.
  app.post(
    '/recurrence-rules/:id/generate-instances',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = RecurrenceRuleIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = GenerateInstancesBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      const result = await generateInstancesForRule(app.prisma, {
        tenantId,
        ruleId: params.data.id,
        horizonWeeks: body.data.horizonWeeks,
        actorUserId: user.id,
      });
      if (result.skippedReason === 'rule_not_found') {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Recurrence rule not found.',
        });
      }
      return reply.send(result);
    },
  );
}
