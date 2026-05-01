import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  AppointmentIdParamsSchema,
  ClientIdParamsSchema,
  ClientTimelineQuerySchema,
} from '../../schemas/linkedRecords.js';
import {
  getAppointmentLinkedRecords,
  getClientTimeline,
} from '../../services/linkedRecordsService.js';

// /admin/appointments/:id/linked-records and /admin/clients/:clientId/timeline
// — read-only aggregators that feed the appointment briefing card and the
// client visit timeline UI (E3-S4b).
//
// Both endpoints fan out to ClientNote, AppointmentBookingAnswer, MediaAsset,
// and SoapNote queries. Tables that don't have ingestion paths yet (S4c
// media, S4d triage, S4f SOAP) return empty arrays — the response shape is
// stable so adding rows in those follow-up PRs lights up the UI without
// re-shaping the API.
//
// Auth: requireRole.staff (admin/manager/staff). No write endpoints in this
// module, so no idempotency wrapping.

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

export default async function linkedRecordsRoutes(
  app: FastifyInstance,
): Promise<void> {
  // GET /admin/appointments/:id/linked-records
  app.get(
    '/appointments/:id/linked-records',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = AppointmentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const result = await getAppointmentLinkedRecords(app.prisma, {
        tenantId,
        appointmentId: params.data.id,
      });
      if (!result) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Appointment not found.',
        });
      }
      return reply.send(result);
    },
  );

  // GET /admin/clients/:clientId/timeline
  app.get(
    '/clients/:clientId/timeline',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClientIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const query = ClientTimelineQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send(zodErrorBody(query.error));
      }

      const result = await getClientTimeline(app.prisma, {
        tenantId,
        clientId: params.data.clientId,
        query: query.data,
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
