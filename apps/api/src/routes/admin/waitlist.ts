import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  ListWaitlistQuerySchema,
  OfferWaitlistBodySchema,
  WaitlistIdParamsSchema,
} from '../../schemas/waitlist.js';
import {
  cancelWaitlistEntry,
  getWaitlistEntry,
  listWaitlistEntries,
  markEntryOffered,
} from '../../services/waitlistService.js';

// /admin/waitlist — staff-level read + cancel + manual offer. The matching
// engine itself lives in services/waitlistService.ts. The notification
// dispatch on `offer` lands with Epic 8; today this route only flips the
// status flag.

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

export default async function adminWaitlistRoutes(
  app: FastifyInstance,
): Promise<void> {
  // GET /admin/waitlist — list (status, service, staff, q, page, limit)
  app.get(
    '/waitlist',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListWaitlistQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const result = await listWaitlistEntries(app.prisma, {
        tenantId,
        status: parsed.data.status,
        serviceId: parsed.data.serviceId,
        staffId: parsed.data.staffId,
        q: parsed.data.q,
        page: parsed.data.page,
        limit: parsed.data.limit,
        includeExpired: parsed.data.includeExpired,
      });
      return reply.send(result);
    },
  );

  // GET /admin/waitlist/:id — single entry
  app.get(
    '/waitlist/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = WaitlistIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const entry = await getWaitlistEntry(app.prisma, {
        tenantId,
        id: params.data.id,
      });
      if (!entry) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Waitlist entry not found.',
        });
      }
      return reply.send({ entry });
    },
  );

  // POST /admin/waitlist/:id/cancel — flip status to cancelled
  app.post(
    '/waitlist/:id/cancel',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = WaitlistIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const entry = await cancelWaitlistEntry(app.prisma, {
        tenantId,
        id: params.data.id,
      });
      if (!entry) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Waitlist entry not found.',
        });
      }
      return reply.send({ entry });
    },
  );

  // POST /admin/waitlist/:id/offer — admin manual offer trigger. Epic 8
  // wires the actual SMS/email; this route just records the state change so
  // the cancellation-trigger smoke test has a real handle.
  app.post(
    '/waitlist/:id/offer',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = WaitlistIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = OfferWaitlistBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      const entry = await markEntryOffered(app.prisma, {
        tenantId,
        id: params.data.id,
        appointmentId: body.data?.appointmentId ?? null,
      });
      if (!entry) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Waitlist entry not found.',
        });
      }
      return reply.send({ entry });
    },
  );
}
