import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import { UpdateTenantBrandBodySchema } from '../../schemas/tenantBrand.js';
import {
  getTenantBrand,
  InvalidTenantLogoError,
  updateTenantBrand,
} from '../../services/tenantBrandService.js';

// GET + PATCH the tenant brand settings (palette + logo). Admin-only since
// it's tenant-wide config that affects every service color picker, the admin
// rail branding spot, and (future) the public booking page.

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
      const body = UpdateTenantBrandBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }
      try {
        const result = await updateTenantBrand(app.prisma, {
          tenantId: user.tenantId!,
          actorUserId: user.id,
          brandColors: body.data.brandColors,
          logoMediaAssetId: body.data.logoMediaAssetId,
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof InvalidTenantLogoError) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
