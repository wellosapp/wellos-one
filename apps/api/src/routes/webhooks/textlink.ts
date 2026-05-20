import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { verifyTextlinkWebhookBodySecret } from './webhook-auth.js';

/**
 * TextLink console webhooks (paths align with docs/09-dev-handoff.md).
 *
 * Auth: JSON `secret` must match TEXTLINK_WEBHOOK_SECRET.
 * If TextLink's "tag" test payload omits `secret`, the dashboard sample is incomplete —
 * require the secret field in production (same as other webhook types).
 */
export default async function textlinkWebhookRoutes(
  app: FastifyInstance,
): Promise<void> {
  const handle =
    (kind: 'sent' | 'failed' | 'inbound' | 'tag') =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!process.env.TEXTLINK_WEBHOOK_SECRET) {
        request.log.warn(
          'TEXTLINK_WEBHOOK_SECRET unset — cannot verify TextLink webhooks',
        );
        return reply.code(503).send({ error: 'Webhook secret not configured' });
      }

      if (!verifyTextlinkWebhookBodySecret(request.body)) {
        request.log.warn({ kind }, 'textlink webhook secret verification failed');
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      // TODO(Epic 8): enqueue durable processing, STOP/HELP routing, failure retries.
      request.log.info(
        { kind, bodyKeys: Object.keys((request.body as object) ?? {}) },
        'textlink webhook received',
      );

      return reply.code(200).send({ ok: true, handled: false });
    };

  app.post('/textlink/sent', handle('sent'));
  app.post('/textlink/failed', handle('failed'));
  app.post('/textlink/inbound', handle('inbound'));
  app.post('/textlink/tag', handle('tag'));
}
