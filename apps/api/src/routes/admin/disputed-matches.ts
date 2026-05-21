import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  ListDisputedMatchesQuerySchema,
  ResolveDisputedMatchBodySchema,
  ResolveDisputedMatchParamsSchema,
} from '../../schemas/clientMatch.js';
import {
  ClientMatchDisputeError,
  listDisputedMatches,
  resolveDisputedMatch,
} from '../../services/clientMatchDisputeService.js';

// /admin/disputed-matches — staff queue for client-recognition disputes
// and ambiguous matches. Backs the staff UI built in PR 3.
//
// Auth: requireRole.admin (super_admin or admin). Staff/manager do not
// see this queue at MVP — the spec calls it out as an admin-resolution
// step, and we don't want self-service staff resolving disputes that
// involve their own appointments.
//
// Tenant scoping: every query passes request.currentUser.tenantId.
//
// Pagination: cursor-based on the appointment id. ordered by createdAt
// DESC, id DESC at the service layer.

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

function disputeErrorStatus(code: ClientMatchDisputeError['code']): number {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'ALREADY_DISPUTED':
      return 409;
    case 'WINDOW_EXPIRED':
      return 410;
    case 'EMAIL_MISMATCH':
      return 400;
    case 'INVALID_TARGET_CLIENT':
      return 400;
    case 'NOT_DISPUTED_OR_AMBIGUOUS':
      return 409;
  }
}

export default async function disputedMatchesRoutes(
  app: FastifyInstance,
): Promise<void> {
  // GET /admin/disputed-matches — list disputed + ambiguous appointments.
  app.get(
    '/disputed-matches',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListDisputedMatchesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const result = await listDisputedMatches(app.prisma, {
        tenantId,
        query: parsed.data,
      });
      return reply.send({
        rows: result.rows.map((r) => ({
          appointmentId: r.appointmentId,
          scheduledStartAt: r.scheduledStartAt.toISOString(),
          scheduledEndAt: r.scheduledEndAt.toISOString(),
          state: r.state,
          matchStrength: r.matchStrength,
          clientMatchDisputed: r.clientMatchDisputed,
          client: r.client,
          staffReviewedAt: r.staffReviewedAt
            ? r.staffReviewedAt.toISOString()
            : null,
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor: result.nextCursor,
      });
    },
  );

  // POST /admin/disputed-matches/:appointmentId/resolve — dismiss or
  // reassign. No idempotency-key plumbing on this admin mutation; the
  // staff UI is single-actor per appointment.
  app.post(
    '/disputed-matches/:appointmentId/resolve',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ResolveDisputedMatchParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = ResolveDisputedMatchBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await resolveDisputedMatch(app.prisma, {
          tenantId,
          actorUserId: user.id,
          appointmentId: params.data.appointmentId,
          body: body.data,
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof ClientMatchDisputeError) {
          const status = disputeErrorStatus(err.code);
          return reply.code(status).send({
            error:
              status === 404
                ? 'Not Found'
                : status === 409
                  ? 'Conflict'
                  : 'Bad Request',
            message: err.message,
            ...(err.field ? { issues: [{ path: err.field, message: err.message }] } : {}),
          });
        }
        throw err;
      }
    },
  );
}
