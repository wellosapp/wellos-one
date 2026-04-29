import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  CreateServiceBodySchema,
  ListServicesQuerySchema,
  ServiceIdParamsSchema,
  UpdateServiceBodySchema,
} from '../../schemas/service.js';
import {
  createService,
  getServiceById,
  listServices,
  softDeleteService,
  updateService,
} from '../../services/serviceService.js';

// /admin/services — admin CRUD for tenant-scoped service records.
// Mirrors /admin/clients (E2-S3a). See clients.ts for the rationale on
// auth, validation, tenant scoping, and idempotency.
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

export default async function servicesRoutes(app: FastifyInstance): Promise<void> {
  // POST /admin/services — create
  app.post('/services', { preHandler: requireRole.admin }, async (request, reply) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const parsed = CreateServiceBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody(parsed.error));
    }

    const result = await createService(app.prisma, {
      tenantId,
      actorUserId: user.id,
      body: parsed.data,
    });

    return reply.code(201).send(result);
  });

  // GET /admin/services — list with optional filters + pagination
  app.get('/services', { preHandler: requireRole.admin }, async (request, reply) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const parsed = ListServicesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody(parsed.error));
    }

    const result = await listServices(app.prisma, {
      tenantId,
      query: parsed.data,
    });
    return reply.send(result);
  });

  // GET /admin/services/:id — one
  app.get('/services/:id', { preHandler: requireRole.admin }, async (request, reply) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const params = ServiceIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(zodErrorBody(params.error));
    }

    const service = await getServiceById(app.prisma, {
      tenantId,
      id: params.data.id,
    });
    if (!service) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Service not found.',
      });
    }
    return reply.send({ service });
  });

  // PATCH /admin/services/:id — partial update
  app.patch('/services/:id', { preHandler: requireRole.admin }, async (request, reply) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const params = ServiceIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(zodErrorBody(params.error));
    }
    const body = UpdateServiceBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(zodErrorBody(body.error));
    }

    const result = await updateService(app.prisma, {
      tenantId,
      actorUserId: user.id,
      id: params.data.id,
      body: body.data,
    });
    if (!result) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Service not found.',
      });
    }
    return reply.send(result);
  });

  // DELETE /admin/services/:id — soft delete
  app.delete('/services/:id', { preHandler: requireRole.admin }, async (request, reply) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const params = ServiceIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(zodErrorBody(params.error));
    }

    const { deleted } = await softDeleteService(app.prisma, {
      tenantId,
      actorUserId: user.id,
      id: params.data.id,
    });
    if (!deleted) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Service not found.',
      });
    }
    return reply.code(204).send();
  });
}
