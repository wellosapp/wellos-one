import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { withIdempotency } from '../../middleware/idempotency.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  CreateContentDeliveryBodySchema,
  DeliveryIdParamsSchema,
  ServiceIdParamsSchema,
  UpdateContentDeliveryBodySchema,
} from '../../schemas/contentDeliveries.js';
import {
  InvalidContentDeliveryReferenceError,
  createContentDelivery,
  getContentDeliveryById,
  listContentDeliveries,
  softDeleteContentDelivery,
  updateContentDelivery,
} from '../../services/contentDeliveriesService.js';

// /admin/services/:serviceId/content-deliveries — CRUD for per-service
// scheduled content (prep/aftercare/reminder_with_content) over SMS,
// email, or both (E3-S4e).
//
// Auth: requireRole.admin for write; requireRole.staff for read so
// providers can review what's configured.

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

function refErrorBody(err: InvalidContentDeliveryReferenceError) {
  return {
    error: 'Bad Request',
    message: 'Validation failed.',
    issues: [{ path: err.field, message: err.message }],
  };
}

const NOT_FOUND = {
  error: 'Not Found',
  message: 'Content delivery not found.',
};

export default async function contentDeliveriesRoutes(
  app: FastifyInstance,
): Promise<void> {
  // POST
  app.post(
    '/services/:serviceId/content-deliveries',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ServiceIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));
      const body = CreateContentDeliveryBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(zodErrorBody(body.error));

      return withIdempotency(
        request,
        reply,
        {
          prisma: app.prisma,
          tenantId,
          scope: 'service_content_delivery.create',
        },
        async () => {
          try {
            const result = await createContentDelivery(app.prisma, {
              tenantId,
              actorUserId: user.id,
              serviceId: params.data.serviceId,
              body: body.data,
            });
            return { status: 201, body: result };
          } catch (err) {
            if (err instanceof InvalidContentDeliveryReferenceError) {
              return { status: 400, body: refErrorBody(err) };
            }
            throw err;
          }
        },
      );
    },
  );

  // GET list
  app.get(
    '/services/:serviceId/content-deliveries',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ServiceIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));

      const result = await listContentDeliveries(app.prisma, {
        tenantId,
        serviceId: params.data.serviceId,
      });
      return reply.send(result);
    },
  );

  // GET one
  app.get(
    '/services/:serviceId/content-deliveries/:deliveryId',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = DeliveryIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));

      const delivery = await getContentDeliveryById(app.prisma, {
        tenantId,
        serviceId: params.data.serviceId,
        deliveryId: params.data.deliveryId,
      });
      if (!delivery) return reply.code(404).send(NOT_FOUND);
      return reply.send({ delivery });
    },
  );

  // PATCH
  app.patch(
    '/services/:serviceId/content-deliveries/:deliveryId',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = DeliveryIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));
      const body = UpdateContentDeliveryBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(zodErrorBody(body.error));

      try {
        const result = await updateContentDelivery(app.prisma, {
          tenantId,
          actorUserId: user.id,
          serviceId: params.data.serviceId,
          deliveryId: params.data.deliveryId,
          body: body.data,
        });
        if (!result) return reply.code(404).send(NOT_FOUND);
        return reply.send(result);
      } catch (err) {
        if (err instanceof InvalidContentDeliveryReferenceError) {
          return reply.code(400).send(refErrorBody(err));
        }
        throw err;
      }
    },
  );

  // DELETE (soft)
  app.delete(
    '/services/:serviceId/content-deliveries/:deliveryId',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = DeliveryIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));

      await softDeleteContentDelivery(app.prisma, {
        tenantId,
        actorUserId: user.id,
        serviceId: params.data.serviceId,
        deliveryId: params.data.deliveryId,
      });
      return reply.code(204).send();
    },
  );
}
