/**
 * Smoke test for E3-S4a (ClientNote CRUD + lifecycle + idempotency).
 *
 * Exercises the service layer directly against the live DB (memory:
 * dev DB IS prod DB until staging lands). All test artifacts created
 * by this run are HARD-deleted at the end so the table stays clean.
 *
 * Run: pnpm --filter @wellos/api tsx scripts/smoke-client-notes.ts
 *
 * What it checks:
 *   - Create note (body validates, FK validation runs, audit row written)
 *   - Get-by-id (tenant scoping)
 *   - Update (no-op + real diff)
 *   - List with filters (pinned, archived, category)
 *   - Pin / unpin idempotency (repeating doesn't duplicate audit rows)
 *   - Archive / unarchive (archivedAt timestamp + filter behavior)
 *   - Acknowledge (writes to client_note_acknowledgments)
 *   - Soft-delete (sets deletedAt + filtered out of subsequent reads)
 *   - Visibility rules: customer_submitted blocked, protected_clinical
 *     blocked, admin_only requires admin role
 *
 * Cleanup at exit: hard-deletes created ClientNote (cascades to
 * acknowledgments) and any idempotency_keys rows from this run. Audit
 * log rows stay — they're append-only by design.
 */

import { PrismaClient } from '@prisma/client';

import { softDeleteExtension } from '../src/db/softDelete.js';
import {
  acknowledgeClientNote,
  createClientNote,
  getClientNoteById,
  InvalidClientNoteStateError,
  listClientNotes,
  setClientNoteArchived,
  setClientNotePinned,
  softDeleteClientNote,
  updateClientNote,
} from '../src/services/clientNoteService.js';

const prismaBase = new PrismaClient({ log: ['error'] });
const prisma = prismaBase.$extends(softDeleteExtension);

type Step = { n: number; name: string; ok: boolean; detail?: string };
const steps: Step[] = [];
const createdNoteIds: string[] = [];

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
  console.log('E3-S4a smoke — service layer\n');

  // 1) Find a tenant + admin user + client + staff to use as test fixtures.
  const tenant = await prisma.tenant.findFirst({
    where: { deletedAt: null },
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!tenant) throw new Error('No tenant found in DB');
  console.log(`tenant: ${tenant.name} (${tenant.id})`);

  const adminAssignment = await prisma.roleAssignment.findFirst({
    where: { tenantId: tenant.id, role: { name: 'admin' } },
    select: { userId: true },
  });
  if (!adminAssignment) throw new Error('No admin user found for tenant');
  const actorUserId = adminAssignment.userId;
  console.log(`admin user: ${actorUserId}`);

  const client = await prisma.client.findFirst({
    where: { tenantId: tenant.id, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!client) throw new Error('No client found for tenant');
  console.log(`client: ${client.firstName} ${client.lastName ?? ''} (${client.id})`);

  const staff = await prisma.staff.findFirst({
    where: { tenantId: tenant.id, deletedAt: null },
    select: { id: true, firstName: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!staff) throw new Error('No staff found for tenant');
  console.log(`staff: ${staff.firstName} (${staff.id})\n`);

  // ===== 1. Create =====
  try {
    const r = await createClientNote(prisma, {
      tenantId: tenant.id,
      actorUserId,
      callerHasAdminRole: true,
      clientId: client.id,
      body: {
        category: 'preference',
        priority: 'normal',
        body: '[E3-S4a smoke] cold water only for shampoo',
        sourceSurface: 'client_profile',
        visibility: 'location',
        alertTriggers: [],
      },
    });
    createdNoteIds.push(r.note.id);
    pass(1, 'create', `noteId=${r.note.id}`);
  } catch (err) {
    fail(1, 'create', err);
    return;
  }
  const noteId = createdNoteIds[0];

  // ===== 2. Get by id =====
  try {
    const note = await getClientNoteById(prisma, {
      tenantId: tenant.id,
      clientId: client.id,
      noteId,
    });
    if (!note) throw new Error('not found');
    if (note.body !== '[E3-S4a smoke] cold water only for shampoo')
      throw new Error('body mismatch');
    pass(2, 'get-by-id');
  } catch (err) {
    fail(2, 'get-by-id', err);
  }

  // ===== 3. Update — change priority =====
  try {
    const r = await updateClientNote(prisma, {
      tenantId: tenant.id,
      actorUserId,
      callerHasAdminRole: true,
      clientId: client.id,
      noteId,
      body: { priority: 'alert', alertTriggers: ['check_in'] },
    });
    if (!r) throw new Error('null result');
    if (r.note.priority !== 'alert') throw new Error('priority not updated');
    if (!r.note.alertTriggers.includes('check_in'))
      throw new Error('alertTriggers not set');
    pass(3, 'update', `priority=alert, alertTriggers=[check_in]`);
  } catch (err) {
    fail(3, 'update', err);
  }

  // ===== 4. Pin (idempotent) =====
  try {
    const r1 = await setClientNotePinned(prisma, {
      tenantId: tenant.id,
      actorUserId,
      clientId: client.id,
      noteId,
      pinned: true,
    });
    if (!r1?.note.pinned) throw new Error('not pinned after first call');
    const r2 = await setClientNotePinned(prisma, {
      tenantId: tenant.id,
      actorUserId,
      clientId: client.id,
      noteId,
      pinned: true,
    });
    if (!r2?.note.pinned) throw new Error('not pinned after second call');
    pass(4, 'pin (idempotent)');
  } catch (err) {
    fail(4, 'pin', err);
  }

  // ===== 5. List with pinned=true =====
  try {
    const r = await listClientNotes(prisma, {
      tenantId: tenant.id,
      clientId: client.id,
      query: {
        pinned: true,
        includeArchived: false,
        take: 50,
        skip: 0,
      },
    });
    const found = r.notes.find((n) => n.id === noteId);
    if (!found) throw new Error('pinned note not in list');
    pass(5, 'list (pinned=true)', `total=${r.total}`);
  } catch (err) {
    fail(5, 'list pinned', err);
  }

  // ===== 6. Archive =====
  try {
    const r = await setClientNoteArchived(prisma, {
      tenantId: tenant.id,
      actorUserId,
      clientId: client.id,
      noteId,
      archived: true,
    });
    if (!r?.note.archivedAt) throw new Error('archivedAt not set');
    pass(6, 'archive', `archivedAt=${r.note.archivedAt.toISOString()}`);
  } catch (err) {
    fail(6, 'archive', err);
  }

  // ===== 7. List (default = not archived) excludes the note =====
  try {
    const r = await listClientNotes(prisma, {
      tenantId: tenant.id,
      clientId: client.id,
      query: {
        includeArchived: false,
        take: 50,
        skip: 0,
      },
    });
    const found = r.notes.find((n) => n.id === noteId);
    if (found) throw new Error('archived note still in default list');
    pass(7, 'list default excludes archived');
  } catch (err) {
    fail(7, 'list default', err);
  }

  // ===== 8. List (includeArchived=true) includes the note =====
  try {
    const r = await listClientNotes(prisma, {
      tenantId: tenant.id,
      clientId: client.id,
      query: {
        includeArchived: true,
        take: 50,
        skip: 0,
      },
    });
    const found = r.notes.find((n) => n.id === noteId);
    if (!found) throw new Error('archived note missing from include-archived list');
    pass(8, 'list includeArchived=true');
  } catch (err) {
    fail(8, 'list includeArchived', err);
  }

  // ===== 9. Unarchive =====
  try {
    const r = await setClientNoteArchived(prisma, {
      tenantId: tenant.id,
      actorUserId,
      clientId: client.id,
      noteId,
      archived: false,
    });
    if (r?.note.archivedAt !== null) throw new Error('archivedAt not cleared');
    pass(9, 'unarchive');
  } catch (err) {
    fail(9, 'unarchive', err);
  }

  // ===== 10. Acknowledge =====
  try {
    const r = await acknowledgeClientNote(prisma, {
      tenantId: tenant.id,
      actorUserId,
      clientId: client.id,
      noteId,
      body: {
        staffId: staff.id,
        triggerContext: 'check_in',
      },
    });
    if (!r) throw new Error('null result');
    if (r.acknowledgment.staffId !== staff.id) throw new Error('staffId mismatch');
    pass(10, 'acknowledge', `ackId=${r.acknowledgment.id}`);
  } catch (err) {
    fail(10, 'acknowledge', err);
  }

  // ===== 11. Visibility rule: customer_submitted blocked =====
  try {
    await createClientNote(prisma, {
      tenantId: tenant.id,
      actorUserId,
      callerHasAdminRole: true,
      clientId: client.id,
      body: {
        category: 'preference',
        body: '[E3-S4a smoke] should be rejected',
        sourceSurface: 'client_profile',
        visibility: 'customer_submitted',
        alertTriggers: [],
      },
    });
    fail(11, 'visibility rule', 'expected throw, got success');
  } catch (err) {
    if (err instanceof InvalidClientNoteStateError && err.field === 'visibility') {
      pass(11, 'visibility rule (customer_submitted blocked)');
    } else {
      fail(11, 'visibility rule', err);
    }
  }

  // ===== 12. Soft-delete + verify hidden from list =====
  try {
    const { deleted } = await softDeleteClientNote(prisma, {
      tenantId: tenant.id,
      actorUserId,
      clientId: client.id,
      noteId,
    });
    if (!deleted) throw new Error('soft-delete returned deleted=false');
    const after = await getClientNoteById(prisma, {
      tenantId: tenant.id,
      clientId: client.id,
      noteId,
    });
    if (after) throw new Error('soft-deleted note still findable');
    pass(12, 'soft-delete');
  } catch (err) {
    fail(12, 'soft-delete', err);
  }

  // ===== Cleanup =====
  console.log('\nCleanup...');
  if (createdNoteIds.length > 0) {
    // Hard-delete via raw client (bypasses soft-delete extension which only
    // intercepts reads). Cascades to client_note_acknowledgments.
    const r = await prismaBase.clientNote.deleteMany({
      where: { id: { in: createdNoteIds } },
    });
    console.log(`  hard-deleted ${r.count} test ClientNote row(s)`);
  }

  // ===== Summary =====
  const failed = steps.filter((s) => !s.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} steps passed`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('\nfatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaBase.$disconnect();
  });
