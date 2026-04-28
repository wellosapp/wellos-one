import { getAuth } from '@clerk/fastify';
import type { FastifyInstance } from 'fastify';

import { requireAuth } from '../middleware/requireAuth.js';

// GET /me — smoke endpoint proving the Clerk wire is good.
// No DB lookup; sub-step 7 will resolve clerkUserId → users row → tenant_id.
export default async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: requireAuth }, async (request) => {
    const { userId, sessionId } = getAuth(request);
    return { clerkUserId: userId, sessionId };
  });
}
