import type { FastifyInstance } from 'fastify';

import { requireRole } from '../../middleware/requireRole.js';

// GET /admin/whoami — admin-only smoke endpoint that proves the
// loadCurrentUser + requireRole wire end-to-end. Returns the loaded user
// alongside their tenant and active locations so a curl in production gives
// us a quick "are role guards working" answer.
//
// requireRole.admin already guarantees:
//   - request.currentUser is populated (loadCurrentUser ran)
//   - tenantId is non-null (orphan check passed)
//   - 'admin' is in roles
// so the non-null assertions below are safe by construction.
export default async function whoamiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/whoami', { preHandler: requireRole.admin }, async (request) => {
    const user = request.currentUser!;
    const tenantId = user.tenantId!;

    const [tenant, locations] = await Promise.all([
      app.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, slug: true, createdAt: true },
      }),
      app.prisma.location.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, name: true, timezone: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return { user, tenant, roles: user.roles, locations };
  });
}
