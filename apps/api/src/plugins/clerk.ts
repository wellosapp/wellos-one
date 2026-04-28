import { clerkPlugin } from '@clerk/fastify';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

// Registers Clerk JWT verification on every request. Populates request.auth
// (userId / sessionId / claims) but does NOT block. Per-route opt-in via
// requireAuth keeps /healthz and future /webhooks/* routes open.
//
// Reads CLERK_SECRET_KEY + CLERK_PUBLISHABLE_KEY from env (set on Railway
// per INFRASTRUCTURE.md §4.1).
async function wellosClerkPlugin(app: FastifyInstance): Promise<void> {
  if (!process.env.CLERK_SECRET_KEY || !process.env.CLERK_PUBLISHABLE_KEY) {
    app.log.warn(
      'CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY missing — Clerk plugin not registered. All routes effectively unauthenticated.',
    );
    return;
  }

  await app.register(clerkPlugin, {
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  });
}

export default fp(wellosClerkPlugin, {
  name: 'wellos-clerk',
  fastify: '5.x',
  dependencies: ['wellos-cors'],
});
