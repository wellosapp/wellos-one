import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  CancelClassBookingBodySchema,
  CreateClassBookingBodySchema,
  InstanceBookingIdParamsSchema,
  InstanceIdParamsSchema,
  InstanceWaitlistIdParamsSchema,
  JoinWaitlistBodySchema,
  ListRosterQuerySchema,
} from '../../schemas/classBooking.js';
import {
  BookingAlreadyCancelledError,
  BookingNotFoundError,
  ClassFullError,
  ClassInstanceNotBookableError,
  ClassInstanceNotFoundError,
  ClientNotFoundError,
  DuplicateBookingError,
  WaitlistEntryNotFoundError,
  WaitlistEntryNotPromotableError,
  WaitlistFullError,
  cancelBooking,
  createBookingOrWaitlist,
  joinWaitlistManually,
  listRoster,
  promoteWaitlistEntryManually,
} from '../../services/classBookingService.js';

// /admin/class-instances/:instanceId/* — admin-side roster + booking +
// waitlist endpoints for the Classes epic. Phase 3a. Public /book Classes
// tab is Phase 3b; auto-promote-on-cancel + late-cancel detection landed in
// Phase 3c (cancel response now carries promotedBooking / promotedFromEntry /
// promotedClient / lateCancel). Payments deferred to Epic 6.
//
// Auth gating:
//   GET    /roster                          requireRole.staff   (anyone in tenant)
//   POST   /bookings                        requireRole.manager (admin+manager can book)
//   POST   /bookings/:bookingId/cancel      requireRole.admin
//   POST   /waitlist                        requireRole.admin
//   POST   /waitlist/:entryId/promote       requireRole.admin
//
// Typed service errors → HTTP responses:
//   ClassFullError                  → 409 { code: 'CLASS_FULL' }
//   WaitlistFullError               → 409 { code: 'WAITLIST_FULL' }
//   ClassInstanceNotBookableError   → 409 { code: 'INSTANCE_NOT_BOOKABLE', state }
//   DuplicateBookingError           → 409 { code: 'DUPLICATE_BOOKING' }
//   BookingAlreadyCancelledError    → 409 { code: 'BOOKING_ALREADY_CANCELLED' }
//   WaitlistEntryNotPromotableError → 409 { code: 'WAITLIST_ENTRY_NOT_PROMOTABLE' }
//   ClassInstanceNotFoundError      → 404
//   ClientNotFoundError             → 404
//   BookingNotFoundError            → 404
//   WaitlistEntryNotFoundError      → 404

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

export default async function classBookingsRoutes(
  app: FastifyInstance,
): Promise<void> {
  // GET /admin/class-instances/:instanceId/roster
  app.get(
    '/class-instances/:instanceId/roster',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = InstanceIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const query = ListRosterQuerySchema.safeParse(request.query ?? {});
      if (!query.success) {
        return reply.code(400).send(zodErrorBody(query.error));
      }

      try {
        const result = await listRoster(app.prisma, {
          tenantId,
          instanceId: params.data.instanceId,
          includeCancelled: query.data.includeCancelled,
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof ClassInstanceNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  // POST /admin/class-instances/:instanceId/bookings
  // Admin/manager-only: surfaces booking-or-waitlist from a single client pick.
  app.post(
    '/class-instances/:instanceId/bookings',
    { preHandler: requireRole.manager },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = InstanceIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = CreateClassBookingBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await createBookingOrWaitlist(app.prisma, {
          tenantId,
          actorUserId: user.id,
          instanceId: params.data.instanceId,
          clientId: body.data.clientId,
          idempotencyKey: body.data.idempotencyKey,
        });
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof ClassInstanceNotFoundError) {
          return reply.code(404).send({ error: 'Not Found', message: err.message });
        }
        if (err instanceof ClientNotFoundError) {
          return reply.code(404).send({ error: 'Not Found', message: err.message });
        }
        if (err instanceof ClassFullError) {
          return reply.code(409).send({
            error: 'Conflict',
            code: err.code,
            message: err.message,
          });
        }
        if (err instanceof WaitlistFullError) {
          return reply.code(409).send({
            error: 'Conflict',
            code: err.code,
            message: err.message,
          });
        }
        if (err instanceof ClassInstanceNotBookableError) {
          return reply.code(409).send({
            error: 'Conflict',
            code: err.code,
            message: err.message,
            state: err.state,
          });
        }
        if (err instanceof DuplicateBookingError) {
          return reply.code(409).send({
            error: 'Conflict',
            code: err.code,
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  // POST /admin/class-instances/:instanceId/bookings/:bookingId/cancel
  app.post(
    '/class-instances/:instanceId/bookings/:bookingId/cancel',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = InstanceBookingIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = CancelClassBookingBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await cancelBooking(app.prisma, {
          tenantId,
          actorUserId: user.id,
          instanceId: params.data.instanceId,
          bookingId: params.data.bookingId,
          reason: body.data.reason,
          initiatedBy: body.data.initiatedBy,
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof BookingNotFoundError) {
          return reply.code(404).send({ error: 'Not Found', message: err.message });
        }
        if (err instanceof BookingAlreadyCancelledError) {
          return reply.code(409).send({
            error: 'Conflict',
            code: err.code,
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  // POST /admin/class-instances/:instanceId/waitlist
  // Admin manually adds a client to the waitlist (skips the book-first path).
  app.post(
    '/class-instances/:instanceId/waitlist',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = InstanceIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = JoinWaitlistBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await joinWaitlistManually(app.prisma, {
          tenantId,
          actorUserId: user.id,
          instanceId: params.data.instanceId,
          clientId: body.data.clientId,
        });
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof ClassInstanceNotFoundError) {
          return reply.code(404).send({ error: 'Not Found', message: err.message });
        }
        if (err instanceof ClientNotFoundError) {
          return reply.code(404).send({ error: 'Not Found', message: err.message });
        }
        if (err instanceof ClassFullError) {
          return reply.code(409).send({
            error: 'Conflict',
            code: err.code,
            message: err.message,
          });
        }
        if (err instanceof WaitlistFullError) {
          return reply.code(409).send({
            error: 'Conflict',
            code: err.code,
            message: err.message,
          });
        }
        if (err instanceof ClassInstanceNotBookableError) {
          return reply.code(409).send({
            error: 'Conflict',
            code: err.code,
            message: err.message,
            state: err.state,
          });
        }
        if (err instanceof DuplicateBookingError) {
          return reply.code(409).send({
            error: 'Conflict',
            code: err.code,
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  // POST /admin/class-instances/:instanceId/waitlist/:entryId/promote
  app.post(
    '/class-instances/:instanceId/waitlist/:entryId/promote',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = InstanceWaitlistIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      try {
        const result = await promoteWaitlistEntryManually(app.prisma, {
          tenantId,
          actorUserId: user.id,
          instanceId: params.data.instanceId,
          entryId: params.data.entryId,
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof ClassInstanceNotFoundError) {
          return reply.code(404).send({ error: 'Not Found', message: err.message });
        }
        if (err instanceof WaitlistEntryNotFoundError) {
          return reply.code(404).send({ error: 'Not Found', message: err.message });
        }
        if (err instanceof ClassInstanceNotBookableError) {
          return reply.code(409).send({
            error: 'Conflict',
            code: err.code,
            message: err.message,
            state: err.state,
          });
        }
        if (err instanceof ClassFullError) {
          return reply.code(409).send({
            error: 'Conflict',
            code: err.code,
            message: err.message,
          });
        }
        if (err instanceof DuplicateBookingError) {
          return reply.code(409).send({
            error: 'Conflict',
            code: err.code,
            message: err.message,
          });
        }
        if (err instanceof WaitlistEntryNotPromotableError) {
          return reply.code(409).send({
            error: 'Conflict',
            code: err.code,
            message: err.message,
            state: err.state,
          });
        }
        throw err;
      }
    },
  );
}
