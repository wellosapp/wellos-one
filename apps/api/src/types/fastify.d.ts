// Ambient augmentation for Fastify request-scoped state populated by the
// loadCurrentUser preHandler. Read by requireRole and by any route registered
// behind requireRole.* (or loadCurrentUser directly).
//
// `currentUser` is optional because it's only set after loadCurrentUser runs.
// Routes that don't chain that preHandler will see `undefined` — the guards
// short-circuit before route handlers, so handlers can use `request.currentUser!`
// when their preHandler chain guarantees presence.

export interface CurrentUser {
  id: string;
  tenantId: string | null;
  clerkUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  // Role names within the user's current tenant. Empty for orphan users
  // (tenantId === null) regardless of any cross-tenant assignment rows.
  roles: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: CurrentUser;
  }
}
