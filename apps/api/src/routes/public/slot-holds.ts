import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import {
  CreateSlotHoldBodySchema,
  SlotHoldIdParamsSchema,
} from '../../schemas/slotHold.js';
import { resolvePublicBookingTenant } from '../../services/publicBookingService.js';
import {
  InvalidSlotHoldReferenceError,
  SlotConflictError,
  SlotHoldNotFoundError,
  acquireSlotHold,
  releaseSlotHold,
} from '../../services/slotHoldService.js';

// Public slot-hold endpoints per R2 §9. No Clerk auth — anonymous bookers.
// Tenant resolution matches the rest of public/booking.ts:
//   1. Body `tenantSlug`
//   2. Header `X-Wellos-Tenant-Slug` (proxies)
//   3. Dev-only header `X-Tenant-Id` when ALLOW_PUBLIC_BOOKING_DEV_TENANT_HEADER=true
//
// Rate limiting / CORS: same caveats as the rest of the public booking
// surface — fix at the platform/CORS layer before broad rollout.

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
  bodySlug?: string,
): { tenantSlug?: string; devTenantIdHeader?: string } {
  const hSlug = request.headers['x-wellos-tenant-slug'];
  const headerSlug = typeof hSlug === 'string' ? hSlug.trim() : '';
  const dev = request.headers['x-tenant-id'];
  return {
    tenantSlug: bodySlug || headerSlug || undefined,
    devTenantIdHeader:
      typeof dev === 'string' && dev.trim() ? dev.trim() : undefined,
  };
}

export default async function publicSlotHoldRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post('/public/booking/slot-holds', async (request, reply) => {
    const parsed = CreateSlotHoldBodySchema.safeParse(request.body);
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

    try {
      const hold = await acquireSlotHold(app.prisma, {
        tenantId: tenant.tenantId,
        locationId: parsed.data.locationId,
        serviceId: parsed.data.serviceId,
        staffId: parsed.data.staffId,
        startsAt: new Date(parsed.data.startsAt),
        idempotencyKey: parsed.data.idempotencyKey,
        fingerprint: parsed.data.fingerprint,
      });
      return reply.code(201).send({
        holdId: hold.id,
        expiresAt: hold.expiresAt.toISOString(),
        startsAt: hold.startsAt.toISOString(),
        endsAt: hold.endsAt.toISOString(),
      });
    } catch (err) {
      if (err instanceof InvalidSlotHoldReferenceError) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: err.message,
          field: err.field,
        });
      }
      if (err instanceof SlotConflictError) {
        return reply.code(409).send({
          error: 'Conflict',
          code: err.code,
          reason: err.reason,
          message: err.message,
        });
      }
      throw err;
    }
  });

  app.delete('/public/booking/slot-holds/:id', async (request, reply) => {
    const params = SlotHoldIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send(zodErrorBody(params.error));
    }

    try {
      await releaseSlotHold(app.prisma, { holdId: params.data.id });
    } catch (err) {
      if (err instanceof SlotHoldNotFoundError) {
        // Idempotent: returning 204 keeps the client's tear-down path simple.
        return reply.code(204).send();
      }
      throw err;
    }

    return reply.code(204).send();
  });
}
