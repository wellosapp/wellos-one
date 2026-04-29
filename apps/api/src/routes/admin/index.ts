import type { FastifyInstance } from 'fastify';

import clientsRoutes from './clients.js';
import whoamiRoutes from './whoami.js';

// Admin-only API surface. All routes registered under /admin/* and behind
// requireRole.admin (or stricter). Adding a new admin endpoint = drop a route
// file in this folder and register it here.
export default async function adminRoutes(app: FastifyInstance): Promise<void> {
  await app.register(whoamiRoutes, { prefix: '/admin' });
  await app.register(clientsRoutes, { prefix: '/admin' });
}
