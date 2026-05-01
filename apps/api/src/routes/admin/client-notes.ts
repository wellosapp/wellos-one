import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { ZodError } from 'zod';

import { withIdempotency } from '../../middleware/idempotency.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  AcknowledgeClientNoteBodySchema,
  ClientIdParamsSchema,
  ClientNoteIdParamsSchema,
  CreateClientNoteBodySchema,
  ListClientNotesQuerySchema,
  UpdateClientNoteBodySchema,
} from '../../schemas/clientNote.js';
import {
  InvalidClientNoteReferenceError,
  InvalidClientNoteStateError,
  acknowledgeClientNote,
  createClientNote,
  getClientNoteById,
  listClientNotes,
  setClientNoteArchived,
  setClientNotePinned,
  softDeleteClientNote,
  updateClientNote,
} from '../../services/clientNoteService.js';

// /admin/clients/:clientId/notes — admin/staff CRUD + lifecycle for the
// client memory feature (E3-S4a).
//
// Auth: most endpoints use requireRole.staff (admin/manager/staff). DELETE
// is admin-only.
//
// Validation: Zod parsing of body / query / params at the route layer. On
// validation failure, returns 400 with { error, message, issues }.
//
// Tenant scoping: every service call passes request.currentUser.tenantId.
// Cross-tenant access returns 404 (not 403) to avoid leaking existence.
//
// Idempotency: POST endpoints support the Idempotency-Key header via
// withIdempotency() — see middleware/idempotency.ts. Replays are ~free
// (single indexed lookup). PATCH is naturally idempotent (PATCH same fields
// twice ⇒ same result), so it doesn't wrap the helper. DELETE is idempotent
// at the data layer.

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

function invalidReferenceBody(err: InvalidClientNoteReferenceError) {
  return {
    error: 'Bad Request',
    message: 'Validation failed.',
    issues: [{ path: err.field, message: err.message }],
  };
}

function invalidStateBody(err: InvalidClientNoteStateError) {
  return {
    error: 'Unprocessable Entity',
    message: err.message,
    issues: [{ path: err.field, message: err.message }],
  };
}

const NOT_FOUND = {
  error: 'Not Found',
  message: 'Client note not found.',
};

function callerHasAdminRole(roles: string[]): boolean {
  return roles.includes('admin') || roles.includes('manager');
}

export default async function clientNotesRoutes(
  app: FastifyInstance,
): Promise<void> {
  // POST /admin/clients/:clientId/notes — create
  app.post(
    '/clients/:clientId/notes',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClientIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = CreateClientNoteBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      return withIdempotency(
        request,
        reply,
        { prisma: app.prisma, tenantId, scope: 'client_note.create' },
        async () => {
          try {
            const result = await createClientNote(app.prisma, {
              tenantId,
              actorUserId: user.id,
              callerHasAdminRole: callerHasAdminRole(user.roles),
              clientId: params.data.clientId,
              body: body.data,
            });
            return { status: 201, body: result };
          } catch (err) {
            if (err instanceof InvalidClientNoteReferenceError) {
              return { status: 400, body: invalidReferenceBody(err) };
            }
            if (err instanceof InvalidClientNoteStateError) {
              return { status: 422, body: invalidStateBody(err) };
            }
            throw err;
          }
        },
      );
    },
  );

  // GET /admin/clients/:clientId/notes — list with filters
  app.get(
    '/clients/:clientId/notes',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClientIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const query = ListClientNotesQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send(zodErrorBody(query.error));
      }

      const result = await listClientNotes(app.prisma, {
        tenantId,
        clientId: params.data.clientId,
        query: query.data,
      });
      return reply.send(result);
    },
  );

  // GET /admin/clients/:clientId/notes/:noteId — one
  app.get(
    '/clients/:clientId/notes/:noteId',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClientNoteIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const note = await getClientNoteById(app.prisma, {
        tenantId,
        clientId: params.data.clientId,
        noteId: params.data.noteId,
      });
      if (!note) {
        return reply.code(404).send(NOT_FOUND);
      }
      return reply.send({ note });
    },
  );

  // PATCH /admin/clients/:clientId/notes/:noteId — edit subset
  app.patch(
    '/clients/:clientId/notes/:noteId',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClientNoteIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = UpdateClientNoteBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await updateClientNote(app.prisma, {
          tenantId,
          actorUserId: user.id,
          callerHasAdminRole: callerHasAdminRole(user.roles),
          clientId: params.data.clientId,
          noteId: params.data.noteId,
          body: body.data,
        });
        if (!result) {
          return reply.code(404).send(NOT_FOUND);
        }
        return reply.send(result);
      } catch (err) {
        if (err instanceof InvalidClientNoteReferenceError) {
          return reply.code(400).send(invalidReferenceBody(err));
        }
        if (err instanceof InvalidClientNoteStateError) {
          return reply.code(422).send(invalidStateBody(err));
        }
        throw err;
      }
    },
  );

  // DELETE /admin/clients/:clientId/notes/:noteId — soft delete (admin-only)
  app.delete(
    '/clients/:clientId/notes/:noteId',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClientNoteIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const { deleted } = await softDeleteClientNote(app.prisma, {
        tenantId,
        actorUserId: user.id,
        clientId: params.data.clientId,
        noteId: params.data.noteId,
      });
      if (!deleted) {
        // Idempotent: 204 even if the note didn't exist or was already gone.
        // Avoids 404→204 retry loops on flaky networks. Distinct from
        // GET-by-id which DOES 404, since GET semantics differ from DELETE.
        return reply.code(204).send();
      }
      return reply.code(204).send();
    },
  );

  // Pin / unpin / archive / unarchive — share a small handler factory.
  const flagHandler = (
    flag: 'pinned' | 'archived',
    next: boolean,
    scope: string,
  ) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClientNoteIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      return withIdempotency(
        request,
        reply,
        { prisma: app.prisma, tenantId, scope },
        async () => {
          const result =
            flag === 'pinned'
              ? await setClientNotePinned(app.prisma, {
                  tenantId,
                  actorUserId: user.id,
                  clientId: params.data.clientId,
                  noteId: params.data.noteId,
                  pinned: next,
                })
              : await setClientNoteArchived(app.prisma, {
                  tenantId,
                  actorUserId: user.id,
                  clientId: params.data.clientId,
                  noteId: params.data.noteId,
                  archived: next,
                });
          if (!result) {
            return { status: 404, body: NOT_FOUND };
          }
          return { status: 200, body: result };
        },
      );
    };

  app.post(
    '/clients/:clientId/notes/:noteId/pin',
    { preHandler: requireRole.staff },
    flagHandler('pinned', true, 'client_note.pin'),
  );
  app.post(
    '/clients/:clientId/notes/:noteId/unpin',
    { preHandler: requireRole.staff },
    flagHandler('pinned', false, 'client_note.unpin'),
  );
  app.post(
    '/clients/:clientId/notes/:noteId/archive',
    { preHandler: requireRole.staff },
    flagHandler('archived', true, 'client_note.archive'),
  );
  app.post(
    '/clients/:clientId/notes/:noteId/unarchive',
    { preHandler: requireRole.staff },
    flagHandler('archived', false, 'client_note.unarchive'),
  );

  // POST /admin/clients/:clientId/notes/:noteId/acknowledge
  app.post(
    '/clients/:clientId/notes/:noteId/acknowledge',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ClientNoteIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = AcknowledgeClientNoteBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      return withIdempotency(
        request,
        reply,
        { prisma: app.prisma, tenantId, scope: 'client_note.acknowledge' },
        async () => {
          try {
            const result = await acknowledgeClientNote(app.prisma, {
              tenantId,
              actorUserId: user.id,
              clientId: params.data.clientId,
              noteId: params.data.noteId,
              body: body.data,
            });
            if (!result) {
              return { status: 404, body: NOT_FOUND };
            }
            return { status: 201, body: result };
          } catch (err) {
            if (err instanceof InvalidClientNoteReferenceError) {
              return { status: 400, body: invalidReferenceBody(err) };
            }
            throw err;
          }
        },
      );
    },
  );
}
