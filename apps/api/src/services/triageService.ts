import { Prisma } from '@prisma/client';
import type {
  AppointmentBookingAnswer,
  ClientNote,
  ServiceBookingQuestion,
} from '@prisma/client';

import type {
  ExtendedPrismaClient,
  ExtendedTransactionClient,
} from '../db/client.js';
import type {
  CreateBookingQuestionBody,
  PromoteAnswerToNoteBody,
  UpdateBookingQuestionBody,
} from '../schemas/triage.js';
import { validateOptions } from '../schemas/triage.js';

// Domain layer for triage questions + answers + promote-to-note (E3-S4d).
//
// ServiceBookingQuestion is per-service triage template. CRUD at the
// admin surface; ingestion (creating answers) happens at public booking
// time and is out of scope for S4d.
//
// AppointmentBookingAnswer is read-only on the admin surface — admin
// can list answers per appointment and promote one to a permanent note.
//
// Tenant scoping: every query passes tenantId. Soft-delete on
// ServiceBookingQuestion is auto-filtered on reads via the Prisma
// extension; AppointmentBookingAnswer is append-only (no deletedAt).
//
// Audit log: question CRUD + promote-to-note all write rows. Action
// names: service_booking_question.created/updated/deleted,
// client_note.promoted_from_answer (covers the implicit ClientNote
// create + the answer→note linkage in one row).

const QUESTION_FIELDS = {
  id: true,
  tenantId: true,
  serviceId: true,
  questionKey: true,
  questionLabel: true,
  helperText: true,
  questionType: true,
  options: true,
  isRequired: true,
  isGating: true,
  gatingRule: true,
  displayOrder: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.ServiceBookingQuestionSelect;

const ANSWER_FIELDS = {
  id: true,
  tenantId: true,
  appointmentId: true,
  questionId: true,
  questionKeySnapshot: true,
  questionLabelSnapshot: true,
  questionTypeSnapshot: true,
  answerValue: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AppointmentBookingAnswerSelect;

export class InvalidTriageReferenceError extends Error {
  code = 'INVALID_TRIAGE_REFERENCE' as const;
  field: 'serviceId' | 'appointmentId' | 'answerId' | 'questionKey';
  constructor(
    field: 'serviceId' | 'appointmentId' | 'answerId' | 'questionKey',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidTriageReferenceError';
    this.field = field;
  }
}

export class InvalidTriageStateError extends Error {
  code = 'INVALID_TRIAGE_STATE' as const;
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'InvalidTriageStateError';
    this.field = field;
  }
}

async function ensureServiceForTenant(
  tx: ExtendedTransactionClient,
  args: { tenantId: string; serviceId: string },
): Promise<void> {
  const svc = await tx.service.findFirst({
    where: { id: args.serviceId, tenantId: args.tenantId },
    select: { id: true },
  });
  if (!svc) {
    throw new InvalidTriageReferenceError(
      'serviceId',
      'Unknown service for this tenant.',
    );
  }
}

async function writeAudit(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    actorUserId: string;
    action:
      | 'service_booking_question.created'
      | 'service_booking_question.updated'
      | 'service_booking_question.deleted'
      | 'client_note.promoted_from_answer';
    entityType: 'service_booking_question' | 'client_note';
    entityId: string;
    before:
      | ServiceBookingQuestion
      | AppointmentBookingAnswer
      | ClientNote
      | null;
    after:
      | ServiceBookingQuestion
      | AppointmentBookingAnswer
      | ClientNote
      | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: args.tenantId,
      actorUserId: args.actorUserId,
      actorType: 'user',
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      before: args.before
        ? (args.before as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      after: args.after
        ? (args.after as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
}

// ---------- ServiceBookingQuestion CRUD ----------

export async function createBookingQuestion(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    serviceId: string;
    body: CreateBookingQuestionBody;
  },
): Promise<{ question: ServiceBookingQuestion }> {
  const { tenantId, actorUserId, serviceId, body } = args;

  const opts = validateOptions(body.questionType, body.options);
  if (!opts.ok) {
    throw new InvalidTriageStateError(opts.field, opts.message);
  }
  if (body.isGating && !body.gatingRule) {
    throw new InvalidTriageStateError(
      'gatingRule',
      'gatingRule is required when isGating is true.',
    );
  }

  return prisma.$transaction(async (tx) => {
    await ensureServiceForTenant(tx, { tenantId, serviceId });

    let question: ServiceBookingQuestion;
    try {
      question = await tx.serviceBookingQuestion.create({
        data: {
          tenantId,
          serviceId,
          questionKey: body.questionKey,
          questionLabel: body.questionLabel,
          helperText: body.helperText ?? null,
          questionType: body.questionType,
          options: opts.value as Prisma.InputJsonValue,
          isRequired: body.isRequired ?? false,
          isGating: body.isGating ?? false,
          gatingRule: body.gatingRule
            ? (body.gatingRule as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          displayOrder: body.displayOrder ?? 0,
        },
        select: QUESTION_FIELDS,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new InvalidTriageReferenceError(
          'questionKey',
          'A question with this key already exists for this service.',
        );
      }
      throw err;
    }

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'service_booking_question.created',
      entityType: 'service_booking_question',
      entityId: question.id,
      before: null,
      after: question,
    });

    return { question };
  });
}

export async function listBookingQuestions(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; serviceId: string },
): Promise<{ questions: ServiceBookingQuestion[] }> {
  const { tenantId, serviceId } = args;
  const questions = await prisma.serviceBookingQuestion.findMany({
    where: { tenantId, serviceId },
    select: QUESTION_FIELDS,
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return { questions };
}

export async function getBookingQuestionById(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; serviceId: string; questionId: string },
): Promise<ServiceBookingQuestion | null> {
  return prisma.serviceBookingQuestion.findFirst({
    where: {
      tenantId: args.tenantId,
      serviceId: args.serviceId,
      id: args.questionId,
    },
    select: QUESTION_FIELDS,
  });
}

export async function updateBookingQuestion(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    serviceId: string;
    questionId: string;
    body: UpdateBookingQuestionBody;
  },
): Promise<{ question: ServiceBookingQuestion } | null> {
  const { tenantId, actorUserId, serviceId, questionId, body } = args;

  const hasChanges = Object.keys(body).length > 0;

  return prisma.$transaction(async (tx) => {
    const before = await tx.serviceBookingQuestion.findFirst({
      where: { tenantId, serviceId, id: questionId },
      select: QUESTION_FIELDS,
    });
    if (!before) return null;

    if (!hasChanges) return { question: before };

    // Re-validate options whenever questionType OR options changes.
    const nextType = body.questionType ?? before.questionType;
    const nextOpts = body.options !== undefined ? body.options : before.options;
    if (body.questionType !== undefined || body.options !== undefined) {
      const opts = validateOptions(nextType, nextOpts);
      if (!opts.ok) {
        throw new InvalidTriageStateError(opts.field, opts.message);
      }
    }

    const data: Prisma.ServiceBookingQuestionUpdateInput = {};
    if (body.questionLabel !== undefined) data.questionLabel = body.questionLabel;
    if (body.helperText !== undefined) data.helperText = body.helperText ?? null;
    if (body.questionType !== undefined) data.questionType = body.questionType;
    if (body.options !== undefined)
      data.options = body.options as Prisma.InputJsonValue;
    if (body.isRequired !== undefined) data.isRequired = body.isRequired;
    if (body.isGating !== undefined) data.isGating = body.isGating;
    if (body.gatingRule !== undefined)
      data.gatingRule =
        body.gatingRule === null
          ? Prisma.JsonNull
          : (body.gatingRule as unknown as Prisma.InputJsonValue);
    if (body.displayOrder !== undefined) data.displayOrder = body.displayOrder;

    const after = await tx.serviceBookingQuestion.update({
      where: { id: questionId },
      data,
      select: QUESTION_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'service_booking_question.updated',
      entityType: 'service_booking_question',
      entityId: questionId,
      before,
      after,
    });

    return { question: after };
  });
}

export async function softDeleteBookingQuestion(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    serviceId: string;
    questionId: string;
  },
): Promise<{ deleted: boolean }> {
  const { tenantId, actorUserId, serviceId, questionId } = args;
  return prisma.$transaction(async (tx) => {
    const before = await tx.serviceBookingQuestion.findFirst({
      where: { tenantId, serviceId, id: questionId },
      select: QUESTION_FIELDS,
    });
    if (!before) return { deleted: false };

    const after = await tx.serviceBookingQuestion.update({
      where: { id: questionId },
      data: { deletedAt: new Date() },
      select: QUESTION_FIELDS,
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'service_booking_question.deleted',
      entityType: 'service_booking_question',
      entityId: questionId,
      before,
      after,
    });

    return { deleted: true };
  });
}

// ---------- AppointmentBookingAnswer (read-only) ----------

export async function listBookingAnswersForAppointment(
  prisma: ExtendedPrismaClient,
  args: { tenantId: string; appointmentId: string },
): Promise<{ answers: AppointmentBookingAnswer[] } | null> {
  const { tenantId, appointmentId } = args;

  // Verify the appointment exists in this tenant — keeps "answers for
  // appointment in another tenant" from leaking via empty list (caller
  // can distinguish "no answers" from "appointment not found").
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: { id: true },
  });
  if (!appt) return null;

  const answers = await prisma.appointmentBookingAnswer.findMany({
    where: { tenantId, appointmentId },
    select: ANSWER_FIELDS,
    orderBy: { createdAt: 'asc' },
  });
  return { answers };
}

// ---------- promote-to-note ----------

function renderAnswerForNote(answer: AppointmentBookingAnswer): string {
  const { questionLabelSnapshot, answerValue } = answer;
  // answer_value is JSONB. Render based on shape:
  //   string       → as-is
  //   number       → str
  //   array        → comma-joined
  //   { urls }     → "(N reference photo(s))"
  //   other object → JSON.stringify
  let rendered: string;
  if (answerValue === null || answerValue === undefined) {
    rendered = '(no answer)';
  } else if (typeof answerValue === 'string') {
    rendered = answerValue;
  } else if (typeof answerValue === 'number' || typeof answerValue === 'boolean') {
    rendered = String(answerValue);
  } else if (Array.isArray(answerValue)) {
    rendered = answerValue.map((v) => String(v)).join(', ');
  } else if (
    typeof answerValue === 'object' &&
    Array.isArray((answerValue as { urls?: unknown }).urls)
  ) {
    const urls = (answerValue as { urls: unknown[] }).urls;
    rendered = `(${urls.length} reference photo${urls.length === 1 ? '' : 's'})`;
  } else {
    rendered = JSON.stringify(answerValue);
  }
  return `${questionLabelSnapshot}: ${rendered}`;
}

export async function promoteAnswerToNote(
  prisma: ExtendedPrismaClient,
  args: {
    tenantId: string;
    actorUserId: string;
    appointmentId: string;
    answerId: string;
    body: PromoteAnswerToNoteBody;
  },
): Promise<{ note: ClientNote } | null> {
  const { tenantId, actorUserId, appointmentId, answerId, body } = args;

  return prisma.$transaction(async (tx) => {
    // Verify the answer exists in this tenant + this appointment.
    const answer = await tx.appointmentBookingAnswer.findFirst({
      where: { id: answerId, tenantId, appointmentId },
      select: ANSWER_FIELDS,
    });
    if (!answer) return null;

    // Resolve appointment → clientId + serviceId for the note's links.
    const appt = await tx.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: { id: true, clientId: true, serviceId: true },
    });
    if (!appt) {
      // Defensive — covered by the answer lookup above unless soft-delete
      // raced us.
      throw new InvalidTriageReferenceError(
        'appointmentId',
        'Appointment not found.',
      );
    }

    const renderedBody = body.body ?? renderAnswerForNote(answer);

    const note = await tx.clientNote.create({
      data: {
        tenantId,
        clientId: appt.clientId,
        category: body.category,
        priority: body.alertTriggers && body.alertTriggers.length > 0
          ? 'alert'
          : 'normal',
        title: body.title ?? null,
        body: renderedBody,
        appointmentId,
        serviceId: appt.serviceId,
        // Author is the admin/staff doing the promotion. Same convention
        // as S4a — authorType='admin' for all admin-app callers until
        // the staff-app PR adds Staff.userId linkage.
        authorType: 'admin',
        authorUserId: actorUserId,
        sourceSurface: 'appointment_detail',
        visibility: 'location',
        customerVisible: false,
        alertTriggers: body.alertTriggers ?? [],
        pinned: body.pinned ?? false,
      },
    });

    await writeAudit(tx, {
      tenantId,
      actorUserId,
      action: 'client_note.promoted_from_answer',
      entityType: 'client_note',
      entityId: note.id,
      before: answer,
      after: note,
    });

    return { note };
  });
}
