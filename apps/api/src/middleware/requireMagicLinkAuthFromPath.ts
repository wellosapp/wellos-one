// Magic-link auth middleware that reads the raw token from a URL path
// parameter (`:token`) instead of the Authorization header.
//
// Used by PR 7 of the Forms System epic — `/public/forms/:token/...` routes.
// The client opens a magic link like https://app.wellos.one/forms/<token>
// which renders an interactive form filler; that page then calls back into
// the API hitting these same routes. Putting the token in the URL keeps the
// surface dead-simple (no JS env needed to hand the bearer header) at the
// cost of exposing the token in the address bar (acceptable for MVP —
// tokens are single-purpose and auto-revoke on submit).
//
// Failure modes mirror requireMagicLinkAuth — same response codes / shape,
// so client error handling stays uniform regardless of which middleware
// fronted the route.

import type { preHandlerHookHandler } from 'fastify';

import {
  InvalidTokenError,
  TokenExpiredError,
  TokenPurposeMismatchError,
  TokenRevokedError,
  verifyToken,
  type MagicLinkPurpose,
} from '../services/magicLinkService.js';

// Token shape matches what generateToken emits: 64 lowercase-hex chars.
// Anything else short-circuits to MALFORMED_TOKEN.
const TOKEN_RE = /^[a-f0-9]{64}$/;

export function requireMagicLinkAuthFromPath(
  purpose: MagicLinkPurpose,
): preHandlerHookHandler {
  return async (request, reply) => {
    const params = request.params as { token?: string };
    const rawToken = params.token;

    if (!rawToken) {
      return reply.code(401).send({
        error: 'Unauthorized',
        code: 'MISSING_TOKEN',
        message: 'Token path parameter required.',
      });
    }

    if (!TOKEN_RE.test(rawToken)) {
      return reply.code(401).send({
        error: 'Unauthorized',
        code: 'MALFORMED_TOKEN',
        message: 'Token must be 64 lowercase-hex characters.',
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
      request.log.error(
        { err, url: request.url },
        'requireMagicLinkAuthFromPath: unexpected error',
      );
      throw err;
    }
  };
}
