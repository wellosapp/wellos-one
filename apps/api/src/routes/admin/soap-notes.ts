import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { withIdempotency } from '../../middleware/idempotency.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  AppointmentIdParamsSchema,
  CreateSoapNoteBodySchema,
  LockSoapNoteBodySchema,
  ReviseSoapNoteBodySchema,
  SoapNoteIdParamsSchema,
  UpdateSoapNoteBodySchema,
} from '../../schemas/soapNotes.js';
import {
  InvalidSoapNoteReferenceError,
  InvalidSoapNoteStateError,
  createSoapNote,
  getSoapNoteById,
  listSoapNoteRevisions,
  listSoapNotesForAppointment,
  lockSoapNote,
  reviseSoapNote,
  softDeleteSoapNote,
  updateSoapNote,
} from '../../services/soapNotesService.js';

// /admin/appointments/:appointmentId/soap-notes — SOAP note CRUD +
// lock/revise lifecycle (E3-S4f).
//
// Auth: requireRole.staff. SOAP authoring is provider work, not admin
// configuration. Admin can still touch these (admin role passes the
// staff guard), and DELETE is admin-only as a guardrail since SOAP
// deletion is rare and audit-sensitive.

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

function refErrorBody(err: InvalidSoapNoteReferenceError) {
  return {
    error: 'Bad Request',
    message: 'Validation failed.',
    issues: [{ path: err.field, message: err.message }],
  };
}

function stateErrorBody(err: InvalidSoapNoteStateError) {
  return {
    error: 'Conflict',
    message: err.message,
    issues: [{ path: err.field, message: err.message }],
  };
}

const NOT_FOUND = {
  error: 'Not Found',
  message: 'SOAP note not found.',
};
const APPT_NOT_FOUND = {
  error: 'Not Found',
  message: 'Appointment not found.',
};

export default async function soapNotesRoutes(
  app: FastifyInstance,
): Promise<void> {
  // POST — create
  app.post(
    '/appointments/:appointmentId/soap-notes',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = AppointmentIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));
      const body = CreateSoapNoteBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(zodErrorBody(body.error));

      return withIdempotency(
        request,
        reply,
        { prisma: app.prisma, tenantId, scope: 'soap_note.create' },
        async () => {
          try {
            const result = await createSoapNote(app.prisma, {
              tenantId,
              actorUserId: user.id,
              appointmentId: params.data.appointmentId,
              body: body.data,
            });
            return { status: 201, body: result };
          } catch (err) {
            if (err instanceof InvalidSoapNoteReferenceError) {
              return { status: 400, body: refErrorBody(err) };
            }
            throw err;
          }
        },
      );
    },
  );

  // GET — list per appointment
  app.get(
    '/appointments/:appointmentId/soap-notes',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = AppointmentIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));

      const result = await listSoapNotesForAppointment(app.prisma, {
        tenantId,
        appointmentId: params.data.appointmentId,
      });
      if (!result) return reply.code(404).send(APPT_NOT_FOUND);
      return reply.send(result);
    },
  );

  // GET — one
  app.get(
    '/appointments/:appointmentId/soap-notes/:noteId',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = SoapNoteIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));

      const note = await getSoapNoteById(app.prisma, {
        tenantId,
        appointmentId: params.data.appointmentId,
        noteId: params.data.noteId,
      });
      if (!note) return reply.code(404).send(NOT_FOUND);
      return reply.send({ note });
    },
  );

  // GET — revisions list
  app.get(
    '/appointments/:appointmentId/soap-notes/:noteId/revisions',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = SoapNoteIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));

      const result = await listSoapNoteRevisions(app.prisma, {
        tenantId,
        noteId: params.data.noteId,
      });
      if (!result) return reply.code(404).send(NOT_FOUND);
      return reply.send(result);
    },
  );

  // PATCH — in-place edit (only when unlocked)
  app.patch(
    '/appointments/:appointmentId/soap-notes/:noteId',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = SoapNoteIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));
      const body = UpdateSoapNoteBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(zodErrorBody(body.error));

      try {
        const result = await updateSoapNote(app.prisma, {
          tenantId,
          actorUserId: user.id,
          appointmentId: params.data.appointmentId,
          noteId: params.data.noteId,
          body: body.data,
        });
        if (!result) return reply.code(404).send(NOT_FOUND);
        return reply.send(result);
      } catch (err) {
        if (err instanceof InvalidSoapNoteStateError) {
          return reply.code(409).send(stateErrorBody(err));
        }
        throw err;
      }
    },
  );

  // POST /lock
  app.post(
    '/appointments/:appointmentId/soap-notes/:noteId/lock',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = SoapNoteIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));
      const body = LockSoapNoteBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(zodErrorBody(body.error));

      return withIdempotency(
        request,
        reply,
        { prisma: app.prisma, tenantId, scope: 'soap_note.lock' },
        async () => {
          try {
            const result = await lockSoapNote(app.prisma, {
              tenantId,
              actorUserId: user.id,
              appointmentId: params.data.appointmentId,
              noteId: params.data.noteId,
              body: body.data,
            });
            if (!result) return { status: 404, body: NOT_FOUND };
            return { status: 200, body: result };
          } catch (err) {
            if (err instanceof InvalidSoapNoteReferenceError) {
              return { status: 400, body: refErrorBody(err) };
            }
            throw err;
          }
        },
      );
    },
  );

  // POST /revise
  app.post(
    '/appointments/:appointmentId/soap-notes/:noteId/revise',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = SoapNoteIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));
      const body = ReviseSoapNoteBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(zodErrorBody(body.error));

      return withIdempotency(
        request,
        reply,
        { prisma: app.prisma, tenantId, scope: 'soap_note.revise' },
        async () => {
          try {
            const result = await reviseSoapNote(app.prisma, {
              tenantId,
              actorUserId: user.id,
              appointmentId: params.data.appointmentId,
              noteId: params.data.noteId,
              body: body.data,
            });
            if (!result) return { status: 404, body: NOT_FOUND };
            return { status: 201, body: result };
          } catch (err) {
            if (err instanceof InvalidSoapNoteStateError) {
              return { status: 409, body: stateErrorBody(err) };
            }
            if (err instanceof InvalidSoapNoteReferenceError) {
              return { status: 400, body: refErrorBody(err) };
            }
            throw err;
          }
        },
      );
    },
  );

  // DELETE — soft (admin-only, audit-sensitive)
  app.delete(
    '/appointments/:appointmentId/soap-notes/:noteId',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = SoapNoteIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send(zodErrorBody(params.error));

      await softDeleteSoapNote(app.prisma, {
        tenantId,
        actorUserId: user.id,
        appointmentId: params.data.appointmentId,
        noteId: params.data.noteId,
      });
      return reply.code(204).send();
    },
  );
}
