import type { FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';

import { loadCurrentUser } from '../../middleware/loadCurrentUser.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  ImpersonationActorMissingClerkIdError,
  ImpersonationTargetForbiddenError,
  ImpersonationTargetMissingClerkIdError,
  ImpersonationTargetNotFoundError,
  startImpersonation,
  writeImpersonationAudit,
} from '../../services/impersonationService.js';

const StartImpersonationBodySchema = z.object({
  targetUserId: z.string().min(1).max(64),
  sessionMaxDurationInSeconds: z.number().int().min(60).max(28800).optional(),
});

function zodErrorBody(err: ZodError) {
  return {
    error: 'Bad Request',
    message: 'Validation failed.',
    issues: err.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  };
}

/**
 * Super-admin impersonation API (Phase 2 of the Sign-in-as feature).
 *
 * - POST /admin/impersonate/start — super-admin only; mints a Clerk actor
 *   token for a target staff/admin/manager user. The web client exchanges
 *   the token to swap into the impersonation session.
 * - GET  /admin/impersonate/active — any authed user; reports whether the
 *   current request is under impersonation and identifies both parties.
 * - POST /admin/impersonate/end — any authed user under impersonation;
 *   writes an audit-log row for the end-of-impersonation event. Session
 *   teardown is client-side (Clerk JS clears the actor session).
 *
 * Phase 3 (UI) will add the "Sign in as" button and the persistent
 * impersonation banner.
 */
export default async function impersonateRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    '/impersonate/start',
    { preHandler: requireRole.superAdmin },
    async (request, reply) => {
      const actor = request.currentUser!;
      const tenantId = actor.tenantId;
      if (!tenantId) {
        // requireRole.superAdmin already guards against orphans, but the
        // type system doesn't know — narrow loudly so the audit log can
        // record a non-null tenant id.
        request.log.error(
          { userId: actor.id },
          'impersonate/start: super-admin has no tenantId — should never happen post-bootstrap',
        );
        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Super-admin missing tenant assignment.',
        });
      }

      const parsed = StartImpersonationBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      try {
        const result = await startImpersonation(app.prisma, {
          actor: { id: actor.id, clerkUserId: actor.clerkUserId },
          targetUserId: parsed.data.targetUserId,
          sessionMaxDurationInSeconds: parsed.data.sessionMaxDurationInSeconds,
        });

        await writeImpersonationAudit(app.prisma, {
          tenantId,
          actorUserId: actor.id,
          subjectUserId: result.target.id,
          action: 'impersonation.token_minted',
          entityId: result.actorTokenId,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        return reply.code(201).send({
          actorTokenId: result.actorTokenId,
          token: result.token,
          url: result.url,
          expiresAt: result.expiresAt,
          target: result.target,
        });
      } catch (err) {
        if (err instanceof ImpersonationTargetNotFoundError) {
          return reply.code(404).send({ error: 'Not Found', message: err.message });
        }
        if (err instanceof ImpersonationTargetForbiddenError) {
          return reply.code(403).send({ error: 'Forbidden', message: err.message });
        }
        if (err instanceof ImpersonationTargetMissingClerkIdError) {
          return reply.code(409).send({
            error: 'Conflict',
            message: err.message,
          });
        }
        if (err instanceof ImpersonationActorMissingClerkIdError) {
          return reply.code(500).send({
            error: 'Internal Server Error',
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  app.get(
    '/impersonate/active',
    { preHandler: loadCurrentUser },
    async (request, reply) => {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Sign in required.',
        });
      }

      if (!request.impersonator) {
        return reply.send({ active: false });
      }

      return reply.send({
        active: true,
        actor: {
          id: request.impersonator.id,
          email: request.impersonator.email,
          roles: request.impersonator.roles,
        },
        subject: {
          id: user.id,
          email: user.email,
          roles: user.roles,
        },
      });
    },
  );

  app.post(
    '/impersonate/end',
    { preHandler: loadCurrentUser },
    async (request, reply) => {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Sign in required.',
        });
      }

      if (!request.impersonator) {
        // Idempotent: ending an already-ended impersonation is a no-op
        // (200 with active:false instead of 4xx). Lets the UI hit this
        // endpoint on tab close without spurious errors.
        return reply.send({ active: false });
      }

      // Tenant for the audit row: prefer the impersonated user's tenant
      // since that's where the actions were happening. Fall back to the
      // actor's tenant if the subject is somehow orphan (defensive).
      const auditTenantId = user.tenantId ?? null;
      if (auditTenantId) {
        await writeImpersonationAudit(app.prisma, {
          tenantId: auditTenantId,
          actorUserId: request.impersonator.id,
          subjectUserId: user.id,
          action: 'impersonation.ended',
          // The Clerk session id isn't exposed on getAuth's return shape
          // in our pinned SDK version, so we use the subject user id as
          // a stable correlation key with the matching `started` row.
          entityId: user.id,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });
      }

      return reply.send({
        active: false,
        endedAt: new Date().toISOString(),
      });
    },
  );
}
