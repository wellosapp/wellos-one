import { verifyToken } from '@clerk/fastify';
import type { FastifyInstance } from 'fastify';

import { rosterBroadcast, type RosterEvent } from '../../lib/rosterBroadcast.js';

// Server-Sent Events endpoint that powers live roster updates on
// /staff/classes/[instanceId]. PR 10 of the Geofence Auto Check-in epic.
//
// GET /staff/class-instances/:instanceId/check-ins/stream
//
// AUTH — query-string token deviation
// ===================================
// EventSource (the browser SSE client) cannot set custom headers, only
// cookies. Our admin/staff surfaces authenticate via Bearer tokens from
// Clerk's `getToken()` because the web app and API live on different
// domains (app.wellos.one vs api.wellos.one) and the Clerk session cookie
// doesn't naturally cross. To bridge that gap without rebuilding the
// cookie story, we accept the Clerk session JWT as a `?token=...` query
// parameter and verify it directly via @clerk/backend's verifyToken.
//
//   TODO(security): query-string tokens leak into proxy/access logs and
//   referer headers. Migrate to a cookie-session model (Clerk's
//   `__session` cookie on a shared parent domain like .wellos.one) when
//   we set up cross-subdomain auth, then this preHandler reverts to the
//   standard requireRole.staff chain.
//
// Tenant scoping: the verified Clerk userId is resolved to a DB user; the
// SSE handler validates the requested instanceId belongs to that user's
// tenantId before subscribing. Without this check a token leak would let
// the leaker subscribe to any tenant's stream.
//
// Single-process bus: see apps/api/src/lib/rosterBroadcast.ts — this only
// works while there's one API process. Multi-instance scaling needs Redis
// pub/sub.

// Keep-alive interval. Proxies (Cloudflare, Vercel edge if it ever
// becomes one) drop idle TCP connections around 30-60s. 25s leaves
// safety margin.
const KEEP_ALIVE_INTERVAL_MS = 25_000;

// Roles allowed to subscribe — mirrors requireRole.staff (super_admin +
// admin + manager + staff). Public/client users have no business on the
// roster stream.
const STAFF_ROLES = new Set(['super_admin', 'admin', 'manager', 'staff']);

export default async function staffClassInstancesStreamRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get<{
    Params: { instanceId: string };
    Querystring: { token?: string };
  }>('/staff/class-instances/:instanceId/check-ins/stream', async (request, reply) => {
    const { instanceId } = request.params;

    // Token extraction — query string first (the only path that works for
    // EventSource), then Authorization header as a fallback for non-browser
    // smoke tests (curl) and future cookie-session migration.
    const queryToken =
      typeof request.query?.token === 'string' && request.query.token.length > 0
        ? request.query.token
        : null;
    const headerToken = (() => {
      const h = request.headers.authorization;
      if (!h || typeof h !== 'string') return null;
      if (!h.toLowerCase().startsWith('bearer ')) return null;
      return h.slice(7).trim() || null;
    })();
    const rawToken = queryToken ?? headerToken;
    if (!rawToken) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Missing token. Pass ?token=<clerk session jwt>.',
      });
    }

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      request.log.error('CLERK_SECRET_KEY missing — cannot verify SSE token');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Auth not configured.',
      });
    }

    let clerkUserId: string;
    try {
      const payload = await verifyToken(rawToken, { secretKey });
      if (!payload.sub) {
        return reply
          .code(401)
          .send({ error: 'Unauthorized', message: 'Invalid token.' });
      }
      clerkUserId = String(payload.sub);
    } catch (err) {
      request.log.info({ err }, 'SSE token verify failed');
      return reply
        .code(401)
        .send({ error: 'Unauthorized', message: 'Invalid token.' });
    }

    // Resolve to a DB user. Same shape as loadCurrentUser but inlined so
    // we don't pull in the full middleware (which expects Clerk plugin
    // hooks to have populated request.auth).
    const user = await app.prisma.user.findUnique({
      where: { clerkUserId },
      select: {
        id: true,
        tenantId: true,
        deletedAt: true,
        roleAssignments: {
          select: { tenantId: true, role: { select: { name: true } } },
        },
      },
    });
    if (!user || user.deletedAt) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'User not found or disabled.',
      });
    }
    if (!user.tenantId) {
      return reply
        .code(403)
        .send({ error: 'Forbidden', message: 'No tenant assignment.' });
    }
    const roles = user.roleAssignments
      .filter((a) => a.tenantId === user.tenantId)
      .map((a) => a.role.name);
    if (!roles.some((r) => STAFF_ROLES.has(r))) {
      return reply
        .code(403)
        .send({ error: 'Forbidden', message: 'Insufficient role.' });
    }

    // Verify the requested instance belongs to caller's tenant. Without
    // this a token leak could subscribe to any other tenant's roster.
    const instance = await app.prisma.classInstance.findFirst({
      where: { id: instanceId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!instance) {
      return reply
        .code(404)
        .send({ error: 'Not Found', message: 'Class instance not found.' });
    }

    // Switch the connection to text/event-stream. `X-Accel-Buffering: no`
    // disables proxy buffering (nginx, some Cloudflare configs) so events
    // hit the client immediately.
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Initial hello — lets the client confirm the stream is alive without
    // waiting for the first server-side mutation.
    reply.raw.write(`event: hello\ndata: ${JSON.stringify({ instanceId })}\n\n`);

    const onEvent = (event: RosterEvent) => {
      try {
        reply.raw.write(
          `event: roster-update\ndata: ${JSON.stringify(event)}\n\n`,
        );
      } catch {
        // Connection closed mid-write — disposer in the close handler will
        // clean up.
      }
    };
    const unsubscribe = rosterBroadcast.subscribe(instanceId, onEvent);

    // Keep-alive ping. SSE comments (lines starting with `:`) are valid
    // and never reach the client's event handler — they just keep
    // intermediate proxies from idling out the TCP socket.
    const pingInterval = setInterval(() => {
      try {
        reply.raw.write(`: keep-alive\n\n`);
      } catch {
        // Same — close handler cleans up.
      }
    }, KEEP_ALIVE_INTERVAL_MS);

    request.raw.on('close', () => {
      clearInterval(pingInterval);
      unsubscribe();
    });

    // Returning the reply tells Fastify "I'm handling the raw response
    // myself"; without this the framework will try to send a JSON body.
    return reply;
  });
}
