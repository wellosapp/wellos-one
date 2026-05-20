import { getAuth } from '@clerk/fastify';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

import type { CurrentUser, Impersonator } from '../types/fastify.js';

// preHandler that resolves the Clerk session to a DB user (with tenant-scoped
// roles) and stashes the result on `request.currentUser` for downstream guards
// and route handlers.
//
// Failure modes — all 401 to keep the contract simple for the frontend
// (treat any 401 as "log out and re-auth"):
//   - no Clerk session                → "Missing or invalid Clerk session token."
//   - Clerk session but no DB row     → "No matching user record. Webhook may not have synced yet."
//   - DB row soft-deleted             → "User account has been disabled."
//
// Authorization decisions (orphan, wrong role) are 403 and live in requireRole.
//
// Single Prisma round-trip: User joined to RoleAssignment joined to Role. Roles
// are filtered to the user's own tenantId (cross-tenant memberships not in
// scope at MVP). No caching at MVP — revisit if /admin/* shows up hot.
export const loadCurrentUser: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const auth = getAuth(request);
  if (!auth.userId) {
    request.log.info({ url: request.url }, 'loadCurrentUser: no userId — 401');
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid Clerk session token.',
    });
  }

  const user = await request.server.prisma.user.findUnique({
    where: { clerkUserId: auth.userId },
    select: {
      id: true,
      tenantId: true,
      email: true,
      firstName: true,
      lastName: true,
      deletedAt: true,
      roleAssignments: {
        select: {
          tenantId: true,
          role: { select: { name: true } },
        },
      },
    },
  });

  if (!user) {
    request.log.info(
      { clerkUserId: auth.userId, url: request.url },
      'loadCurrentUser: no DB user — webhook lag? — 401',
    );
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'No matching user record. Webhook may not have synced yet.',
    });
  }

  if (user.deletedAt) {
    request.log.info(
      { userId: user.id, url: request.url },
      'loadCurrentUser: user soft-deleted — 401',
    );
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'User account has been disabled.',
    });
  }

  const roles = user.roleAssignments
    .filter((a) => a.tenantId === user.tenantId)
    .map((a) => a.role.name);

  const currentUser: CurrentUser = {
    id: user.id,
    tenantId: user.tenantId,
    clerkUserId: auth.userId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roles,
  };

  request.currentUser = currentUser;

  // Impersonation: Clerk's actor token flow sets `auth.actor.sub` to the
  // ORIGINAL signer's clerkUserId. `auth.userId` is the impersonated user
  // (whose session is active). Fetch the impersonator so audit-log writes
  // can record both actor_user_id (real human) and subject_user_id
  // (impersonated user). If the impersonator row is missing or soft-deleted,
  // we log loudly and refuse — an active actor claim with no DB user is a
  // tamper signal.
  const actorClerkUserId =
    typeof auth.actor === 'object' && auth.actor !== null && 'sub' in auth.actor
      ? String(auth.actor.sub)
      : null;

  if (actorClerkUserId) {
    const actor = await request.server.prisma.user.findUnique({
      where: { clerkUserId: actorClerkUserId },
      select: {
        id: true,
        email: true,
        deletedAt: true,
        tenantId: true,
        roleAssignments: {
          select: {
            tenantId: true,
            role: { select: { name: true } },
          },
        },
      },
    });

    if (!actor || actor.deletedAt) {
      request.log.error(
        { clerkUserId: auth.userId, actorClerkUserId, url: request.url },
        'loadCurrentUser: actor claim present but actor user missing or soft-deleted — 401',
      );
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Impersonation actor not found.',
      });
    }

    const actorRoles = actor.roleAssignments
      .filter((a) => a.tenantId === actor.tenantId)
      .map((a) => a.role.name);

    const impersonator: Impersonator = {
      id: actor.id,
      clerkUserId: actorClerkUserId,
      email: actor.email,
      roles: actorRoles,
    };

    request.impersonator = impersonator;
  }
};
