import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Webhook } from 'svix';

import { syncUserFromClerk, type ClerkWebhookEvent } from '../../services/userSync.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

const SUPPORTED = new Set(['user.created', 'user.updated', 'user.deleted']);

export default async function clerkWebhookRoute(app: FastifyInstance): Promise<void> {
  // POST /webhooks/clerk — NOT protected by requireAuth. svix HMAC is the
  // authentication mechanism for webhook traffic.
  app.post('/clerk', async (request: FastifyRequest, reply) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      request.log.warn('CLERK_WEBHOOK_SECRET unset — cannot verify webhook');
      return reply.code(503).send({ error: 'Webhook secret not configured' });
    }

    const rawBody = request.rawBody;
    if (!rawBody) {
      request.log.error('webhook missing rawBody — content-type parser misconfigured');
      return reply.code(400).send({ error: 'Missing raw body' });
    }

    const svixHeaders = {
      'svix-id': String(request.headers['svix-id'] ?? ''),
      'svix-timestamp': String(request.headers['svix-timestamp'] ?? ''),
      'svix-signature': String(request.headers['svix-signature'] ?? ''),
    };

    let event: ClerkWebhookEvent;
    try {
      event = new Webhook(secret).verify(rawBody, svixHeaders) as ClerkWebhookEvent;
    } catch (err) {
      request.log.warn({ err }, 'svix signature verification failed');
      return reply.code(401).send({ error: 'Invalid signature' });
    }

    if (!SUPPORTED.has(event.type)) {
      // Acknowledge so Clerk stops retrying; we just don't act on it.
      request.log.info({ type: event.type }, 'unhandled clerk event type — acknowledging');
      return reply.code(200).send({ ok: true, handled: false });
    }

    try {
      const result = await syncUserFromClerk(app.prisma, event);
      request.log.info({ type: event.type, ...result }, 'clerk webhook processed');
      return reply.code(200).send({ ok: true, ...result });
    } catch (err) {
      // 5xx → Clerk retries. Sentry captures via setupFastifyErrorHandler.
      request.log.error({ err, type: event.type }, 'failed to process clerk webhook');
      throw err;
    }
  });
}
