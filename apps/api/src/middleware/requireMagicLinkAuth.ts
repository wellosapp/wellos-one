// Fastify preHandler that authenticates a request via a magic-link bearer
// token. Used by the PR 8b geofence routes (purpose='geofence_check_in')
// and any future manage-flow routes (purpose='manage_booking').
//
// Usage:
//   app.post(
//     '/api/class-bookings/:id/geofence-check-in',
//     { preHandler: requireMagicLinkAuth('geofence_check_in') },
//     async (req) => {
//       const { token, client, classBooking } = req.magicLinkAuth!;
//       // ...
//     }
//   );
//
// Failure modes map 1:1 to 401 responses with a discriminating `code`:
//   MISSING_TOKEN          — no Authorization header at all
//   MALFORMED_TOKEN        — header present but not `Bearer <64-hex>`
//   INVALID_TOKEN          — well-formed but no matching row
//   TOKEN_EXPIRED          — row found but past expiresAt
//   TOKEN_REVOKED          — row found but revokedAt is set
//   TOKEN_PURPOSE_MISMATCH — row valid but wrong purpose for this route

import type { preHandlerHookHandler } from 'fastify';

import { parseBearerToken } from '../lib/tokenCrypto.js';
import {
  InvalidTokenError,
  TokenExpiredError,
  TokenPurposeMismatchError,
  TokenRevokedError,
  verifyToken,
  type MagicLinkPurpose,
  type VerifyTokenResult,
} from '../services/magicLinkService.js';

declare module 'fastify' {
  interface FastifyRequest {
    magicLinkAuth?: VerifyTokenResult;
  }
}

export function requireMagicLinkAuth(
  purpose: MagicLinkPurpose,
): preHandlerHookHandler {
  return async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.code(401).send({
        error: 'Unauthorized',
        code: 'MISSING_TOKEN',
        message: 'Bearer token required.',
      });
    }

    const rawToken = parseBearerToken(authHeader);
    if (!rawToken) {
      return reply.code(401).send({
        error: 'Unauthorized',
        code: 'MALFORMED_TOKEN',
        message: 'Authorization header must be `Bearer <64-hex-char-token>`.',
      });
    }

    try {
      const result = await verifyToken(request.server.prisma, {
        rawToken,
        expectedPurpose: purpose,
      });
      request.magicLinkAuth = result;
      return;
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        return reply.code(401).send({
          error: 'Unauthorized',
          code: 'INVALID_TOKEN',
          message: 'Token not recognized.',
        });
      }
      if (err instanceof TokenExpiredError) {
        return reply.code(401).send({
          error: 'Unauthorized',
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired.',
        });
      }
      if (err instanceof TokenRevokedError) {
        return reply.code(401).send({
          error: 'Unauthorized',
          code: 'TOKEN_REVOKED',
          message: 'Token has been revoked.',
        });
      }
      if (err instanceof TokenPurposeMismatchError) {
        return reply.code(401).send({
          error: 'Unauthorized',
          code: 'TOKEN_PURPOSE_MISMATCH',
          message: `Token cannot be used for this action (expected '${err.expected}', got '${err.actual}').`,
        });
      }
      // Unknown error — log via Fastify and rethrow so the Sentry handler
      // captures it. Don't 401 here; an opaque 500 is the correct response.
      request.log.error({ err, url: request.url }, 'requireMagicLinkAuth: unexpected error');
      throw err;
    }
  };
}
