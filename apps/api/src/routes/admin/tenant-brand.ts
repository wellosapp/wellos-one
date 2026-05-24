import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import { UpdateBrandColorsBodySchema } from '../../schemas/tenantBrand.js';
import {
  getTenantBrand,
  updateTenantBrand,
} from '../../services/tenantBrandService.js';

// GET + PATCH the tenant brand palette. Admin-only since it's tenant-wide
// config that affects every service color picker + (future) the public
// booking page.

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

export default async function tenantBrandRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/tenant/brand',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const result = await getTenantBrand(app.prisma, {
        tenantId: user.tenantId!,
      });
      return reply.send(result);
    },
  );

  app.patch(
    '/tenant/brand',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const body = UpdateBrandColorsBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }
      const result = await updateTenantBrand(app.prisma, {
        tenantId: user.tenantId!,
        actorUserId: user.id,
        brandColors: body.data.brandColors,
      });
      return reply.send(result);
    },
  );
}
