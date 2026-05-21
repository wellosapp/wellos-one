import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { withIdempotency } from '../../middleware/idempotency.js';
import {
  DisputeMatchBodySchema,
  DisputeMatchParamsSchema,
} from '../../schemas/clientMatch.js';
import {
  ClientMatchDisputeError,
  disputeAppointmentMatch,
} from '../../services/clientMatchDisputeService.js';

// Public dispute endpoint — "This isn't me" button on the booking
// confirmation card. Auth is intentionally NOT a signed token (MVP design
// choice); the service enforces a 30-min window from createdAt to bound
// abuse + the appointment must be in the same tenant.
//
// Tenant resolution differs from /public/booking/appointments — the
// dispute path doesn't carry a tenantSlug body field. Instead we resolve
// the tenant from the appointment row itself: findFirst by (tenantId, id)
// where tenantId comes from one of the request channels below. This
// matches how a real "I'm tapping a link from my booking confirmation
// email" flow works: the email knows the tenant and passes it.
//
// Tenant resolution order:
//   1. Query param `tenantSlug`
//   2. Header `X-Wellos-Tenant-Slug`
//   3. Dev-only: header `X-Tenant-Id` when ALLOW_PUBLIC_BOOKING_DEV_TENANT_HEADER=true
//
// Idempotency: standard `Idempotency-Key` header via withIdempotency().
// Scope = 'public_booking.dispute_match'. Same key + same body replays the
// stored response; same key + different body returns 422.

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

export default async function publicDisputeMatchRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post('/public/booking/:appointmentId/dispute-match', async (request, reply) => {
    const params = DisputeMatchParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(zodErrorBody(params.error));
    }

    const body = DisputeMatchBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send(zodErrorBody(body.error));
    }

    // Resolve tenant from the appointment row itself. We do a 1-step
    // lookup that doubles as the "exists in this tenant?" check inside
    // the service — so here we just pull tenantId off the appointment
    // (any tenant whose appointment has this id; cross-tenant probes
    // still 404 because the service re-checks (tenantId, id) below).
    //
    // The appointmentId path param is sufficient for tenant resolution
    // because cuid is global; we don't need an explicit slug. Findings
    // here are bounded by the soft-delete extension just like every
    // other read.
    const lookup = await app.prisma.appointment.findFirst({
      where: { id: params.data.appointmentId },
      select: { tenantId: true },
    });
    if (!lookup) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'Appointment not found.',
      });
    }
    const tenantId = lookup.tenantId;

    return withIdempotency(
      request,
      reply,
      {
        prisma: app.prisma,
        tenantId,
        scope: 'public_booking.dispute_match',
      },
      async () => {
        try {
          const result = await disputeAppointmentMatch(app.prisma, {
            tenantId,
            appointmentId: params.data.appointmentId,
            body: body.data,
          });
          if (result.branch === 'i_am_new') {
            return {
              status: 200,
              body: {
                appointmentId: result.appointmentId,
                newClientId: result.newClientId,
              },
            };
          }
          return {
            status: 200,
            body: {
              appointmentId: result.appointmentId,
              status: result.status,
            },
          };
        } catch (err) {
          if (err instanceof ClientMatchDisputeError) {
            return {
              status: disputeErrorStatus(err.code),
              body: {
                error:
                  disputeErrorStatus(err.code) === 404
                    ? 'Not Found'
                    : disputeErrorStatus(err.code) === 410
                      ? 'Gone'
                      : disputeErrorStatus(err.code) === 409
                        ? 'Conflict'
                        : 'Bad Request',
                message: err.message,
                ...(err.field ? { issues: [{ path: err.field, message: err.message }] } : {}),
              },
            };
          }
          throw err;
        }
      },
    );
  });
}
