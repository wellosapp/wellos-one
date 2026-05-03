import type { FastifyInstance } from 'fastify';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  CreateServiceCategoryBodySchema,
  ListServiceCategoriesQuerySchema,
  ServiceCategoryIdParamsSchema,
  UpdateServiceCategoryBodySchema,
} from '../../schemas/serviceCategory.js';
import {
  DuplicateServiceCategoryNameError,
  createServiceCategory,
  listServiceCategories,
  softDeleteServiceCategory,
  updateServiceCategory,
} from '../../services/serviceCategoryService.js';

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

export default async function serviceCategoriesRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/service-categories',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListServiceCategoriesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const result = await listServiceCategories(app.prisma, {
        tenantId,
        query: parsed.data,
      });
      return reply.send(result);
    },
  );

  app.post(
    '/service-categories',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = CreateServiceCategoryBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      try {
        const result = await createServiceCategory(app.prisma, {
          tenantId,
          actorUserId: user.id,
          body: parsed.data,
        });
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof DuplicateServiceCategoryNameError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [
              {
                path: 'name',
                message: err.message,
              },
            ],
          });
        }
        if (
          err instanceof PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [
              {
                path: 'name',
                message: 'A category with this name already exists.',
              },
            ],
          });
        }
        throw err;
      }
    },
  );

  app.patch(
    '/service-categories/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ServiceCategoryIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const parsed = UpdateServiceCategoryBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      if (Object.keys(parsed.data).length === 0) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'No fields to update.',
        });
      }

      try {
        const result = await updateServiceCategory(app.prisma, {
          tenantId,
          actorUserId: user.id,
          id: params.data.id,
          body: parsed.data,
        });
        if (!result) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Category not found.',
          });
        }
        return reply.send(result);
      } catch (err) {
        if (err instanceof DuplicateServiceCategoryNameError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [{ path: 'name', message: err.message }],
          });
        }
        if (
          err instanceof PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Validation failed.',
            issues: [
              {
                path: 'name',
                message: 'A category with this name already exists.',
              },
            ],
          });
        }
        throw err;
      }
    },
  );

  app.delete(
    '/service-categories/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ServiceCategoryIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const result = await softDeleteServiceCategory(app.prisma, {
        tenantId,
        actorUserId: user.id,
        id: params.data.id,
      });
      if (!result.deleted) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Category not found.',
        });
      }
      return reply.code(204).send();
    },
  );
}
