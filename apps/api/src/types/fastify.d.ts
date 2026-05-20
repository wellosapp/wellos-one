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

// Populated by loadCurrentUser ONLY when the incoming Clerk session carries
// an `actor` claim — meaning a super-admin is currently signed in as this
// user via a Clerk actor token. `currentUser` is the impersonated subject;
// `impersonator` is the real human (the super-admin) acting through them.
// Audit-log writes should record `actor_user_id = impersonator.id` and
// `subject_user_id = currentUser.id` whenever this is set.
export interface Impersonator {
  id: string;
  clerkUserId: string;
  email: string;
  // Role names of the impersonator within their own tenant — useful for
  // belt-and-suspenders checks (we never expect anything other than
  // ['super_admin'] here, but the loader returns the full list).
  roles: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: CurrentUser;
    impersonator?: Impersonator;
  }
}
