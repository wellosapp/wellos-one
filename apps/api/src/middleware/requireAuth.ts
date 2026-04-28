import { getAuth } from '@clerk/fastify';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

// Route-level preHandler that requires a valid Clerk session.
//
// Usage: app.get('/me', { preHandler: requireAuth }, async (req) => { ... });
//
// Opt-in (per route) so /healthz stays open for BetterStack and future
// /webhooks/* routes can verify provider HMAC signatures instead. Anything
// beyond identity (role gating, tenant scoping) is sub-steps 6+.
export const requireAuth: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const auth = getAuth(request);
  if (!auth.userId) {
    request.log.info({ url: request.url }, 'requireAuth: no userId — 401');
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid Clerk session token.',
    });
  }
};
