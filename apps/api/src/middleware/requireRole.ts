import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

import { loadCurrentUser } from './loadCurrentUser.js';

// Role names match the seeded Role.name values in prisma/seed.ts
// (super_admin, admin, manager, staff). Update both together.
// super_admin is provisioned manually via bootstrap-admin.ts --super and
// can impersonate other users via the Sign-in-as flow.
export type RoleName = 'super_admin' | 'admin' | 'manager' | 'staff';

// Authorization preHandler. Assumes loadCurrentUser already populated
// `request.currentUser` — the convenience exports below bundle both.
//
// 403 envelope matches requireAuth's 401 shape: { error, message }. Distinct
// messages for orphan-vs-wrong-role help ops spot incomplete claim flows
// (a user who signed up but was never assigned to a tenant) without forcing
// callers to parse error codes.
//
// No audit_log writes for denials at MVP — denials are warn-logged and
// audit_log is reserved for state-changing actions (cf services/userSync.ts).
function buildRoleGuard(allowed: readonly RoleName[]): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    if (!user) {
      // Programmer error: route forgot to chain loadCurrentUser. Log loudly so
      // it surfaces in Sentry rather than silently 403-ing real users.
      request.log.error(
        { url: request.url },
        'requireRole: request.currentUser missing — preHandler ordering bug',
      );
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Authorization context missing.',
      });
    }

    if (user.tenantId === null) {
      request.log.warn(
        { userId: user.id, url: request.url, requiredRoles: allowed },
        'requireRole: orphan user (no tenant) — 403',
      );
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'No tenant assignment.',
      });
    }

    const matched = user.roles.some((r) => (allowed as readonly string[]).includes(r));
    if (!matched) {
      request.log.warn(
        {
          userId: user.id,
          tenantId: user.tenantId,
          url: request.url,
          requiredRoles: allowed,
          actualRoles: user.roles,
        },
        'requireRole: insufficient role — 403',
      );
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Insufficient role.',
      });
    }
  };
}

// Hierarchy is implicit in the convenience exports below:
//   superAdmin — super_admin only (platform-wide; bypass tenant gating)
//   admin      — super_admin or admin
//   manager    — super_admin, admin, or manager
//   staff      — super_admin, admin, manager, or staff
// Spell out the array via requireRole(...) for non-hierarchical role sets.
export function requireRole(...allowed: RoleName[]): preHandlerHookHandler {
  return buildRoleGuard(allowed);
}

// Pre-chained [loadCurrentUser, guard] arrays so route definitions stay
// one-liners: app.get('/admin/x', { preHandler: requireRole.admin }, ...).
// Fastify's preHandler option accepts a mutable array, hence no `as const`.
//
// super_admin sits above all tenant-scoped roles by design. The Role table
// row for super_admin still gets joined through a RoleAssignment to a
// specific tenant (the role-assignment table requires it), but the role
// grants platform-wide privileges — including impersonation via the
// /admin/impersonate/* endpoints.
requireRole.superAdmin = [loadCurrentUser, buildRoleGuard(['super_admin'])];
requireRole.admin = [loadCurrentUser, buildRoleGuard(['super_admin', 'admin'])];
requireRole.manager = [
  loadCurrentUser,
  buildRoleGuard(['super_admin', 'admin', 'manager']),
];
requireRole.staff = [
  loadCurrentUser,
  buildRoleGuard(['super_admin', 'admin', 'manager', 'staff']),
];
