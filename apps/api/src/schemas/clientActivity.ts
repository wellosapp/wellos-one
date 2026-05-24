import { z } from 'zod';

// Zod schemas for GET /admin/clients/:clientId/activity — the per-client
// audit-log aggregator. Pagination only (no entity-type filters yet; the
// UI groups them visually instead).

export const ClientActivityQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});
export type ClientActivityQuery = z.infer<typeof ClientActivityQuerySchema>;
