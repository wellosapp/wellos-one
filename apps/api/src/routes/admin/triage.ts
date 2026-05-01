import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { withIdempotency } from '../../middleware/idempotency.js';
import { requireRole } from '../../middleware/requireRole.js';
import {
  AppointmentIdParamsSchema,
  BookingAnswerIdParamsSchema,
  CreateBookingQuestionBodySchema,
  PromoteAnswerToNoteBodySchema,
  QuestionIdParamsSchema,
  ServiceIdParamsSchema,
  UpdateBookingQuestionBodySchema,
} from '../../schemas/triage.js';
import {
  InvalidTriageReferenceError,
  InvalidTriageStateError,
  createBookingQuestion,
  getBookingQuestionById,
  listBookingAnswersForAppointment,
  listBookingQuestions,
  promoteAnswerToNote,
  softDeleteBookingQuestion,
  updateBookingQuestion,
} from '../../services/triageService.js';

// /admin/services/:serviceId/booking-questions — admin CRUD on triage
// templates (E3-S4d).
//
// /admin/appointments/:id/booking-answers — read-only list of triage
// answers captured during public booking.
//
// /admin/appointments/:id/booking-answers/:answerId/promote-to-note —
// promotes a single answer into a permanent ClientNote.
//
// Auth: requireRole.admin for question CRUD (configuration). Answers are
// readable by requireRole.staff (visible during the visit briefing).
// Promote-to-note uses requireRole.staff so providers can promote in the
// moment without needing admin access.

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

function invalidReferenceBody(err: InvalidTriageReferenceError) {
  return {
    error: 'Bad Request',
    message: 'Validation failed.',
    issues: [{ path: err.field, message: err.message }],
  };
}

function invalidStateBody(err: InvalidTriageStateError) {
  return {
    error: 'Unprocessable Entity',
    message: err.message,
    issues: [{ path: err.field, message: err.message }],
  };
}

const QUESTION_NOT_FOUND = {
  error: 'Not Found',
  message: 'Booking question not found.',
};
const APPT_NOT_FOUND = {
  error: 'Not Found',
  message: 'Appointment not found.',
};
const ANSWER_NOT_FOUND = {
  error: 'Not Found',
  message: 'Booking answer not found.',
};

export default async function triageRoutes(
  app: FastifyInstance,
): Promise<void> {
  // ===== ServiceBookingQuestion CRUD =====

  // POST /admin/services/:serviceId/booking-questions
  app.post(
    '/services/:serviceId/booking-questions',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ServiceIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = CreateBookingQuestionBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      return withIdempotency(
        request,
        reply,
        {
          prisma: app.prisma,
          tenantId,
          scope: 'service_booking_question.create',
        },
        async () => {
          try {
            const result = await createBookingQuestion(app.prisma, {
              tenantId,
              actorUserId: user.id,
              serviceId: params.data.serviceId,
              body: body.data,
            });
            return { status: 201, body: result };
          } catch (err) {
            if (err instanceof InvalidTriageReferenceError) {
              return { status: 400, body: invalidReferenceBody(err) };
            }
            if (err instanceof InvalidTriageStateError) {
              return { status: 422, body: invalidStateBody(err) };
            }
            throw err;
          }
        },
      );
    },
  );

  // GET /admin/services/:serviceId/booking-questions
  app.get(
    '/services/:serviceId/booking-questions',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = ServiceIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const result = await listBookingQuestions(app.prisma, {
        tenantId,
        serviceId: params.data.serviceId,
      });
      return reply.send(result);
    },
  );

  // GET /admin/services/:serviceId/booking-questions/:questionId
  app.get(
    '/services/:serviceId/booking-questions/:questionId',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = QuestionIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const question = await getBookingQuestionById(app.prisma, {
        tenantId,
        serviceId: params.data.serviceId,
        questionId: params.data.questionId,
      });
      if (!question) return reply.code(404).send(QUESTION_NOT_FOUND);
      return reply.send({ question });
    },
  );

  // PATCH /admin/services/:serviceId/booking-questions/:questionId
  app.patch(
    '/services/:serviceId/booking-questions/:questionId',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = QuestionIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = UpdateBookingQuestionBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      try {
        const result = await updateBookingQuestion(app.prisma, {
          tenantId,
          actorUserId: user.id,
          serviceId: params.data.serviceId,
          questionId: params.data.questionId,
          body: body.data,
        });
        if (!result) return reply.code(404).send(QUESTION_NOT_FOUND);
        return reply.send(result);
      } catch (err) {
        if (err instanceof InvalidTriageStateError) {
          return reply.code(422).send(invalidStateBody(err));
        }
        throw err;
      }
    },
  );

  // DELETE /admin/services/:serviceId/booking-questions/:questionId
  app.delete(
    '/services/:serviceId/booking-questions/:questionId',
    { preHandler: requireRole.admin },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = QuestionIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      await softDeleteBookingQuestion(app.prisma, {
        tenantId,
        actorUserId: user.id,
        serviceId: params.data.serviceId,
        questionId: params.data.questionId,
      });
      return reply.code(204).send();
    },
  );

  // ===== AppointmentBookingAnswer (read-only + promote) =====

  // GET /admin/appointments/:appointmentId/booking-answers
  app.get(
    '/appointments/:appointmentId/booking-answers',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = AppointmentIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }

      const result = await listBookingAnswersForAppointment(app.prisma, {
        tenantId,
        appointmentId: params.data.appointmentId,
      });
      if (!result) return reply.code(404).send(APPT_NOT_FOUND);
      return reply.send(result);
    },
  );

  // POST /admin/appointments/:appointmentId/booking-answers/:answerId/promote-to-note
  app.post(
    '/appointments/:appointmentId/booking-answers/:answerId/promote-to-note',
    { preHandler: requireRole.staff },
    async (request, reply) => {
      const user = request.currentUser!;
      const tenantId = user.tenantId!;

      const params = BookingAnswerIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send(zodErrorBody(params.error));
      }
      const body = PromoteAnswerToNoteBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send(zodErrorBody(body.error));
      }

      return withIdempotency(
        request,
        reply,
        {
          prisma: app.prisma,
          tenantId,
          scope: 'booking_answer.promote_to_note',
        },
        async () => {
          try {
            const result = await promoteAnswerToNote(app.prisma, {
              tenantId,
              actorUserId: user.id,
              appointmentId: params.data.appointmentId,
              answerId: params.data.answerId,
              body: body.data,
            });
            if (!result) return { status: 404, body: ANSWER_NOT_FOUND };
            return { status: 201, body: result };
          } catch (err) {
            if (err instanceof InvalidTriageReferenceError) {
              return { status: 400, body: invalidReferenceBody(err) };
            }
            throw err;
          }
        },
      );
    },
  );
}
