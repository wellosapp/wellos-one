import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { withIdempotency } from '../../middleware/idempotency.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  CreateIntakeFormDefinitionBodySchema,
  CreateIntakeFormSubmissionBodySchema,
  IntakeFormDefinitionIdParamsSchema,
  IntakeSubmissionIdParamsSchema,
  ListIntakeFormDefinitionsQuerySchema,
  PatchIntakeFormSubmissionBodySchema,
  UpdateIntakeFormDefinitionBodySchema,
} from '../../schemas/intakeForm.js';
import { ClientIdParamsSchema } from '../../schemas/clientNote.js';
import {
  IntakeFormNotFoundError,
  IntakeFormReferenceError,
  IntakeFormStateError,
  createIntakeFormDefinition,
  createIntakeFormSubmission,
  getIntakeFormDefinitionById,
  listIntakeFormDefinitions,
  listIntakeSubmissionsForClient,
  patchIntakeFormSubmission,
  publishIntakeFormDefinition,
  updateIntakeFormDefinition,
} from '../../services/intakeFormService.js';

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

export default async function intakeFormsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/intake-forms/definitions',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const parsed = ListIntakeFormDefinitionsQuerySchema.safeParse(
        request.query,
      );
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }

      const result = await listIntakeFormDefinitions(app.prisma, {
        tenantId,
        query: parsed.data,
      });
      return reply.send(result);
    },
  );

  app.get(
    '/intake-forms/definitions/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = IntakeFormDefinitionIdParamsSchema.safeParse(
        request.params,
      );
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const definition = await getIntakeFormDefinitionById(app.prisma, {
        tenantId,
        id: params.data.id,
      });
      if (!definition) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Intake form definition not found.',
        });
      }
      return reply.send({ definition });
    },
  );

  app.post(
    '/intake-forms/definitions',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const body = CreateIntakeFormDefinitionBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      return withIdempotency(
        request,
        reply,
        { prisma: app.prisma, tenantId, scope: 'intake_form.definition.create' },
        async () => {
          try {
            const result = await createIntakeFormDefinition(app.prisma, {
              tenantId,
              title: body.data.title,
              schema: body.data.schema,
              groupId: body.data.groupId,
            });
            return { status: 201, body: result };
          } catch (err) {
            if (err instanceof IntakeFormReferenceError) {
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
    '/intake-forms/definitions/:id',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = IntakeFormDefinitionIdParamsSchema.safeParse(
        request.params,
      );
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = UpdateIntakeFormDefinitionBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await updateIntakeFormDefinition(app.prisma, {
          tenantId,
          id: params.data.id,
          ...body.data,
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof IntakeFormNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: err.message,
          });
        }
        if (err instanceof IntakeFormStateError) {
          return reply.code(422).send({
            error: 'Unprocessable Entity',
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  app.post(
    '/intake-forms/definitions/:id/publish',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = IntakeFormDefinitionIdParamsSchema.safeParse(
        request.params,
      );
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      return withIdempotency(
        request,
        reply,
        { prisma: app.prisma, tenantId, scope: 'intake_form.definition.publish' },
        async () => {
          try {
            const result = await publishIntakeFormDefinition(app.prisma, {
              tenantId,
              id: params.data.id,
            });
            return { status: 200, body: result };
          } catch (err) {
            if (err instanceof IntakeFormNotFoundError) {
              return {
                status: 404,
                body: { error: 'Not Found', message: err.message },
              };
            }
            if (err instanceof IntakeFormStateError) {
              return {
                status: 422,
                body: { error: 'Unprocessable Entity', message: err.message },
              };
            }
            throw err;
          }
        },
      );
    },
  );

  app.get(
    '/clients/:clientId/intake-submissions',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClientIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const result = await listIntakeSubmissionsForClient(app.prisma, {
        tenantId,
        clientId: params.data.clientId,
      });
      return reply.send(result);
    },
  );

  app.post(
    '/clients/:clientId/intake-submissions',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClientIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = CreateIntakeFormSubmissionBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      return withIdempotency(
        request,
        reply,
        { prisma: app.prisma, tenantId, scope: 'intake_form.submission.create' },
        async () => {
          try {
            const result = await createIntakeFormSubmission(app.prisma, {
              tenantId,
              clientId: params.data.clientId,
              definitionId: body.data.definitionId,
              appointmentId: body.data.appointmentId,
              answers: body.data.answers,
            });
            return { status: 201, body: result };
          } catch (err) {
            if (err instanceof IntakeFormReferenceError) {
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
    '/clients/:clientId/intake-submissions/:submissionId',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = IntakeSubmissionIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = PatchIntakeFormSubmissionBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await patchIntakeFormSubmission(app.prisma, {
          tenantId,
          clientId: params.data.clientId,
          submissionId: params.data.submissionId,
          answers: body.data.answers,
          status: body.data.status,
          ip: forwardedIp(request),
          userAgent: readUserAgent(request),
        });
        return reply.send(result);
      } catch (err) {
        if (err instanceof IntakeFormNotFoundError) {
          return reply.code(404).send({
            error: 'Not Found',
            message: err.message,
          });
        }
        if (err instanceof IntakeFormStateError) {
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
