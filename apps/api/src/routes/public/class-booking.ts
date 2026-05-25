import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { withIdempotency } from '../../middleware/idempotency.js';
import {
  PublicClassCatalogQuerySchema,
  PublicClassInstancesQuerySchema,
  PublicCreateClassBookingBodySchema,
} from '../../schemas/publicClassBooking.js';
import {
  ClassFullError,
  ClassInstanceNotBookableError,
  ClassInstanceNotFoundError,
  ClientNotFoundError,
  DuplicateBookingError,
  WaitlistFullError,
} from '../../services/classBookingService.js';
import {
  BannedClientError,
  createPublicClassBooking,
  listPublicClassCatalog,
  listPublicClassInstances,
} from '../../services/publicClassBookingService.js';
import { resolvePublicBookingTenant } from '../../services/publicBookingService.js';

// Public /book?type=classes routes. Phase 3b of the Classes epic. Mirrors
// apps/api/src/routes/public/booking.ts (services-side public flow):
//
//   GET  /public/booking/class-catalog       — class templates + categories
//   GET  /public/booking/class-instances     — upcoming bookable instances
//   POST /public/booking/class-bookings      — guest → client → book/waitlist
//
// Tenant resolution: query `tenantSlug` (preferred) → header
// `X-Wellos-Tenant-Slug` → dev-only `X-Tenant-Id` (gated by
// ALLOW_PUBLIC_BOOKING_DEV_TENANT_HEADER=true).
//
// Auth: none — public guest flow. Idempotency-Key is required on POST per
// hard rule #8; the middleware persists (tenant_id, key, scope) for replay.

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

function tenantResolutionFromRequest(
  request: FastifyRequest,
  querySlug?: string,
): { tenantSlug?: string; devTenantIdHeader?: string } {
  const hSlug = request.headers['x-wellos-tenant-slug'];
  const headerSlug = typeof hSlug === 'string' ? hSlug.trim() : '';
  const dev = request.headers['x-tenant-id'];
  return {
    tenantSlug: querySlug || headerSlug || undefined,
    devTenantIdHeader:
      typeof dev === 'string' && dev.trim() ? dev.trim() : undefined,
  };
}

export default async function publicClassBookingRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get('/public/booking/class-catalog', async (request, reply) => {
    const parsed = PublicClassCatalogQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody(parsed.error));
    }

    const tenant = await resolvePublicBookingTenant(app.prisma, {
      ...tenantResolutionFromRequest(request, parsed.data.tenantSlug),
    });
    if (!tenant) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'This booking link is invalid or no longer available.',
      });
    }

    const catalog = await listPublicClassCatalog(app.prisma, {
      tenantId: tenant.tenantId,
    });
    return reply.send({ tenantSlug: tenant.slug, ...catalog });
  });

  app.get('/public/booking/class-instances', async (request, reply) => {
    const parsed = PublicClassInstancesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody(parsed.error));
    }

    const tenant = await resolvePublicBookingTenant(app.prisma, {
      ...tenantResolutionFromRequest(request, parsed.data.tenantSlug),
    });
    if (!tenant) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'This booking link is invalid or no longer available.',
      });
    }

    const result = await listPublicClassInstances(app.prisma, {
      tenantId: tenant.tenantId,
      fromDate: parsed.data.fromDate,
      toDate: parsed.data.toDate,
      classId: parsed.data.classId,
      categoryId: parsed.data.categoryId,
      staffId: parsed.data.staffId,
      locationId: parsed.data.locationId,
    });
    return reply.send(result);
  });

  app.post('/public/booking/class-bookings', async (request, reply) => {
    const parsed = PublicCreateClassBookingBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody(parsed.error));
    }

    const tenant = await resolvePublicBookingTenant(app.prisma, {
      tenantSlug: parsed.data.tenantSlug,
      devTenantIdHeader: tenantResolutionFromRequest(request).devTenantIdHeader,
    });
    if (!tenant) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'This booking link is invalid or no longer available.',
      });
    }

    return withIdempotency(
      request,
      reply,
      {
        prisma: app.prisma,
        tenantId: tenant.tenantId,
        scope: 'public_booking.class_create',
      },
      async () => {
        try {
          const result = await createPublicClassBooking(app.prisma, {
            tenantId: tenant.tenantId,
            classInstanceId: parsed.data.classInstanceId,
            idempotencyKey: parsed.data.idempotencyKey,
            guest: parsed.data.guest,
          });
          return { status: 201, body: result };
        } catch (err) {
          if (err instanceof BannedClientError) {
            return {
              status: 403,
              body: {
                error: 'Forbidden',
                code: err.code,
                message: err.message,
              },
            };
          }
          if (err instanceof ClassInstanceNotFoundError) {
            return {
              status: 404,
              body: { error: 'Not Found', message: err.message },
            };
          }
          if (err instanceof ClientNotFoundError) {
            return {
              status: 404,
              body: { error: 'Not Found', message: err.message },
            };
          }
          if (err instanceof ClassFullError) {
            return {
              status: 409,
              body: {
                error: 'Conflict',
                code: err.code,
                message: err.message,
              },
            };
          }
          if (err instanceof WaitlistFullError) {
            return {
              status: 409,
              body: {
                error: 'Conflict',
                code: err.code,
                message: err.message,
              },
            };
          }
          if (err instanceof ClassInstanceNotBookableError) {
            return {
              status: 409,
              body: {
                error: 'Conflict',
                code: err.code,
                message: err.message,
                state: err.state,
              },
            };
          }
          if (err instanceof DuplicateBookingError) {
            return {
              status: 409,
              body: {
                error: 'Conflict',
                code: err.code,
                message: err.message,
              },
            };
          }
          throw err;
        }
      },
    );
  });
}
