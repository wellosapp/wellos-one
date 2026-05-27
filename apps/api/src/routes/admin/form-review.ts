import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { resolveStaffMemberIdForUser } from '../../auth/calendarStaffScope.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  ReviewQueueQuerySchema,
  ReviewSubmissionBodySchema,
  ReviewSubmissionIdParamsSchema,
} from '../../schemas/formReview.js';
import {
  IntakeFormSubmissionNotFoundForReviewError,
  IntakeFormSubmissionNotReviewableError,
  getSubmissionForReview,
  listSubmissionsForReview,
  reviewSubmission,
} from '../../services/formReviewService.js';

// /admin/form-review/* — Forms System PR 9. Provider review queue + per-row
// approve / deny / flag / note. Read + write are both gated by requireRole.staff
// per the spec — finer-grained provider-only scoping is post-MVP.

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

export default async function formReviewRoutes(
  app: FastifyInstance,
): Promise<void> {
  // GET /admin/form-review/queue
  app.get(
    '/form-review/queue',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const query = ReviewQueueQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send(zodErrorBody(query.error));
      }

      const result = await listSubmissionsForReview(app.prisma, {
        tenantId,
        reviewStatus: query.data.reviewStatus,
        formType: query.data.formType,
        cursor: query.data.cursor,
        take: query.data.take,
      });
      return reply.send(result);
    },
  );

  // GET /admin/form-review/submissions/:id
  app.get(
    '/form-review/submissions/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ReviewSubmissionIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      try {
        const result = await getSubmissionForReview(app.prisma, {
          tenantId,
          submissionId: params.data.id,
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof IntakeFormSubmissionNotFoundForReviewError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: err.message,
            code: err.code,
          });
        }
        throw err;
      }
    },
  );

  // POST /admin/form-review/submissions/:id
  app.post(
    '/form-review/submissions/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ReviewSubmissionIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = ReviewSubmissionBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      // Resolve the actor's Staff row when one exists. Admin users without a
      // staff profile review with actorStaffId=null — the global audit_log
      // still attributes via actorUserId, so attribution survives the gap.
      const actorStaffId = await resolveStaffMemberIdForUser(
        app.prisma,
        tenantId,
        user.email,
      );

      try {
        const result = await reviewSubmission(app.prisma, {
          tenantId,
          actorUserId: user.id,
          actorStaffId,
          submissionId: params.data.id,
          decision: body.data.decision,
          notes: body.data.notes,
        });
        return reply.send({ submission: result.submission });
      } catch (err) {
        if (err instanceof IntakeFormSubmissionNotFoundForReviewError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: err.message,
            code: err.code,
          });
        }
        if (err instanceof IntakeFormSubmissionNotReviewableError) {
          return reply.code(409).send({
            error: 'Conflict',
            message: err.message,
            code: err.code,
            status: err.status,
          });
        }
        throw err;
      }
    },
  );
}
