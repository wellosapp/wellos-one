import { Prisma } from '@prisma/client';

// Models that carry a `deletedAt` column. When a read query targets one of
// these, the extension injects `deletedAt: null` into the top-level `where`
// if the caller hasn't already specified a `deletedAt` filter.
//
// Opt-out: include any `deletedAt` clause in `where`
//   - `{ deletedAt: { not: null } }` → only soft-deleted rows
//   - `{ deletedAt: undefined }`     → no filter (returns deleted + live)
//
// Why intercept reads only:
//   - `findUnique` / `findUniqueOrThrow` require a unique-where, and
//     `deletedAt` isn't part of any unique index. Callers that need to
//     filter soft-deleted by id should use `findFirst`. Webhook flows
//     (e.g. Clerk re-signup undelete) intentionally use `findUnique` so
//     they see soft-deleted rows.
//   - `update` / `delete` / `*Many` mutations are not intercepted to keep
//     the surface area small. Revisit when admin CRUD lands.
const SOFT_DELETE_MODELS = new Set<string>([
  'Tenant',
  'Location',
  'User',
  'Role',
  'TenantFeatureFlag',
  'Client',
  'Staff',
  'Service',
  'ClientTag',
]);

const READ_OPS = new Set<string>([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

export const softDeleteExtension = Prisma.defineExtension({
  name: 'wellos-soft-delete',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (model && SOFT_DELETE_MODELS.has(model) && READ_OPS.has(operation)) {
          const baseArgs = (args ?? {}) as Record<string, unknown>;
          const where =
            (baseArgs.where as Record<string, unknown> | undefined) ?? {};
          if (!('deletedAt' in where)) {
            return query({
              ...baseArgs,
              where: { ...where, deletedAt: null },
            });
          }
        }
        return query(args);
      },
    },
  },
});
