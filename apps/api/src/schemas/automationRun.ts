import { z } from 'zod';

// Zod schemas for the PR 5 automation run-history viewer.

export const AutomationRunStatusFilterSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'all',
]);
export type AutomationRunStatusFilter = z.infer<
  typeof AutomationRunStatusFilterSchema
>;

export const ListAutomationRunsQuerySchema = z.object({
  status: AutomationRunStatusFilterSchema.optional(),
  workflowId: z.string().min(1).optional(),
  // ISO timestamps. Both optional — when both omitted the service returns the
  // tenant's most recent runs without a date floor.
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  cursor: z.string().min(1).max(512).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});
export type ListAutomationRunsQuery = z.infer<
  typeof ListAutomationRunsQuerySchema
>;

export const AutomationRunIdParamsSchema = z.object({
  id: z.string().min(1),
});
