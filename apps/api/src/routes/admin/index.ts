import type { FastifyInstance } from 'fastify';

import appointmentsRoutes from './appointments.js';
import availabilityRoutes from './availability.js';
import clientNotesRoutes from './client-notes.js';
import clientTagsRoutes from './client-tags.js';
import clientsRoutes from './clients.js';
import linkedRecordsRoutes from './linked-records.js';
import servicesRoutes from './services.js';
import staffRoutes from './staff.js';
import triageRoutes from './triage.js';
import whoamiRoutes from './whoami.js';

// Admin-only API surface. All routes registered under /admin/* and behind
// requireRole.admin (or stricter). Adding a new admin endpoint = drop a route
// file in this folder and register it here.
export default async function adminRoutes(app: FastifyInstance): Promise<void> {
  await app.register(whoamiRoutes, { prefix: '/admin' });
  await app.register(clientsRoutes, { prefix: '/admin' });
  await app.register(clientTagsRoutes, { prefix: '/admin' });
  await app.register(clientNotesRoutes, { prefix: '/admin' });
  await app.register(servicesRoutes, { prefix: '/admin' });
  await app.register(staffRoutes, { prefix: '/admin' });
  await app.register(appointmentsRoutes, { prefix: '/admin' });
  await app.register(availabilityRoutes, { prefix: '/admin' });
  await app.register(linkedRecordsRoutes, { prefix: '/admin' });
  await app.register(triageRoutes, { prefix: '/admin' });
}
