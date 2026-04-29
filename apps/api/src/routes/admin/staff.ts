import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  CreateStaffBodySchema,
  ListStaffQuerySchema,
  StaffIdParamsSchema,
  UpdateStaffBodySchema,
} from '../../schemas/staff.js';
import {
  createStaff,
  getStaffById,
  listStaff,
  softDeleteStaff,
  updateStaff,
} from '../../services/staffService.js';

// /admin/staff — admin CRUD for tenant-scoped staff records, including
// inline StaffService M2M assignment via the serviceIds field.
// Mirrors /admin/clients and /admin/services. See clients.ts for rationale.
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

// The service layer throws this when serviceIds reference unknown rows.
// Surfaced as 400 with field-style error so the UI can render it on the
// services control.
function isInvalidServiceIdsError(err: unknown): err is Error & { code: string } {
  return (
    err instanceof Error &&
    (err as Error & { code?: string }).code === 'INVALID_SERVICE_IDS'
  );
}

export default async function staffRoutes(app: FastifyInstance): Promise<void> {
  // POST /admin/staff — create
  app.post('/staff', { preHandler: requireRole.admin }, async (request, reply) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const parsed = CreateStaffBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody(parsed.error));
    }

    try {
      const result = await createStaff(app.prisma, {
        tenantId,
        actorUserId: user.id,
        body: parsed.data,
      });
      return reply.code(201).send(result);
    } catch (err) {
      if (isInvalidServiceIdsError(err)) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Validation failed.',
          issues: [{ path: 'serviceIds', message: err.message }],
        });
      }
      throw err;
    }
  });

  // GET /admin/staff — list with optional filters + pagination
  app.get('/staff', { preHandler: requireRole.admin }, async (request, reply) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const parsed = ListStaffQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody(parsed.error));
    }

    const result = await listStaff(app.prisma, {
      tenantId,
      query: parsed.data,
    });
    return reply.send(result);
  });

  // GET /admin/staff/:id — one (with serviceIds)
  app.get('/staff/:id', { preHandler: requireRole.admin }, async (request, reply) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const params = StaffIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(zodErrorBody(params.error));
    }

    const staff = await getStaffById(app.prisma, {
      tenantId,
      id: params.data.id,
    });
    if (!staff) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Staff not found.',
      });
    }
    return reply.send({ staff });
  });

  // PATCH /admin/staff/:id — partial update; serviceIds replaces the
  // assignment set when present, omitted means leave assignments alone
  app.patch('/staff/:id', { preHandler: requireRole.admin }, async (request, reply) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const params = StaffIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(zodErrorBody(params.error));
    }
    const body = UpdateStaffBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(zodErrorBody(body.error));
    }

    try {
      const result = await updateStaff(app.prisma, {
        tenantId,
        actorUserId: user.id,
        id: params.data.id,
        body: body.data,
      });
      if (!result) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Staff not found.',
        });
      }
      return reply.send(result);
    } catch (err) {
      if (isInvalidServiceIdsError(err)) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Validation failed.',
          issues: [{ path: 'serviceIds', message: err.message }],
        });
      }
      throw err;
    }
  });

  // DELETE /admin/staff/:id — soft delete (preserves staff_services for
  // audit/reporting; booking engine filters on staff.deletedAt)
  app.delete('/staff/:id', { preHandler: requireRole.admin }, async (request, reply) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const params = StaffIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(zodErrorBody(params.error));
    }

    const { deleted } = await softDeleteStaff(app.prisma, {
      tenantId,
      actorUserId: user.id,
      id: params.data.id,
    });
    if (!deleted) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Staff not found.',
      });
    }
    return reply.code(204).send();
  });
}
