import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import { MintManageLinkParamsSchema } from '../../schemas/magicLink.js';
import { mintMagicLink } from '../../services/magicLinkService.js';

// POST /admin/appointments/:appointmentId/mint-manage-link
//
// Staff-initiated magic link for support workflows — staff copy/pastes the
// returned publicUrl into their preferred channel until Epic 8 wires Postmark.
//
// Auth: requireRole.admin (super_admin + admin). Manager / staff escalate
// through admin for this surface — see role-based view table in
// docs/04-booking-flow.md.
//
// Audit: mintMagicLink writes a system-actor audit row inside its own
// transaction. The route layer does NOT add a second audit row.

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

export default async function mintManageLinkRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    '/appointments/:appointmentId/mint-manage-link',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = MintManageLinkParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      // Tenant scope — the appointment must belong to the actor's tenant.
      // We also need the client's email to use as the recipient.
      const appointment = await app.prisma.appointment.findFirst({
        where: { tenantId, id: params.data.appointmentId },
        select: {
          id: true,
          client: { select: { id: true, email: true } },
        },
      });
      if (!appointment) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Appointment not found.',
        });
      }

      const recipientEmail = appointment.client.email?.trim();
      if (!recipientEmail) {
        return reply.code(400).send({
          error: 'Bad Request',
          message:
            'This client has no email on file — add one before minting a magic link.',
        });
      }

      const minted = await app.prisma.$transaction((tx) =>
        mintMagicLink(tx, {
          tenantId,
          purpose: 'manage_booking',
          appointmentId: appointment.id,
          recipientEmail,
        }),
      );

      return reply.code(201).send({
        tokenId: minted.tokenId,
        publicUrl: minted.publicUrl,
        expiresAt: minted.expiresAt.toISOString(),
      });
    },
  );
}
