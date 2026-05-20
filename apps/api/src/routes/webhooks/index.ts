import type { FastifyInstance } from 'fastify';

import clerkWebhookRoute from './clerk.js';
import postmarkWebhookRoutes from './postmark.js';
import textlinkWebhookRoutes from './textlink.js';

// Encapsulated webhook context. The raw-body content-type parser only applies
// inside this register call, so non-webhook routes keep Fastify's default
// JSON parser.
//
// Why raw bytes: svix verifies HMAC against the exact bytes Clerk sent. Re-
// stringifying a parsed JSON object is NOT byte-equivalent (key order,
// escaping) and breaks the signature.
export default async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (request, body, done) => {
      const buffer = body as Buffer;
      // Stash raw bytes for signature verification in route handlers.
      (request as unknown as { rawBody: string }).rawBody = buffer.toString('utf8');
      try {
        const json = buffer.length ? JSON.parse(buffer.toString('utf8')) : {};
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  await app.register(clerkWebhookRoute, { prefix: '/webhooks' });
  await app.register(postmarkWebhookRoutes, { prefix: '/webhooks' });
  await app.register(textlinkWebhookRoutes, { prefix: '/webhooks' });
}
