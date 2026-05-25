import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  LocationIdParamsSchema,
  UpsertLocationGeofenceBodySchema,
} from '../../schemas/locationGeofence.js';
import {
  LocationGeofenceNotFoundError,
  LocationNotFoundError,
  deleteLocationGeofence,
  getLocationGeofence,
  upsertLocationGeofence,
} from '../../services/locationGeofenceService.js';

// /admin/locations/:locationId/geofence — admin CRUD for per-location
// geofences (PR 6 of the Geofence Auto Check-in epic). One geofence per
// location; PUT is upsert (idempotent), DELETE removes the row entirely.
//
// Auth gating:
//   GET    requireRole.staff   — anyone in tenant can view current config
//   PUT    requireRole.admin   — writes are admin-only
//   DELETE requireRole.admin
//
// Typed service errors → HTTP responses:
//   LocationNotFoundError         → 404 { code: 'LOCATION_NOT_FOUND' }
//   LocationGeofenceNotFoundError → 404 { code: 'LOCATION_GEOFENCE_NOT_FOUND' }
//   Zod validation                → 400 VALIDATION_ERROR with issues
//
// GET returns `{ geofence: null }` when no geofence exists (NOT 404) —
// friendlier than 404 for the editor UI which decides "create or update?"
// based on the response.
//
// No idempotency-key header here: admin-only writes aren't subject to the
// public-API idempotency rule. Double-click on save = second upsert to
// the same values = no-op.

function zodErrorBody(err: ZodError) {
  return {
    error: 'Bad Request',
    code: 'VALIDATION_ERROR' as const,
    message: 'Validation failed.',
    issues: err.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  };
}

export default async function locationGeofenceRoutes(
  app: FastifyInstance,
): Promise<void> {
  // GET /admin/locations/:locationId/geofence
  app.get(
    '/locations/:locationId/geofence',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = LocationIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      try {
        const result = await getLocationGeofence(app.prisma, {
          tenantId,
          locationId: params.data.locationId,
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof LocationNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            code: err.code,
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  // PUT /admin/locations/:locationId/geofence — upsert
  app.put(
    '/locations/:locationId/geofence',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = LocationIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = UpsertLocationGeofenceBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await upsertLocationGeofence(app.prisma, {
          tenantId,
          actorUserId: user.id,
          locationId: params.data.locationId,
          body: body.data,
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof LocationNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            code: err.code,
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  // DELETE /admin/locations/:locationId/geofence
  app.delete(
    '/locations/:locationId/geofence',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = LocationIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      try {
        await deleteLocationGeofence(app.prisma, {
          tenantId,
          actorUserId: user.id,
          locationId: params.data.locationId,
        });
        return reply.code(204).send();
      } catch (err) {
        if (err instanceof LocationNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            code: err.code,
            message: err.message,
          });
        }
        if (err instanceof LocationGeofenceNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            code: err.code,
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
