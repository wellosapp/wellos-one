import { getAuth } from '@clerk/fastify';
import type { FastifyInstance } from 'fastify';

import { requireAuth } from '../middleware/requireAuth.js';

// GET /me — returns the verified Clerk identity AND the corresponding DB row.
//
// `user: null` is meaningful: it means the Clerk webhook hasn't populated this
// user in our DB yet (debug signal — webhook outage, race with first login).
//
// Deliberately uses requireAuth + inline lookup, NOT the loadCurrentUser
// preHandler from sub-step 6. loadCurrentUser would 401 on the
// pre-webhook-sync case and lose this debug signal — /me is the one
// endpoint where we want to surface it instead of hiding it behind a 401.
export default async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: requireAuth }, async (request) => {
    const { userId, sessionId } = getAuth(request);
    const user = userId
      ? await app.prisma.user.findUnique({
          where: { clerkUserId: userId },
          select: {
            id: true,
            tenantId: true,
            email: true,
            firstName: true,
            lastName: true,
            deletedAt: true,
          },
        })
      : null;
    return { clerkUserId: userId, sessionId, user };
  });
}
