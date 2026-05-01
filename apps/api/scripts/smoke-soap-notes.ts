/**
 * Smoke for E3-S4f (SOAP notes + lock/revise).
 *
 * Run: pnpm --filter @wellos/api exec tsx scripts/smoke-soap-notes.ts
 *
 * Hard-deletes the test note + all its revisions at the end.
 */

import { PrismaClient } from '@prisma/client';

import { softDeleteExtension } from '../src/db/softDelete.js';
import {
  InvalidSoapNoteStateError,
  createSoapNote,
  getSoapNoteById,
  listSoapNoteRevisions,
  listSoapNotesForAppointment,
  lockSoapNote,
  reviseSoapNote,
  softDeleteSoapNote,
  updateSoapNote,
} from '../src/services/soapNotesService.js';

const prismaBase = new PrismaClient({ log: ['error'] });
const prisma = prismaBase.$extends(softDeleteExtension);

const created: string[] = [];
const steps: { ok: boolean; name: string; detail?: string }[] = [];
function pass(name: string, detail?: string) {
  steps.push({ ok: true, name, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  steps.push({ ok: false, name, detail: msg });
  console.log(`  ✗ ${name} — ${msg}`);
}

async function main() {
  console.log('E3-S4f smoke — service layer\n');

  const tenant = await prisma.tenant.findFirst({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!tenant) throw new Error('No tenant');
  console.log(`tenant: ${tenant.name} (${tenant.id})`);

  const adminAssignment = await prisma.roleAssignment.findFirst({
    where: { tenantId: tenant.id, role: { name: 'admin' } },
    select: { userId: true },
  });
  if (!adminAssignment) throw new Error('No admin user');
  const actorUserId = adminAssignment.userId;
  console.log(`admin: ${actorUserId}`);

  const appointment = await prisma.appointment.findFirst({
    where: { tenantId: tenant.id, deletedAt: null },
    select: { id: true, clientId: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!appointment) throw new Error('No appointment');
  console.log(`appointment: ${appointment.id}`);

  const staff = await prisma.staff.findFirst({
    where: { tenantId: tenant.id, deletedAt: null },
    select: { id: true, firstName: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!staff) throw new Error('No staff');
  console.log(`staff: ${staff.firstName} (${staff.id})\n`);

  let noteId: string | null = null;

  // 1. Create
  try {
    const r = await createSoapNote(prisma, {
      tenantId: tenant.id,
      actorUserId,
      appointmentId: appointment.id,
      body: {
        authorStaffId: staff.id,
        subjective: '[smoke] Client reports neck tightness',
        objective: '[smoke] ROM limited to 60°',
        assessment: '[smoke] Cervical strain',
        plan: '[smoke] 3x/week, stretches at home',
      },
    });
    noteId = r.note.id;
    created.push(r.note.id);
    pass('create', `noteId=${r.note.id}`);
  } catch (err) {
    fail('create', err);
    return;
  }

  // 2. PATCH while unlocked — succeeds
  try {
    if (!noteId) throw new Error('no noteId');
    const r = await updateSoapNote(prisma, {
      tenantId: tenant.id,
      actorUserId,
      appointmentId: appointment.id,
      noteId,
      body: {
        subjective: '[smoke v2] Client reports neck tightness + headache',
      },
    });
    if (!r || !r.note.subjective?.includes('v2'))
      throw new Error('subjective not updated');
    pass('PATCH unlocked');
  } catch (err) {
    fail('PATCH unlocked', err);
  }

  // 3. List for appointment
  try {
    const r = await listSoapNotesForAppointment(prisma, {
      tenantId: tenant.id,
      appointmentId: appointment.id,
    });
    if (!r) throw new Error('null result');
    if (!r.notes.find((n) => n.id === noteId))
      throw new Error('created note missing');
    pass('list for appointment', `count=${r.notes.length}`);
  } catch (err) {
    fail('list', err);
  }

  // 4. Get-by-id
  try {
    if (!noteId) throw new Error('no noteId');
    const n = await getSoapNoteById(prisma, {
      tenantId: tenant.id,
      appointmentId: appointment.id,
      noteId,
    });
    if (!n) throw new Error('not found');
    pass('get-by-id');
  } catch (err) {
    fail('get-by-id', err);
  }

  // 5. Lock
  try {
    if (!noteId) throw new Error('no noteId');
    const r = await lockSoapNote(prisma, {
      tenantId: tenant.id,
      actorUserId,
      appointmentId: appointment.id,
      noteId,
      body: { staffId: staff.id },
    });
    if (!r || !r.note.locked) throw new Error('not locked');
    if (!r.note.lockedAt) throw new Error('lockedAt not set');
    if (r.note.lockedByStaffId !== staff.id)
      throw new Error('lockedByStaffId mismatch');
    pass('lock');
  } catch (err) {
    fail('lock', err);
  }

  // 6. Lock again (idempotent)
  try {
    if (!noteId) throw new Error('no noteId');
    const r = await lockSoapNote(prisma, {
      tenantId: tenant.id,
      actorUserId,
      appointmentId: appointment.id,
      noteId,
      body: { staffId: staff.id },
    });
    if (!r) throw new Error('null on retry');
    pass('lock idempotent');
  } catch (err) {
    fail('lock idempotent', err);
  }

  // 7. PATCH while locked → 409
  try {
    if (!noteId) throw new Error('no noteId');
    await updateSoapNote(prisma, {
      tenantId: tenant.id,
      actorUserId,
      appointmentId: appointment.id,
      noteId,
      body: { subjective: '[smoke v3] should be blocked' },
    });
    fail('PATCH blocked when locked', 'expected throw');
  } catch (err) {
    if (err instanceof InvalidSoapNoteStateError && err.field === 'locked') {
      pass('PATCH blocked when locked');
    } else {
      fail('PATCH blocked', err);
    }
  }

  // 8. Revise
  try {
    if (!noteId) throw new Error('no noteId');
    const r = await reviseSoapNote(prisma, {
      tenantId: tenant.id,
      actorUserId,
      appointmentId: appointment.id,
      noteId,
      body: {
        revisedByStaffId: staff.id,
        revisionReason: '[smoke] Updated ICD per supervising MD',
        assessment: '[smoke v3] Cervical strain + tension headache',
      },
    });
    if (!r) throw new Error('null result');
    if (r.revision.revisionNumber !== 1)
      throw new Error(`expected revisionNumber=1, got ${r.revision.revisionNumber}`);
    if (!r.note.assessment?.includes('v3'))
      throw new Error('main row not updated by revision');
    pass('revise', `revisionNumber=${r.revision.revisionNumber}`);
  } catch (err) {
    fail('revise', err);
  }

  // 9. Revise again — auto-increments
  try {
    if (!noteId) throw new Error('no noteId');
    const r = await reviseSoapNote(prisma, {
      tenantId: tenant.id,
      actorUserId,
      appointmentId: appointment.id,
      noteId,
      body: {
        revisedByStaffId: staff.id,
        revisionReason: '[smoke] Add CPT code',
        plan: '[smoke v4] Add modality 97140',
      },
    });
    if (!r || r.revision.revisionNumber !== 2)
      throw new Error(`expected revisionNumber=2, got ${r?.revision.revisionNumber}`);
    pass('revise again', `revisionNumber=${r.revision.revisionNumber}`);
  } catch (err) {
    fail('revise again', err);
  }

  // 10. List revisions
  try {
    if (!noteId) throw new Error('no noteId');
    const r = await listSoapNoteRevisions(prisma, {
      tenantId: tenant.id,
      noteId,
    });
    if (!r) throw new Error('null result');
    if (r.revisions.length !== 2)
      throw new Error(`expected 2 revisions, got ${r.revisions.length}`);
    pass('list revisions', `count=${r.revisions.length}`);
  } catch (err) {
    fail('list revisions', err);
  }

  // 11. Soft-delete
  try {
    if (!noteId) throw new Error('no noteId');
    const r = await softDeleteSoapNote(prisma, {
      tenantId: tenant.id,
      actorUserId,
      appointmentId: appointment.id,
      noteId,
    });
    if (!r.deleted) throw new Error('returned deleted=false');
    pass('soft-delete');
  } catch (err) {
    fail('soft-delete', err);
  }

  // Cleanup — hard-delete the note (cascades to revisions per FK).
  console.log('\nCleanup...');
  if (created.length > 0) {
    const r = await prismaBase.soapNote.deleteMany({
      where: { id: { in: created } },
    });
    console.log(`  hard-deleted ${r.count} test SoapNote row(s) (revisions cascade)`);
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
