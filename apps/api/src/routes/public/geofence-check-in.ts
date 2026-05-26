import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { withIdempotency } from '../../middleware/idempotency.js';
import { requireMagicLinkAuth } from '../../middleware/requireMagicLinkAuth.js';
import {
  GeofenceCheckInBodySchema,
  GeofenceCheckInParamsSchema,
} from '../../schemas/geofenceCheckIn.js';
import {
  GeofenceValidationError,
  getEligibleBookingsForClient,
  submitGeofenceCheckIn,
} from '../../services/geofenceCheckInService.js';

// Public geofence check-in routes — PR 8b of the Geofence Auto Check-in
// epic. Two surfaces:
//
//   GET  /public/me/upcoming-geofence-eligible
//        Lists confirmed bookings starting in the next 30 minutes on
//        geofence-enabled locations. Drives the PWA's "do I poll?" check.
//
//   POST /public/class-bookings/:bookingId/geofence-check-in
//        The GPS submission endpoint. Idempotency-Key required per
//        CLAUDE.md hard rule #8 — same key returns the cached response.
//        Domain-level idempotency layered above: re-submission against an
//        already-checked-in booking returns 200 with alreadyCheckedIn=true.
//
// Auth: magic-link bearer token (purpose='geofence_check_in'). The token
// is minted by createBookingOrWaitlist when a booking is created via the
// public /book flow and returned in that response (PR 8b). Admin-side
// bookings don't get tokens — staff check those clients in manually.
//
// Tenant scoping: derived from request.magicLinkAuth.token.tenantId.
// NEVER read tenantId from URL/body/header — the token IS the credential.

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

export default async function publicGeofenceCheckInRoutes(
  app: FastifyInstance,
): Promise<void> {
  // GET /public/me/upcoming-geofence-eligible
  //
  // The token's `client` is eagerly loaded by verifyToken. If the scoped
  // client row was soft-deleted between mint and use, `client` is null —
  // treat as 403 since the token's identity is gone.
  app.get(
    '/public/me/upcoming-geofence-eligible',
    { preHandler: requireMagicLinkAuth('geofence_check_in') },
    async (request, reply) => {
      const auth = request.magicLinkAuth!;
      if (!auth.client) {
        return reply.code(403).send({
          error: 'Forbidden',
          code: 'CLIENT_NOT_FOUND',
          message: 'Client scope on this token is no longer available.',
        });
      }

      const result = await getEligibleBookingsForClient(app.prisma, {
        tenantId: auth.token.tenantId,
        clientId: auth.client.id,
      });

      // Serialize Dates to ISO strings at the wire boundary so the PWA
      // doesn't have to handle two shapes.
      return reply.send({
        eligible: result.eligible.map((e) => ({
          bookingId: e.bookingId,
          classInstanceId: e.classInstanceId,
          className: e.className,
          scheduledStartAt: e.scheduledStartAt.toISOString(),
          scheduledEndAt: e.scheduledEndAt.toISOString(),
          locationId: e.locationId,
          locationName: e.locationName,
          geofence: e.geofence,
        })),
      });
    },
  );

  // POST /public/class-bookings/:bookingId/geofence-check-in
  app.post(
    '/public/class-bookings/:bookingId/geofence-check-in',
    { preHandler: requireMagicLinkAuth('geofence_check_in') },
    async (request, reply) => {
      const auth = request.magicLinkAuth!;
      if (!auth.client) {
        return reply.code(403).send({
          error: 'Forbidden',
          code: 'CLIENT_NOT_FOUND',
          message: 'Client scope on this token is no longer available.',
        });
      }

      const params = GeofenceCheckInParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = GeofenceCheckInBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      const tenantId = auth.token.tenantId;
      const clientId = auth.client.id;
      const tokenClassBookingId = auth.token.classBookingId;
      const userAgentHeader = request.headers['user-agent'];
      const userAgent =
        typeof userAgentHeader === 'string' ? userAgentHeader : null;
      const ipAddress = request.ip ?? null;

      return withIdempotency(
        request,
        reply,
        {
          prisma: app.prisma,
          tenantId,
          scope: 'public_geofence_check_in.submit',
        },
        async () => {
          try {
            const result = await submitGeofenceCheckIn(app.prisma, {
              tenantId,
              clientId,
              bookingId: params.data.bookingId,
              tokenClassBookingId,
              lat: body.data.lat,
              lng: body.data.lng,
              accuracyMeters: body.data.accuracyMeters,
              userAgent,
              ipAddress,
            });

            if (result.kind === 'already_checked_in') {
              return {
                status: 200,
                body: {
                  booking: {
                    id: result.booking.id,
                    state: result.booking.state,
                    checkedInAt:
                      result.booking.checkedInAt?.toISOString() ?? null,
                  },
                  alreadyCheckedIn: true,
                },
              };
            }

            return {
              status: 200,
              body: {
                booking: {
                  id: result.booking.id,
                  state: result.booking.state,
                  checkedInAt: result.booking.checkedInAt.toISOString(),
                },
                alreadyCheckedIn: false,
              },
            };
          } catch (err) {
            if (err instanceof GeofenceValidationError) {
              return {
                status: err.status,
                body: {
                  error: err.status === 403 ? 'Forbidden' : 'Unprocessable Entity',
                  code: err.code,
                  message: err.message,
                  ...(err.bookingState !== undefined
                    ? { bookingState: err.bookingState }
                    : {}),
                  ...(err.distanceMeters !== undefined
                    ? { distanceMeters: err.distanceMeters }
                    : {}),
                },
              };
            }
            throw err;
          }
        },
      );
    },
  );
}
