import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { verifyPostmarkWebhookBasicAuth } from './webhook-auth.js';

/**
 * POST /webhooks/postmark/bounce — bounce notifications (configure in Postmark dashboard).
 * POST /webhooks/postmark/complaint — spam complaints.
 *
 * Auth: HTTP Basic (username + password you set in Postmark) must match
 * POSTMARK_WEBHOOK_BASIC_USER + POSTMARK_WEBHOOK_SECRET.
 */
export default async function postmarkWebhookRoutes(
  app: FastifyInstance,
): Promise<void> {
  const handle =
    (kind: 'bounce' | 'complaint') =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (
        !process.env.POSTMARK_WEBHOOK_BASIC_USER ||
        !process.env.POSTMARK_WEBHOOK_SECRET
      ) {
        request.log.warn(
          'Postmark webhook env missing — POSTMARK_WEBHOOK_BASIC_USER / POSTMARK_WEBHOOK_SECRET',
        );
        return reply.code(503).send({ error: 'Webhook auth not configured' });
      }

      if (!verifyPostmarkWebhookBasicAuth(request.headers.authorization)) {
        request.log.warn({ kind }, 'postmark webhook basic auth failed');
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      // TODO(Epic 8): update client.email_status, emit domain events.
      request.log.info(
        { kind, bodyKeys: Object.keys((request.body as object) ?? {}) },
        'postmark webhook received',
      );

      return reply.code(200).send({ ok: true, handled: false });
    };

  app.post('/postmark/bounce', handle('bounce'));
  app.post('/postmark/complaint', handle('complaint'));
}
