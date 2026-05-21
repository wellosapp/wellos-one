import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { CreatePublicWaitlistBodySchema } from '../../schemas/waitlist.js';
import { resolvePublicBookingTenant } from '../../services/publicBookingService.js';
import {
  InvalidWaitlistReferenceError,
  WaitlistContactRequiredError,
  createWaitlistEntry,
} from '../../services/waitlistService.js';

// Public waitlist signup (R2 §10.1). No Clerk auth. Same tenant-resolution
// rules as the rest of public/booking.ts:
//   1. Body `tenantSlug`
//   2. Header `X-Wellos-Tenant-Slug`
//   3. Dev-only header `X-Tenant-Id` when ALLOW_PUBLIC_BOOKING_DEV_TENANT_HEADER=true
//
// Rate limiting + CORS: same caveats as the rest of public booking.

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

export default async function publicWaitlistRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post('/public/booking/waitlist', async (request, reply) => {
    const parsed = CreatePublicWaitlistBodySchema.safeParse(request.body);
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
      const { entry, replacedExisting } = await createWaitlistEntry(
        app.prisma,
        {
          tenantId: tenant.tenantId,
          locationId: parsed.data.locationId,
          serviceId: parsed.data.serviceId,
          staffId: parsed.data.staffId ?? null,
          contact: {
            name: parsed.data.contactName,
            email: parsed.data.contactEmail ?? null,
            phone: parsed.data.contactPhone ?? null,
          },
          preferences: {
            start: parsed.data.preferredStart
              ? new Date(parsed.data.preferredStart)
              : null,
            end: parsed.data.preferredEnd
              ? new Date(parsed.data.preferredEnd)
              : null,
            timeOfDay: parsed.data.preferredTimeOfDay ?? null,
          },
          smsOptIn: parsed.data.smsOptIn,
          notes: parsed.data.notes ?? null,
        },
      );

      return reply.code(201).send({
        id: entry.id,
        ttlExpiresAt: entry.ttlExpiresAt.toISOString(),
        status: entry.status,
        replacedExisting,
      });
    } catch (err) {
      if (err instanceof InvalidWaitlistReferenceError) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: err.message,
          field: err.field,
        });
      }
      if (err instanceof WaitlistContactRequiredError) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Validation failed.',
          issues: [{ path: 'contactEmail', message: err.message }],
        });
      }
      throw err;
    }
  });
}
