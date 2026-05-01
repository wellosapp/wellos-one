/**
 * Smoke test for E3-S4b (linked records aggregator + client timeline).
 *
 * Read-only — no DB writes, no cleanup needed. Picks an existing appointment
 * + client from the live DB and exercises both aggregator endpoints.
 *
 * Run: pnpm --filter @wellos/api exec tsx scripts/smoke-linked-records.ts
 */

import { PrismaClient } from '@prisma/client';

import { softDeleteExtension } from '../src/db/softDelete.js';
import {
  getAppointmentLinkedRecords,
  getClientTimeline,
} from '../src/services/linkedRecordsService.js';

const prismaBase = new PrismaClient({ log: ['error'] });
const prisma = prismaBase.$extends(softDeleteExtension);

async function main(): Promise<void> {
  console.log('E3-S4b smoke — service layer\n');

  const tenant = await prisma.tenant.findFirst({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!tenant) throw new Error('No tenant');
  console.log(`tenant: ${tenant.name} (${tenant.id})`);

  const appt = await prisma.appointment.findFirst({
    where: { tenantId: tenant.id, deletedAt: null },
    select: { id: true, clientId: true, scheduledStartAt: true },
    orderBy: { scheduledStartAt: 'desc' },
  });
  if (!appt) throw new Error('No appointment');
  console.log(`appointment: ${appt.id} (${appt.scheduledStartAt.toISOString()})`);
  console.log(`client: ${appt.clientId}\n`);

  // ===== 1. Linked records for the appointment =====
  console.log('  [1] getAppointmentLinkedRecords...');
  const linked = await getAppointmentLinkedRecords(prisma, {
    tenantId: tenant.id,
    appointmentId: appt.id,
  });
  if (!linked) throw new Error('Linked records returned null');
  console.log(`    appointment.id      = ${linked.appointment.id}`);
  console.log(`    client              = ${linked.appointment.client.firstName}`);
  console.log(`    service             = ${linked.appointment.service.name}`);
  console.log(`    staff               = ${linked.appointment.staff.firstName}`);
  console.log(`    clientAlerts        = ${linked.clientAlerts.length}`);
  console.log(`    pinnedClientNotes   = ${linked.pinnedClientNotes.length}`);
  console.log(`    serviceNotes        = ${linked.serviceNotes.length}`);
  console.log(`    appointmentNotes    = ${linked.appointmentNotes.length}`);
  console.log(`    bookingAnswers      = ${linked.bookingAnswers.length} (S4d will populate)`);
  console.log(`    referenceFiles      = ${linked.referenceFiles.length} (S4c will populate)`);
  console.log(`    soapNote            = ${linked.soapNote ? 'present' : 'null'} (S4f will populate)`);

  // ===== 2. Linked records for a non-existent appointment → null =====
  console.log('\n  [2] getAppointmentLinkedRecords with bogus id...');
  const missing = await getAppointmentLinkedRecords(prisma, {
    tenantId: tenant.id,
    appointmentId: 'apt_does_not_exist',
  });
  if (missing !== null) throw new Error('Expected null for bogus id');
  console.log(`    null (correct)`);

  // ===== 3. Client timeline =====
  console.log('\n  [3] getClientTimeline...');
  const timeline = await getClientTimeline(prisma, {
    tenantId: tenant.id,
    clientId: appt.clientId,
    query: { take: 20, skip: 0 },
  });
  if (!timeline) throw new Error('Timeline returned null');
  console.log(`    client.firstName    = ${timeline.client.firstName}`);
  console.log(`    alerts              = ${timeline.alerts.length}`);
  console.log(`    visits              = ${timeline.visits.length} (total=${timeline.total})`);
  if (timeline.visits.length > 0) {
    const first = timeline.visits[0];
    console.log(`      visit[0].appointment.id = ${first.appointment.id}`);
    console.log(`      visit[0].service.name   = ${first.service.name}`);
    console.log(`      visit[0].staff.firstName= ${first.staff.firstName}`);
    console.log(`      visit[0].notes          = ${first.notes.length}`);
  }

  // ===== 4. Cross-tenant isolation =====
  console.log('\n  [4] cross-tenant isolation...');
  const otherTenantId = 'tenant_does_not_exist';
  const xt = await getAppointmentLinkedRecords(prisma, {
    tenantId: otherTenantId,
    appointmentId: appt.id,
  });
  if (xt !== null) throw new Error('Cross-tenant fetch should return null');
  console.log(`    null (correct)`);

  console.log('\n4/4 steps passed');
}

main()
  .catch((err) => {
    console.error('\nfatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaBase.$disconnect();
  });
