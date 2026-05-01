/**
 * Smoke for E3-S4e (ServiceContentDelivery CRUD).
 *
 * Run: pnpm --filter @wellos/api exec tsx scripts/smoke-content-deliveries.ts
 *
 * Hard-deletes the test row at the end. audit_log rows stay (append-only).
 */

import { PrismaClient } from '@prisma/client';

import { softDeleteExtension } from '../src/db/softDelete.js';
import {
  InvalidContentDeliveryReferenceError,
  createContentDelivery,
  getContentDeliveryById,
  listContentDeliveries,
  softDeleteContentDelivery,
  updateContentDelivery,
} from '../src/services/contentDeliveriesService.js';

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
  console.log('E3-S4e smoke — service layer\n');

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
  if (!adminAssignment) throw new Error('No admin');
  const actorUserId = adminAssignment.userId;
  console.log(`admin: ${actorUserId}\n`);

  let deliveryId: string | null = null;

  // 1. Create — prep + sms, 24h before
  try {
    const r = await createContentDelivery(prisma, {
      tenantId: tenant.id,
      actorUserId,
      serviceId: service.id,
      body: {
        deliveryType: 'prep',
        channel: 'sms',
        scheduleOffsetMinutes: -1440,
        templateOverrideMarkdown: '[E3-S4e smoke] Custom prep template',
      },
    });
    deliveryId = r.delivery.id;
    created.push(r.delivery.id);
    pass('create prep+sms', `id=${r.delivery.id}`);
  } catch (err) {
    fail('create prep+sms', err);
    return;
  }

  // 2. Duplicate (same service+type+channel) → 400
  try {
    await createContentDelivery(prisma, {
      tenantId: tenant.id,
      actorUserId,
      serviceId: service.id,
      body: {
        deliveryType: 'prep',
        channel: 'sms',
        scheduleOffsetMinutes: -120,
      },
    });
    fail('duplicate blocked', 'expected throw');
  } catch (err) {
    if (
      err instanceof InvalidContentDeliveryReferenceError &&
      err.field === 'duplicate'
    ) {
      pass('duplicate (service, type, channel) blocked');
    } else {
      fail('duplicate blocked', err);
    }
  }

  // 3. Create different channel — same service+type, channel=email — succeeds
  try {
    const r = await createContentDelivery(prisma, {
      tenantId: tenant.id,
      actorUserId,
      serviceId: service.id,
      body: {
        deliveryType: 'prep',
        channel: 'email',
        scheduleOffsetMinutes: -2880,
      },
    });
    created.push(r.delivery.id);
    pass('create prep+email (different channel ok)', `id=${r.delivery.id}`);
  } catch (err) {
    fail('create prep+email', err);
  }

  // 4. List
  try {
    const r = await listContentDeliveries(prisma, {
      tenantId: tenant.id,
      serviceId: service.id,
    });
    if (r.deliveries.length < 2)
      throw new Error(`expected ≥2, got ${r.deliveries.length}`);
    pass('list', `count=${r.deliveries.length}`);
  } catch (err) {
    fail('list', err);
  }

  // 5. Get-by-id
  try {
    if (!deliveryId) throw new Error('no deliveryId');
    const d = await getContentDeliveryById(prisma, {
      tenantId: tenant.id,
      serviceId: service.id,
      deliveryId,
    });
    if (!d) throw new Error('not found');
    pass('get-by-id');
  } catch (err) {
    fail('get-by-id', err);
  }

  // 6. Update — flip isEnabled
  try {
    if (!deliveryId) throw new Error('no deliveryId');
    const r = await updateContentDelivery(prisma, {
      tenantId: tenant.id,
      actorUserId,
      serviceId: service.id,
      deliveryId,
      body: { isEnabled: false, scheduleOffsetMinutes: -720 },
    });
    if (!r || r.delivery.isEnabled !== false)
      throw new Error('isEnabled not flipped');
    if (r.delivery.scheduleOffsetMinutes !== -720)
      throw new Error('offset not updated');
    pass('update isEnabled + offset');
  } catch (err) {
    fail('update', err);
  }

  // 7. Update to collide — change channel to 'email' on prep — should hit P2002
  try {
    if (!deliveryId) throw new Error('no deliveryId');
    await updateContentDelivery(prisma, {
      tenantId: tenant.id,
      actorUserId,
      serviceId: service.id,
      deliveryId,
      body: { channel: 'email' },
    });
    fail('collision update blocked', 'expected throw');
  } catch (err) {
    if (
      err instanceof InvalidContentDeliveryReferenceError &&
      err.field === 'duplicate'
    ) {
      pass('collision update blocked');
    } else {
      fail('collision update blocked', err);
    }
  }

  // 8. Soft-delete
  try {
    if (!deliveryId) throw new Error('no deliveryId');
    const r = await softDeleteContentDelivery(prisma, {
      tenantId: tenant.id,
      actorUserId,
      serviceId: service.id,
      deliveryId,
    });
    if (!r.deleted) throw new Error('returned deleted=false');
    pass('soft-delete');
  } catch (err) {
    fail('soft-delete', err);
  }

  // Cleanup
  console.log('\nCleanup...');
  if (created.length > 0) {
    const r = await prismaBase.serviceContentDelivery.deleteMany({
      where: { id: { in: created } },
    });
    console.log(`  hard-deleted ${r.count} test row(s)`);
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
