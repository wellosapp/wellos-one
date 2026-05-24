import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { withIdempotency } from '../../middleware/idempotency.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  CreateStaffOnboardingSubmissionBodySchema,
  ListStaffOnboardingFormDefinitionsQuerySchema,
  PatchStaffOnboardingSubmissionBodySchema,
  StaffIdParamsSchema,
  StaffOnboardingFormDefinitionIdParamsSchema,
  StaffOnboardingSubmissionIdParamsSchema,
} from '../../schemas/staffOnboardingForm.js';
import {
  StaffOnboardingFormNotFoundError,
  StaffOnboardingFormReferenceError,
  StaffOnboardingFormStateError,
  createStaffOnboardingSubmission,
  getStaffOnboardingFormDefinition,
  getStaffOnboardingSubmission,
  listStaffOnboardingFormDefinitions,
  listStaffOnboardingSubmissions,
  patchStaffOnboardingSubmission,
} from '../../services/staffOnboardingFormService.js';

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

function forwardedIp(request: FastifyRequest): string | null {
  const xf = request.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) {
    return xf.split(',')[0]?.trim() ?? null;
  }
  return request.ip ?? null;
}

function readUserAgent(request: FastifyRequest): string | null {
  const raw = request.headers['user-agent'];
  if (typeof raw !== 'string' || raw.length === 0) return null;
  return raw.slice(0, 2048);
}

export default async function staffOnboardingFormsRoutes(
  app: FastifyInstance,
): Promise<void> {
  // ---- Definitions ----------------------------------------------------------

  app.get(
    '/staff-onboarding-forms',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListStaffOnboardingFormDefinitionsQuerySchema.safeParse(
        request.query,
      );
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const result = await listStaffOnboardingFormDefinitions(app.prisma, {
        tenantId,
        query: parsed.data,
      });
      return reply.send(result);
    },
  );

  app.get(
    '/staff-onboarding-forms/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = StaffOnboardingFormDefinitionIdParamsSchema.safeParse(
        request.params,
      );
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const definition = await getStaffOnboardingFormDefinition(app.prisma, {
        tenantId,
        id: params.data.id,
      });
      if (!definition) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Staff onboarding form definition not found.',
        });
      }
      return reply.send({ definition });
    },
  );

  // ---- Submissions ----------------------------------------------------------

  app.get(
    '/staff/:staffId/onboarding-submissions',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = StaffIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const result = await listStaffOnboardingSubmissions(app.prisma, {
        tenantId,
        staffId: params.data.staffId,
      });
      return reply.send(result);
    },
  );

  app.get(
    '/staff/:staffId/onboarding-submissions/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = StaffOnboardingSubmissionIdParamsSchema.safeParse(
        request.params,
      );
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const result = await getStaffOnboardingSubmission(app.prisma, {
        tenantId,
        staffId: params.data.staffId,
        id: params.data.id,
      });
      if (!result) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Staff onboarding form submission not found.',
        });
      }
      return reply.send(result);
    },
  );

  app.post(
    '/staff/:staffId/onboarding-submissions',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = StaffIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = CreateStaffOnboardingSubmissionBodySchema.safeParse(
        request.body,
      );
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      return withIdempotency(
        request,
        reply,
        {
          prisma: app.prisma,
          tenantId,
          scope: 'staff_onboarding_form.submission.create',
        },
        async () => {
          try {
            const result = await createStaffOnboardingSubmission(app.prisma, {
              tenantId,
              staffId: params.data.staffId,
              definitionId: body.data.definitionId,
              answers: body.data.answers,
              ip: forwardedIp(request),
              userAgent: readUserAgent(request),
            });
            return { status: 201, body: result };
          } catch (err) {
            if (err instanceof StaffOnboardingFormReferenceError) {
              return {
                status: 400,
                body: {
                  error: 'Bad Request',
                  message: 'Validation failed.',
                  issues: [{ path: err.field, message: err.message }],
                },
              };
            }
            throw err;
          }
        },
      );
    },
  );

  app.patch(
    '/staff/:staffId/onboarding-submissions/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = StaffOnboardingSubmissionIdParamsSchema.safeParse(
        request.params,
      );
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = PatchStaffOnboardingSubmissionBodySchema.safeParse(
        request.body,
      );
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await patchStaffOnboardingSubmission(app.prisma, {
          tenantId,
          staffId: params.data.staffId,
          id: params.data.id,
          answers: body.data.answers,
          status: body.data.status,
          ip: forwardedIp(request),
          userAgent: readUserAgent(request),
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof StaffOnboardingFormNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: err.message,
          });
        }
        if (err instanceof StaffOnboardingFormStateError) {
          return reply.code(422).send({
            error: 'Unprocessable Entity',
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
