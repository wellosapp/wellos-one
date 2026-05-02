import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  ClientIdParamsSchema,
  CreateClientBodySchema,
  ListClientsQuerySchema,
  UpdateClientBodySchema,
} from '../../schemas/client.js';
import {
  createClient,
  getClientById,
  getClientStats,
  listClients,
  listMediaForClient,
  softDeleteClient,
  updateClient,
} from '../../services/clientService.js';

// /admin/clients — admin CRUD for tenant-scoped client records.
//
// Auth: requireRole.admin (chained loadCurrentUser + admin-only guard).
//   request.currentUser is non-null and tenantId is non-null after the guard.
//
// Validation: Zod parsing of body / query / params at the route layer. On
// validation failure, returns 400 with { error, message, issues }.
//
// Tenant scoping: every query passes request.currentUser.tenantId. Cross-
// tenant access is impossible by construction — clients in another tenant
// return 404, not 403, to avoid leaking existence.
//
// Idempotency-Key support is available via middleware/idempotency.ts (added
// in E3-S4a) but isn't wired into these endpoints yet. Wrap the POST/PATCH
// handlers in withIdempotency() in a follow-up PR.
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

// Service layer throws this when tagIds reference unknown rows. Surfaced
// as 400 with field-style error so the UI can render it on the tag picker.
function isInvalidTagIdsError(err: unknown): err is Error & { code: string } {
  return (
    err instanceof Error &&
    (err as Error & { code?: string }).code === 'INVALID_TAG_IDS'
  );
}

export default async function clientsRoutes(app: FastifyInstance): Promise<void> {
  // POST /admin/clients — create
  app.post('/clients', { preHandler: requireRole.admin }, async (request, reply) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const parsed = CreateClientBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody(parsed.error));
    }

    try {
      const result = await createClient(app.prisma, {
        tenantId,
        actorUserId: user.id,
        body: parsed.data,
      });
      return reply.code(201).send(result);
    } catch (err) {
      if (isInvalidTagIdsError(err)) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Validation failed.',
          issues: [{ path: 'tagIds', message: err.message }],
        });
      }
      throw err;
    }
  });

  // GET /admin/clients — list with optional filters + pagination
  app.get('/clients', { preHandler: requireRole.admin }, async (request, reply) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const parsed = ListClientsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody(parsed.error));
    }

    const result = await listClients(app.prisma, {
      tenantId,
      query: parsed.data,
    });
    return reply.send(result);
  });

  // GET /admin/clients/:id — one
  app.get('/clients/:id', { preHandler: requireRole.admin }, async (request, reply) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const params = ClientIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(zodErrorBody(params.error));
    }

    const client = await getClientById(app.prisma, {
      tenantId,
      id: params.data.id,
    });
    if (!client) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Client not found.',
      });
    }
    return reply.send({ client });
  });

  // PATCH /admin/clients/:id — partial update
  app.patch('/clients/:id', { preHandler: requireRole.admin }, async (request, reply) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const params = ClientIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(zodErrorBody(params.error));
    }
    const body = UpdateClientBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(zodErrorBody(body.error));
    }

    try {
      const result = await updateClient(app.prisma, {
        tenantId,
        actorUserId: user.id,
        id: params.data.id,
        body: body.data,
      });
      if (!result) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Client not found.',
        });
      }
      return reply.send(result);
    } catch (err) {
      if (isInvalidTagIdsError(err)) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Validation failed.',
          issues: [{ path: 'tagIds', message: err.message }],
        });
      }
      throw err;
    }
  });

  // DELETE /admin/clients/:id — soft delete
  app.delete('/clients/:id', { preHandler: requireRole.admin }, async (request, reply) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const params = ClientIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(zodErrorBody(params.error));
    }

    const { deleted } = await softDeleteClient(app.prisma, {
      tenantId,
      actorUserId: user.id,
      id: params.data.id,
    });
    if (!deleted) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Client not found.',
      });
    }
    return reply.code(204).send();
  });

  // GET /admin/clients/:id/stats — aggregated metrics for the client
  // profile header card (E3-S7). Visits + notes + files counts +
  // last-visit details + memberSince. Single round-trip — saves the
  // page from running 5+ separate queries.
  app.get(
    '/clients/:id/stats',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClientIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const stats = await getClientStats(app.prisma, {
        tenantId,
        clientId: params.data.id,
      });
      if (!stats) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Client not found.',
        });
      }
      return reply.send(stats);
    },
  );

  // GET /admin/clients/:id/media — all media linked to this client,
  // grouped by category (E3-S7). UNIONs clientOwnerId direct +
  // appointmentOwnerId on any of this client's appointments. Mirrors
  // the AppointmentMediaResponse shape from E3-S6 so the frontend can
  // reuse the grid renderer.
  app.get(
    '/clients/:id/media',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClientIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const result = await listMediaForClient(app.prisma, {
        tenantId,
        clientId: params.data.id,
      });
      if (!result) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Client not found.',
        });
      }
      return reply.send(result);
    },
  );
}
