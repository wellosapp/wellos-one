import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { withIdempotency } from '../../middleware/idempotency.js';
import {
  PublicCreateAppointmentBodySchema,
  PublicListAvailabilityQuerySchema,
  TenantSlugQuerySchema,
  toListAvailabilityQuery,
} from '../../schemas/publicBooking.js';
import {
  AppointmentSlotConflictError,
  AppointmentStaffScheduleBlockConflictError,
  InvalidAppointmentReferenceError,
  createAppointment,
} from '../../services/appointmentService.js';
import {
  InvalidAvailabilityRequestError,
  listAvailableSlots,
} from '../../services/availabilityService.js';
import { resolveOrCreateClientForPublicBooking } from '../../services/clientService.js';
import { FormsRequiredError } from '../../services/formAssignmentRuleService.js';
import {
  getPublicBookingCatalog,
  resolvePublicBookingTenant,
} from '../../services/publicBookingService.js';

// Public booking API — Epic 3–4 vertical slice (login-free book flow).
//
// Tenant resolution (first match):
//   1. Query param `tenantSlug` (preferred for GET shareable URLs)
//   2. Header `X-Wellos-Tenant-Slug` (optional; useful when the web app proxies)
//   3. Dev-only: header `X-Tenant-Id` when ALLOW_PUBLIC_BOOKING_DEV_TENANT_HEADER=true
//
// Auth: none — do not put Clerk Bearer tokens in browser public flows.
//
// Rate limiting: not wired yet; add Redis sliding window or Edge middleware
// before exposing this broadly on the public internet.
//
// CORS: browser calls from app.wellos.one / localhost dev require allowed
// origins + custom headers in plugins/cors.ts.

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

export default async function publicBookingRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get('/public/booking/catalog', async (request, reply) => {
    const parsed = TenantSlugQuerySchema.safeParse(request.query);
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

    const catalog = await getPublicBookingCatalog(app.prisma, tenant.tenantId);
    return reply.send({ tenantSlug: tenant.slug, ...catalog });
  });

  app.get('/public/booking/availability', async (request, reply) => {
    const parsed = PublicListAvailabilityQuerySchema.safeParse(request.query);
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

    // staff_only services: hide the slot grid by returning empty + a flag.
    // request_approval still returns real slots — clients can request them.
    const policyService = await app.prisma.service.findFirst({
      where: { tenantId: tenant.tenantId, id: parsed.data.serviceId },
      select: { bookingPolicy: true },
    });
    if (policyService?.bookingPolicy === 'staff_only') {
      return reply.send({ slots: [], bookingPolicy: 'staff_only' as const });
    }

    // Optional public-booker fingerprint per R2 §9. Lets the availability
    // engine hide the requesting client's own active holds from their own
    // slot picker. Untrusted; never used for authorization.
    const fpHeader = request.headers['x-wellos-booking-fingerprint'];
    const fingerprint =
      typeof fpHeader === 'string' && fpHeader.trim().length >= 8
        ? fpHeader.trim().slice(0, 128)
        : undefined;

    try {
      const result = await listAvailableSlots(app.prisma, {
        tenantId: tenant.tenantId,
        query: toListAvailabilityQuery(parsed.data),
        excludeHoldsForFingerprint: fingerprint,
      });
      return reply.send({
        ...result,
        bookingPolicy: policyService?.bookingPolicy ?? 'instant',
      });
    } catch (err) {
      if (err instanceof InvalidAvailabilityRequestError) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Validation failed.',
          issues: [{ path: err.field, message: err.message }],
        });
      }
      throw err;
    }
  });

  app.post('/public/booking/appointments', async (request, reply) => {
    const parsed = PublicCreateAppointmentBodySchema.safeParse(request.body);
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
        scope: 'public_booking.appointment_create',
      },
      async () => {
        const guest = parsed.data.guest;

        // R2 §11 — gate on Service.bookingPolicy before doing any client-side
        // resolution work. staff_only refuses public writes; request_approval
        // lands the appointment in `requested` (staff must approve).
        const policyService = await app.prisma.service.findFirst({
          where: {
            tenantId: tenant.tenantId,
            id: parsed.data.serviceId,
          },
          select: { id: true, bookingPolicy: true, active: true },
        });
        if (!policyService) {
          return {
            status: 400,
            body: {
              error: 'Bad Request',
              message: 'Validation failed.',
              issues: [
                { path: 'serviceId', message: 'Unknown service for this tenant.' },
              ],
            },
          };
        }
        if (policyService.bookingPolicy === 'staff_only') {
          return {
            status: 403,
            body: {
              error: 'Forbidden',
              message:
                'This service is staff-booking only. Please contact us to book.',
              bookingPolicy: 'staff_only',
            },
          };
        }
        const targetState =
          policyService.bookingPolicy === 'request_approval'
            ? ('requested' as const)
            : ('confirmed' as const);

        const { clientId, banned } = await resolveOrCreateClientForPublicBooking(
          app.prisma,
          {
            tenantId: tenant.tenantId,
            email: guest.email,
            phone: guest.phone,
            firstName: guest.firstName,
            lastName: guest.lastName,
          },
        );

        if (banned) {
          return {
            status: 403,
            body: {
              error: 'Forbidden',
              message:
                'Online booking is not available for this contact. Please call the business.',
            },
          };
        }

        try {
          const { appointment } = await createAppointment(app.prisma, {
            tenantId: tenant.tenantId,
            actorUserId: null,
            // PR 8 (Forms System) — public flow enforces hard_required form
            // readiness. Admin flows leave this off and surface a warning chip
            // + "Book anyway" override instead.
            enforceFormReadiness: true,
            body: {
              locationId: parsed.data.locationId,
              clientId,
              staffId: parsed.data.staffId,
              serviceId: parsed.data.serviceId,
              scheduledStartAt: parsed.data.scheduledStartAt,
              notes: parsed.data.notes,
              source: 'web',
              state: targetState,
            },
          });

          return {
            status: 201,
            body: {
              appointment: {
                id: appointment.id,
                scheduledStartAt: appointment.scheduledStartAt.toISOString(),
                scheduledEndAt: appointment.scheduledEndAt.toISOString(),
                state: appointment.state,
                staffId: appointment.staffId,
                serviceId: appointment.serviceId,
                locationId: appointment.locationId,
              },
              bookingPolicy: policyService.bookingPolicy,
              // UI uses this to swap copy on the confirmation card.
              message:
                policyService.bookingPolicy === 'request_approval'
                  ? 'Your request has been sent. Staff will review and confirm by email.'
                  : 'Your appointment is confirmed.',
            },
          };
        } catch (err) {
          if (err instanceof FormsRequiredError) {
            // 422 Unprocessable Entity — the request is well-formed but
            // missing prerequisite forms. The UI renders the per-form list
            // so the client knows exactly which forms to complete.
            return {
              status: 422,
              body: {
                error: 'Unprocessable Entity',
                code: 'FORMS_REQUIRED',
                message: err.message,
                requiredForms: err.unsatisfied.map((r) => ({
                  formDefinitionGroupId: r.formDefinitionGroupId,
                  formTitle: r.formTitle,
                  formType: r.formType,
                })),
              },
            };
          }
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
          if (err instanceof AppointmentSlotConflictError) {
            return {
              status: 409,
              body: {
                error: 'Conflict',
                message: err.message,
                conflict: {
                  appointmentId: err.conflictingAppointmentId,
                  staffId: err.staffId,
                  scheduledStartAt: err.scheduledStartAt.toISOString(),
                  scheduledEndAt: err.scheduledEndAt.toISOString(),
                },
              },
            };
          }
          if (err instanceof AppointmentStaffScheduleBlockConflictError) {
            return {
              status: 409,
              body: {
                error: 'Conflict',
                message: err.message,
                conflict: {
                  type: 'staff_schedule_block',
                  blockId: err.blockId,
                  blockTitle: err.blockTitle,
                  blockStartsAt: err.blockStartsAt.toISOString(),
                  blockEndsAt: err.blockEndsAt.toISOString(),
                  staffId: err.staffId,
                  scheduledStartAt: err.scheduledStartAt.toISOString(),
                  scheduledEndAt: err.scheduledEndAt.toISOString(),
                },
              },
            };
          }
          throw err;
        }
      },
    );
  });
}
