import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireRole } from '../../middleware/requireRole.js';
import {
  getFormTemplate,
  listFormTemplates,
} from '../../services/formTemplateService.js';

// Read-only admin surface for the global FormTemplate library. Templates are
// system-owned (no tenant scoping) — the catalog is identical for every
// tenant. Writes happen only via the prisma seed (prisma/seeds/form-templates).
// Cloning a template into a tenant lives at POST /admin/intake-forms/clone-from-template
// (see intake-forms.ts).

const ListFormTemplatesQuerySchema = z.object({
  formType: z.string().min(1).max(64).optional(),
  category: z.string().min(1).max(64).optional(),
});

const FormTemplateIdParamsSchema = z.object({
  id: z.string().min(1),
});

function zodErrorBody(err: z.ZodError) {
  return {
    error: 'Bad Request',
    message: 'Validation failed.',
    issues: err.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  };
}

export default async function formTemplatesRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/form-templates',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const parsed = ListFormTemplatesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send(zodErrorBody(parsed.error));
      }
      const result = await listFormTemplates(app.prisma, parsed.data);
      return reply.send(result);
    },
  );

  app.get(
    '/form-templates/:id',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const params = FormTemplateIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const { template } = await getFormTemplate(app.prisma, {
        id: params.data.id,
      });
      if (!template) {
        return reply.code(404).send({
          error: 'Not Found',
          message: 'Form template not found.',
        });
      }
      return reply.send({ template });
    },
  );
}
