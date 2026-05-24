import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  CancelClassInstanceBodySchema,
  ClassInstanceIdParamsSchema,
  CreateClassInstanceBodySchema,
  ListClassInstancesQuerySchema,
  UpdateClassInstanceBodySchema,
} from '../../schemas/classInstance.js';
import {
  ClassInstanceAlreadyCancelledError,
  InvalidClassInstanceReferenceError,
  InvalidInstructorForClassError,
  cancelClassInstance,
  createClassInstance,
  getClassInstanceById,
  listClassInstances,
  updateClassInstance,
} from '../../services/classInstanceService.js';

// /admin/class-instances — admin CRUD for per-occurrence Class rows.
// Phase 2a of the Classes epic. Mirrors /admin/classes for shape.
//
// Auth: reads gated by requireRole.staff; writes gated by requireRole.admin.
//
// Error mapping:
//   - InvalidClassInstanceReferenceError → 400 with field-style issue
//   - InvalidInstructorForClassError     → 400 with field=staffId
//   - ClassInstanceAlreadyCancelledError → 409
//   - Validation                         → 400 with issues array

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

export default async function classInstancesRoutes(
  app: FastifyInstance,
): Promise<void> {
  // POST /admin/class-instances — create
  app.post(
    '/class-instances',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = CreateClassInstanceBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      try {
        const result = await createClassInstance(app.prisma, {
          tenantId,
          actorUserId: user.id,
          body: parsed.data,
        });
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof InvalidClassInstanceReferenceError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: err.field, message: err.message }],
          });
        }
        if (err instanceof InvalidInstructorForClassError) {
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

  // GET /admin/class-instances — list with filters
  app.get(
    '/class-instances',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListClassInstancesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const result = await listClassInstances(app.prisma, {
        tenantId,
        query: parsed.data,
      });
      return reply.send(result);
    },
  );

  // GET /admin/class-instances/:id — single
  app.get(
    '/class-instances/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClassInstanceIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const instance = await getClassInstanceById(app.prisma, {
        tenantId,
        id: params.data.id,
      });
      if (!instance) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Class instance not found.',
        });
      }
      return reply.send({ instance });
    },
  );

  // PATCH /admin/class-instances/:id — partial update
  app.patch(
    '/class-instances/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClassInstanceIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = UpdateClassInstanceBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await updateClassInstance(app.prisma, {
          tenantId,
          actorUserId: user.id,
          id: params.data.id,
          body: body.data,
        });
        if (!result) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Class instance not found.',
          });
        }
        return reply.send(result);
      } catch (err) {
        if (err instanceof InvalidClassInstanceReferenceError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: err.field, message: err.message }],
          });
        }
        if (err instanceof InvalidInstructorForClassError) {
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

  // POST /admin/class-instances/:id/cancel — cancel (state → cancelled)
  app.post(
    '/class-instances/:id/cancel',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClassInstanceIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = CancelClassInstanceBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await cancelClassInstance(app.prisma, {
          tenantId,
          actorUserId: user.id,
          id: params.data.id,
          reason: body.data.reason,
        });
        if (!result) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Class instance not found.',
          });
        }
        return reply.send(result);
      } catch (err) {
        if (err instanceof ClassInstanceAlreadyCancelledError) {
          return reply.code(409).send({
            error: 'Conflict',
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
