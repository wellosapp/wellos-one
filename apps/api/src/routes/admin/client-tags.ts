import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  ClientTagIdParamsSchema,
  CreateClientTagBodySchema,
  ListClientTagsQuerySchema,
  UpdateClientTagBodySchema,
} from '../../schemas/clientTag.js';
import {
  DuplicateClientTagNameError,
  createClientTag,
  getClientTagById,
  listClientTags,
  softDeleteClientTag,
  updateClientTag,
} from '../../services/clientTagService.js';

// /admin/client-tags — admin CRUD for tenant-scoped client tag records.
// Mirrors /admin/services. M2M assignment to clients lives on the Client
// create/update body (tagIds[]); see routes/admin/clients.ts.
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

function duplicateNameBody(err: DuplicateClientTagNameError) {
  return {
    error: 'Bad Request',
    message: 'Validation failed.',
    issues: [{ path: 'name', message: err.message }],
  };
}

export default async function clientTagsRoutes(
  app: FastifyInstance,
): Promise<void> {
  // POST /admin/client-tags — create
  app.post(
    '/client-tags',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = CreateClientTagBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      try {
        const result = await createClientTag(app.prisma, {
          tenantId,
          actorUserId: user.id,
          body: parsed.data,
        });
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof DuplicateClientTagNameError) {
          return reply.code(400).send(duplicateNameBody(err));
        }
        throw err;
      }
    },
  );

  // GET /admin/client-tags — list with optional filters + pagination
  app.get(
    '/client-tags',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListClientTagsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const result = await listClientTags(app.prisma, {
        tenantId,
        query: parsed.data,
      });
      return reply.send(result);
    },
  );

  // GET /admin/client-tags/:id — one
  app.get(
    '/client-tags/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClientTagIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const tag = await getClientTagById(app.prisma, {
        tenantId,
        id: params.data.id,
      });
      if (!tag) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Client tag not found.',
        });
      }
      return reply.send({ tag });
    },
  );

  // PATCH /admin/client-tags/:id — partial update
  app.patch(
    '/client-tags/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClientTagIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = UpdateClientTagBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await updateClientTag(app.prisma, {
          tenantId,
          actorUserId: user.id,
          id: params.data.id,
          body: body.data,
        });
        if (!result) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Client tag not found.',
          });
        }
        return reply.send(result);
      } catch (err) {
        if (err instanceof DuplicateClientTagNameError) {
          return reply.code(400).send(duplicateNameBody(err));
        }
        throw err;
      }
    },
  );

  // DELETE /admin/client-tags/:id — soft delete
  app.delete(
    '/client-tags/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClientTagIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const { deleted } = await softDeleteClientTag(app.prisma, {
        tenantId,
        actorUserId: user.id,
        id: params.data.id,
      });
      if (!deleted) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Client tag not found.',
        });
      }
      return reply.code(204).send();
    },
  );
}
