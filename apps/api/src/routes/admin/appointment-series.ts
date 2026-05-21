import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { withIdempotency } from '../../middleware/idempotency.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  CancelSeriesBodySchema,
  CreateSeriesBodySchema,
  ListSeriesQuerySchema,
  SeriesIdParamsSchema,
} from '../../schemas/appointmentSeries.js';
import { InvalidAppointmentReferenceError } from '../../services/appointmentService.js';
import {
  SeriesNotFoundError,
  cancelAppointmentSeries,
  createAppointmentSeries,
  getAppointmentSeriesById,
  listAppointmentSeries,
} from '../../services/appointmentSeriesService.js';

// /admin/appointment-series — recurring appointment series CRUD (PR S2).
//
// Auth: all four handlers require admin (super_admin or admin). Reads stay
// admin-only at MVP — open up to staff in a follow-up if the calendar
// needs read-only series context for non-privileged users.
//
// Idempotency: POST uses withIdempotency('admin.appointment_series.create').
//
// Error mapping:
//   - Zod validation                         → 400 with issues
//   - InvalidAppointmentReferenceError       → 400 with field-style issue
//   - ok:false + conflicts.length > 0        → 409 with conflicts
//   - ok:false + conflicts.length == 0       → 422 (no occurrences generated)
//   - SeriesNotFoundError                    → 404

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

export default async function appointmentSeriesRoutes(
  app: FastifyInstance,
): Promise<void> {
  // POST /admin/appointment-series — create a series + its occurrences.
  app.post(
    '/appointment-series',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = CreateSeriesBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      return withIdempotency(
        request,
        reply,
        {
          prisma: app.prisma,
          tenantId,
          scope: 'admin.appointment_series.create',
        },
        async () => {
          try {
            const result = await createAppointmentSeries(app.prisma, {
              tenantId,
              actorUserId: user.id,
              body: parsed.data,
            });

            if (result.ok) {
              return {
                status: 201,
                body: {
                  series: result.series,
                  occurrences: result.occurrences,
                  truncated: result.truncated,
                },
              };
            }

            if (result.conflicts.length === 0) {
              return {
                status: 422,
                body: {
                  error: 'Unprocessable Entity',
                  message:
                    'Series produced zero occurrences. Check anchorDate, endsOn, and cadence.',
                },
              };
            }

            return {
              status: 409,
              body: {
                error: 'Conflict',
                message:
                  'One or more occurrences conflict with existing appointments or blocked time.',
                conflicts: result.conflicts.map((c) => ({
                  scheduledStartAt: c.scheduledStartAt.toISOString(),
                  scheduledEndAt: c.scheduledEndAt.toISOString(),
                  reason: c.reason,
                  conflictingId: c.conflictingId,
                })),
              },
            };
          } catch (err) {
            if (err instanceof InvalidAppointmentReferenceError) {
              return {
                status: 400,
                body: {
                  error: 'Bad Request',
                  message: 'Validation failed.',
                  issues: [{ path: err.field, message: err.message }],
                },
              };
            }
            throw err;
          }
        },
      );
    },
  );

  // GET /admin/appointment-series — list
  app.get(
    '/appointment-series',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListSeriesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const result = await listAppointmentSeries(app.prisma, {
        tenantId,
        query: parsed.data,
      });
      return reply.send(result);
    },
  );

  // GET /admin/appointment-series/:id — detail + occurrences
  app.get(
    '/appointment-series/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = SeriesIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const result = await getAppointmentSeriesById(app.prisma, {
        tenantId,
        id: params.data.id,
      });
      if (!result) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Series not found.',
        });
      }
      return reply.send(result);
    },
  );

  // DELETE /admin/appointment-series/:id — cancel the series + future occurrences.
  app.delete(
    '/appointment-series/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = SeriesIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      // Body is optional; treat missing/empty as no reason.
      const rawBody = request.body ?? {};
      const body = CancelSeriesBodySchema.safeParse(rawBody);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await cancelAppointmentSeries(app.prisma, {
          tenantId,
          actorUserId: user.id,
          id: params.data.id,
          reason: body.data.reason,
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof SeriesNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Series not found.',
          });
        }
        throw err;
      }
    },
  );
}
