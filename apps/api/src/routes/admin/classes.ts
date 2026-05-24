import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  ClassIdParamsSchema,
  CreateClassBodySchema,
  ListClassesQuerySchema,
  UpdateClassBodySchema,
} from '../../schemas/class.js';
import {
  createClass,
  getClassById,
  listClasses,
  softDeleteClass,
  updateClass,
} from '../../services/classService.js';

// /admin/classes — admin CRUD for tenant-scoped Class template records.
// Phase 1 of the Classes epic. Mirrors /admin/services. See services.ts
// for the rationale on auth, validation, and tenant scoping.

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

function isInvalidInstructorIdsError(
  err: unknown,
): err is Error & { code: string } {
  return (
    err instanceof Error &&
    (err as Error & { code?: string }).code === 'INVALID_INSTRUCTOR_IDS'
  );
}

function isInvalidCategoryIdError(
  err: unknown,
): err is Error & { code: string } {
  return (
    err instanceof Error &&
    (err as Error & { code?: string }).code === 'INVALID_CATEGORY_ID'
  );
}

function isInvalidCapacityError(
  err: unknown,
): err is Error & { code: string } {
  return (
    err instanceof Error &&
    (err as Error & { code?: string }).code === 'INVALID_CAPACITY'
  );
}

export default async function classesRoutes(
  app: FastifyInstance,
): Promise<void> {
  // POST /admin/classes — create
  app.post(
    '/classes',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = CreateClassBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      try {
        const result = await createClass(app.prisma, {
          tenantId,
          actorUserId: user.id,
          body: parsed.data,
        });
        return reply.code(201).send(result);
      } catch (err) {
        if (isInvalidInstructorIdsError(err)) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: 'instructorIds', message: err.message }],
          });
        }
        if (isInvalidCategoryIdError(err)) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: 'categoryId', message: err.message }],
          });
        }
        if (isInvalidCapacityError(err)) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: 'minToRun', message: err.message }],
          });
        }
        throw err;
      }
    },
  );

  // GET /admin/classes — list with optional filters + pagination
  app.get(
    '/classes',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListClassesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const result = await listClasses(app.prisma, {
        tenantId,
        query: parsed.data,
      });
      return reply.send(result);
    },
  );

  // GET /admin/classes/:id — single
  app.get(
    '/classes/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClassIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const klass = await getClassById(app.prisma, {
        tenantId,
        id: params.data.id,
      });
      if (!klass) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Class not found.',
        });
      }
      return reply.send({ class: klass });
    },
  );

  // PATCH /admin/classes/:id — partial update
  app.patch(
    '/classes/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClassIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = UpdateClassBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await updateClass(app.prisma, {
          tenantId,
          actorUserId: user.id,
          id: params.data.id,
          body: body.data,
        });
        if (!result) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Class not found.',
          });
        }
        return reply.send(result);
      } catch (err) {
        if (isInvalidInstructorIdsError(err)) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: 'instructorIds', message: err.message }],
          });
        }
        if (isInvalidCategoryIdError(err)) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: 'categoryId', message: err.message }],
          });
        }
        if (isInvalidCapacityError(err)) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: 'minToRun', message: err.message }],
          });
        }
        throw err;
      }
    },
  );

  // DELETE /admin/classes/:id — soft delete
  app.delete(
    '/classes/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClassIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const { deleted } = await softDeleteClass(app.prisma, {
        tenantId,
        actorUserId: user.id,
        id: params.data.id,
      });
      if (!deleted) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Class not found.',
        });
      }
      return reply.code(204).send();
    },
  );
}
