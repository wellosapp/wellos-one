import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import {
  BookingConfirmationParamsSchema,
  type BookingConfirmationResponse,
} from '../../schemas/bookingConfirmation.js';
import { resolveBookingSetting } from '../../services/bookingSettingsService.js';

// Public GET endpoint that backs the server-rendered confirmation page
// at /book/[tenantSlug]/confirmation/[appointmentId]. PR 3 of 3 —
// docs/04-booking-flow.md §B + "Not You?" escape hatch.
//
// Auth gating intentionally is NOT a signed token (MVP design — same
// rationale as the dispute endpoint next door): we gate on existence
// (404) and a 30-min window from createdAt (410). After the window the
// client must check their email for the booking link.
//
// The payload is redacted by design — see
// schemas/bookingConfirmation.ts for the exact shape.

const CONFIRMATION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes from createdAt.

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

export default async function publicBookingConfirmationRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/public/booking/:appointmentId/confirmation',
    async (request, reply) => {
      const params = BookingConfirmationParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      // cuids are globally unique; we don't take a tenantSlug. Findings are
      // bounded by the soft-delete extension just like every other read.
      const appointment = await app.prisma.appointment.findFirst({
        where: { id: params.data.appointmentId },
        select: {
          id: true,
          tenantId: true,
          state: true,
          scheduledStartAt: true,
          scheduledEndAt: true,
          matchStrength: true,
          clientMatchDisputed: true,
          createdAt: true,
          service: { select: { name: true } },
          staff: { select: { firstName: true } },
          client: { select: { firstName: true } },
          location: { select: { timezone: true } },
          tenant: { select: { name: true } },
        },
      });

      if (!appointment) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Appointment not found.',
        });
      }

      const now = Date.now();
      if (now - appointment.createdAt.getTime() >= CONFIRMATION_WINDOW_MS) {
        return reply.code(410).send({
          error: 'WINDOW_EXPIRED',
          message:
            'This confirmation link has expired. Check your email for booking details.',
        });
      }

      // Two-tier resolution: appointment override (none here) → staff → tenant.
      // Cancellation knobs don't have per-staff overrides, so this effectively
      // returns the tenant default — but we go through the resolver so any
      // future per-staff column is picked up automatically.
      const [windowHours, feeCents] = await Promise.all([
        resolveBookingSetting(app.prisma, {
          tenantId: appointment.tenantId,
          key: 'bookingCancellationWindowHours',
        }),
        resolveBookingSetting(app.prisma, {
          tenantId: appointment.tenantId,
          key: 'bookingCancellationFeeCents',
        }),
      ]);

      const deadlineMs =
        appointment.scheduledStartAt.getTime() - windowHours * 60 * 60 * 1000;
      const cancellationDeadline = new Date(deadlineMs).toISOString();

      const body: BookingConfirmationResponse = {
        appointmentId: appointment.id,
        state: appointment.state,
        scheduledStartAt: appointment.scheduledStartAt.toISOString(),
        scheduledEndAt: appointment.scheduledEndAt.toISOString(),
        service: { name: appointment.service.name },
        staff: { firstName: appointment.staff.firstName },
        client: { firstName: appointment.client.firstName },
        clientMatchDisputed: appointment.clientMatchDisputed,
        matchStrength: appointment.matchStrength ?? null,
        tenant: {
          name: appointment.tenant.name,
          // Tenant has no timezone column — Location does. Use the
          // appointment's location TZ so the deadline + start time render
          // in the business's local time. Falls back to UTC defensively.
          timezone: appointment.location.timezone || 'UTC',
        },
        cancellationDeadline,
        cancellationFeeCents: feeCents,
      };

      return reply.send(body);
    },
  );
}
