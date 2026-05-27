import { z } from 'zod';

// Zod schemas for the PR 9 provider review queue endpoints.

export const ReviewQueueQuerySchema = z.object({
  reviewStatus: z
    .enum(['unreviewed', 'reviewed', 'requires_follow_up', 'approved', 'denied', 'all'])
    .optional(),
  formType: z.string().min(1).max(64).optional(),
  cursor: z.string().min(1).max(512).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
});
export type ReviewQueueQuery = z.infer<typeof ReviewQueueQuerySchema>;

export const ReviewSubmissionIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const ReviewSubmissionBodySchema = z.object({
  decision: z.enum(['reviewed', 'requires_follow_up', 'approved', 'denied']),
  notes: z.string().max(2000).optional(),
});
export type ReviewSubmissionBody = z.infer<typeof ReviewSubmissionBodySchema>;
