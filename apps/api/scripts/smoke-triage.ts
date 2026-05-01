/**
 * Smoke test for E3-S4d (triage questions + answers + promote-to-note).
 *
 * Exercises the service layer against the live DB. Creates a question,
 * inserts an answer directly via prisma (since S4d only owns the admin
 * surface — public booking ingestion is a later epic), promotes the
 * answer to a note, then hard-deletes everything.
 *
 * Run: pnpm --filter @wellos/api exec tsx scripts/smoke-triage.ts
 */

import { PrismaClient } from '@prisma/client';

import { softDeleteExtension } from '../src/db/softDelete.js';
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
} from '../src/services/triageService.js';

const prismaBase = new PrismaClient({ log: ['error'] });
const prisma = prismaBase.$extends(softDeleteExtension);

type Step = { n: number; name: string; ok: boolean; detail?: string };
const steps: Step[] = [];
const created: { questionIds: string[]; answerIds: string[]; noteIds: string[] } = {
  questionIds: [],
  answerIds: [],
  noteIds: [],
};

function pass(n: number, name: string, detail?: string): void {
  steps.push({ n, name, ok: true, detail });
  console.log(`  ✓ [${n}] ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(n: number, name: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  steps.push({ n, name, ok: false, detail: msg });
  console.log(`  ✗ [${n}] ${name} — ${msg}`);
}

async function main(): Promise<void> {
  console.log('E3-S4d smoke — service layer\n');

  const tenant = await prisma.tenant.findFirst({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!tenant) throw new Error('No tenant');
  console.log(`tenant: ${tenant.name} (${tenant.id})`);

  const service = await prisma.service.findFirst({
    where: { tenantId: tenant.id, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!service) throw new Error('No service');
  console.log(`service: ${service.name} (${service.id})`);

  const adminAssignment = await prisma.roleAssignment.findFirst({
    where: { tenantId: tenant.id, role: { name: 'admin' } },
    select: { userId: true },
  });
  if (!adminAssignment) throw new Error('No admin user');
  const actorUserId = adminAssignment.userId;
  console.log(`admin: ${actorUserId}`);

  const appointment = await prisma.appointment.findFirst({
    where: { tenantId: tenant.id, serviceId: service.id, deletedAt: null },
    select: { id: true, clientId: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!appointment) throw new Error('No appointment for that service');
  console.log(`appointment: ${appointment.id}\n`);

  const uniqueKey = `smoke_pressure_${Date.now()}`;

  // ===== 1. Create question (chips_single) =====
  try {
    const r = await createBookingQuestion(prisma, {
      tenantId: tenant.id,
      actorUserId,
      serviceId: service.id,
      body: {
        questionKey: uniqueKey,
        questionLabel: '[E3-S4d smoke] Pressure preference',
        questionType: 'chips_single',
        options: [
          { value: 'light', label: 'Light' },
          { value: 'medium', label: 'Medium' },
          { value: 'firm', label: 'Firm' },
        ],
        isRequired: true,
        displayOrder: 99,
      },
    });
    created.questionIds.push(r.question.id);
    pass(1, 'create question', `questionId=${r.question.id}`);
  } catch (err) {
    fail(1, 'create question', err);
    return;
  }
  const questionId = created.questionIds[0];

  // ===== 2. Create duplicate questionKey → InvalidTriageReferenceError =====
  try {
    await createBookingQuestion(prisma, {
      tenantId: tenant.id,
      actorUserId,
      serviceId: service.id,
      body: {
        questionKey: uniqueKey,
        questionLabel: 'Dup',
        questionType: 'short_text',
        options: [],
      },
    });
    fail(2, 'duplicate key blocked', 'expected throw, got success');
  } catch (err) {
    if (
      err instanceof InvalidTriageReferenceError &&
      err.field === 'questionKey'
    ) {
      pass(2, 'duplicate key blocked');
    } else {
      fail(2, 'duplicate key blocked', err);
    }
  }

  // ===== 3. Update question =====
  try {
    const r = await updateBookingQuestion(prisma, {
      tenantId: tenant.id,
      actorUserId,
      serviceId: service.id,
      questionId,
      body: { questionLabel: '[E3-S4d smoke] Pressure preference (v2)' },
    });
    if (!r || !r.question.questionLabel.includes('v2'))
      throw new Error('label not updated');
    pass(3, 'update question');
  } catch (err) {
    fail(3, 'update question', err);
  }

  // ===== 4. Update with invalid options shape =====
  try {
    await updateBookingQuestion(prisma, {
      tenantId: tenant.id,
      actorUserId,
      serviceId: service.id,
      questionId,
      body: { questionType: 'slider', options: { min: 10, max: 5 } }, // min > max
    });
    fail(4, 'options validation', 'expected throw, got success');
  } catch (err) {
    if (err instanceof InvalidTriageStateError && err.field === 'options') {
      pass(4, 'options validation (slider min<max)');
    } else {
      fail(4, 'options validation', err);
    }
  }

  // ===== 5. List questions =====
  try {
    const r = await listBookingQuestions(prisma, {
      tenantId: tenant.id,
      serviceId: service.id,
    });
    const found = r.questions.find((q) => q.id === questionId);
    if (!found) throw new Error('created question missing from list');
    pass(5, 'list questions', `total=${r.questions.length}`);
  } catch (err) {
    fail(5, 'list questions', err);
  }

  // ===== 6. Get by id =====
  try {
    const q = await getBookingQuestionById(prisma, {
      tenantId: tenant.id,
      serviceId: service.id,
      questionId,
    });
    if (!q) throw new Error('not found');
    pass(6, 'get-by-id');
  } catch (err) {
    fail(6, 'get-by-id', err);
  }

  // ===== 7. Insert an answer directly (simulates public-booking ingestion) =====
  let answerId: string | null = null;
  try {
    const a = await prismaBase.appointmentBookingAnswer.create({
      data: {
        tenantId: tenant.id,
        appointmentId: appointment.id,
        questionId,
        questionKeySnapshot: uniqueKey,
        questionLabelSnapshot: '[E3-S4d smoke] Pressure preference',
        questionTypeSnapshot: 'chips_single',
        answerValue: 'medium',
      },
    });
    answerId = a.id;
    created.answerIds.push(a.id);
    pass(7, 'seed answer (direct prisma)', `answerId=${a.id}`);
  } catch (err) {
    fail(7, 'seed answer', err);
  }

  // ===== 8. List answers for appointment =====
  try {
    const r = await listBookingAnswersForAppointment(prisma, {
      tenantId: tenant.id,
      appointmentId: appointment.id,
    });
    if (!r) throw new Error('null result');
    if (!r.answers.find((x) => x.id === answerId))
      throw new Error('seeded answer missing');
    pass(8, 'list answers', `total=${r.answers.length}`);
  } catch (err) {
    fail(8, 'list answers', err);
  }

  // ===== 9. Promote answer to note =====
  if (answerId) {
    try {
      const r = await promoteAnswerToNote(prisma, {
        tenantId: tenant.id,
        actorUserId,
        appointmentId: appointment.id,
        answerId,
        body: {
          category: 'preference',
          pinned: true,
        },
      });
      if (!r) throw new Error('null result');
      created.noteIds.push(r.note.id);
      pass(
        9,
        'promote-to-note',
        `noteId=${r.note.id}, body="${r.note.body}"`,
      );
    } catch (err) {
      fail(9, 'promote-to-note', err);
    }
  }

  // ===== 10. Cross-tenant promote → null =====
  if (answerId) {
    try {
      const r = await promoteAnswerToNote(prisma, {
        tenantId: 'tenant_does_not_exist',
        actorUserId,
        appointmentId: appointment.id,
        answerId,
        body: { category: 'preference' },
      });
      if (r !== null) throw new Error('expected null');
      pass(10, 'cross-tenant promote returns null');
    } catch (err) {
      fail(10, 'cross-tenant promote', err);
    }
  }

  // ===== 11. Soft-delete question =====
  try {
    const r = await softDeleteBookingQuestion(prisma, {
      tenantId: tenant.id,
      actorUserId,
      serviceId: service.id,
      questionId,
    });
    if (!r.deleted) throw new Error('returned deleted=false');
    pass(11, 'soft-delete question');
  } catch (err) {
    fail(11, 'soft-delete question', err);
  }

  // ===== Cleanup =====
  console.log('\nCleanup...');
  if (created.noteIds.length > 0) {
    const r = await prismaBase.clientNote.deleteMany({
      where: { id: { in: created.noteIds } },
    });
    console.log(`  hard-deleted ${r.count} test ClientNote row(s)`);
  }
  if (created.answerIds.length > 0) {
    const r = await prismaBase.appointmentBookingAnswer.deleteMany({
      where: { id: { in: created.answerIds } },
    });
    console.log(`  hard-deleted ${r.count} test AppointmentBookingAnswer row(s)`);
  }
  if (created.questionIds.length > 0) {
    const r = await prismaBase.serviceBookingQuestion.deleteMany({
      where: { id: { in: created.questionIds } },
    });
    console.log(`  hard-deleted ${r.count} test ServiceBookingQuestion row(s)`);
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} steps passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('\nfatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaBase.$disconnect();
  });
