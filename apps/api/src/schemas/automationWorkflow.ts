import { z } from 'zod';

// Zod schemas for the PR 6 automation workflow CRUD surface.
//
// `workflowJson` is intentionally accepted as `z.unknown()` at the route
// boundary — the service layer runs the heavier `parseWorkflowJson`
// (from apps/api/src/lib/automationWorkflowTypes.ts) so a future canvas
// node-type addition doesn't require touching this file.

export const AutomationWorkflowStatusSchema = z.enum([
  'draft',
  'active',
  'paused',
  'archived',
  'error',
]);
export type AutomationWorkflowStatus = z.infer<
  typeof AutomationWorkflowStatusSchema
>;

export const AutomationWorkflowStatusFilterSchema = z.enum([
  'draft',
  'active',
  'paused',
  'archived',
  'error',
  'all',
]);
export type AutomationWorkflowStatusFilter = z.infer<
  typeof AutomationWorkflowStatusFilterSchema
>;

export const ListAutomationWorkflowsQuerySchema = z.object({
  status: AutomationWorkflowStatusFilterSchema.optional(),
  cursor: z.string().min(1).max(512).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});
export type ListAutomationWorkflowsQuery = z.infer<
  typeof ListAutomationWorkflowsQuerySchema
>;

export const AutomationWorkflowIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const CreateAutomationWorkflowBodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  triggerType: z.string().min(1).max(200),
});

export const UpdateAutomationWorkflowBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    triggerType: z.string().min(1).max(200).optional(),
    status: AutomationWorkflowStatusSchema.optional(),
    // Validated in the service via parseWorkflowJson.
    workflowJson: z.unknown().optional(),
  })
  .refine(
    (b) =>
      b.name !== undefined ||
      b.description !== undefined ||
      b.triggerType !== undefined ||
      b.status !== undefined ||
      b.workflowJson !== undefined,
    {
      message:
        'At least one of name, description, triggerType, status, workflowJson is required.',
    },
  );
