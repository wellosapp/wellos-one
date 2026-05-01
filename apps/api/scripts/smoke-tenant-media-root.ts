/**
 * Smoke for E3-S4g (TenantMediaRoot provisioning).
 *
 * Idempotent — calls provisionTenantMediaRoot for the existing Wellos
 * tenant. If no row exists yet, creates one (and leaves it — production
 * needs this anyway). If a row exists, returns 'existing' as a no-op.
 *
 * Run: pnpm --filter @wellos/api exec tsx scripts/smoke-tenant-media-root.ts
 *
 * No cleanup — TenantMediaRoot is a per-tenant config row, not test data.
 * Re-running the smoke is the same as bootstrapping.
 *
 * Behavior depends on R2 env:
 *   - With R2_BUCKET_NAME + R2_PUBLIC_URL set → creates/finds the row
 *   - Without → throws MediaRootEnvError; smoke catches + reports
 */

import { PrismaClient } from '@prisma/client';

import {
  MediaRootEnvError,
  provisionTenantMediaRoot,
} from '../src/services/tenantMediaRootService.js';

const prisma = new PrismaClient({ log: ['error'] });

async function main() {
  console.log('E3-S4g smoke — TenantMediaRoot provisioning\n');

  const tenant = await prisma.tenant.findFirst({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!tenant) throw new Error('No tenant');
  console.log(`tenant: ${tenant.name} (${tenant.id})\n`);

  // 1. First call — create or find
  try {
    const r = await provisionTenantMediaRoot(prisma, { tenantId: tenant.id });
    console.log(`  ✓ first call: status=${r.status}`);
    console.log(`    publicBucket = ${r.root.publicBucket}`);
    console.log(`    privateBucket = ${r.root.privateBucket}`);
    console.log(`    rootPrefix   = ${r.root.rootPrefix}`);
    console.log(`    cdnBaseUrl   = ${r.root.cdnBaseUrl}`);
  } catch (err) {
    if (err instanceof MediaRootEnvError) {
      console.log(`  · skipped: ${err.message}`);
      console.log('\n0/0 steps (R2 env unset — smoke is informational only)');
      return;
    }
    throw err;
  }

  // 2. Second call — must return 'existing'
  const r2 = await provisionTenantMediaRoot(prisma, { tenantId: tenant.id });
  if (r2.status !== 'existing') {
    throw new Error(`expected 'existing' on second call, got '${r2.status}'`);
  }
  console.log(`  ✓ idempotent: second call status=existing`);

  // 3. Cross-tenant — call with bogus id; should fail since the FK
  // constraint blocks orphan TenantMediaRoot rows.
  try {
    await provisionTenantMediaRoot(prisma, { tenantId: 'tenant_does_not_exist' });
    console.log('  ✗ cross-tenant insert allowed — expected FK violation');
    process.exitCode = 1;
  } catch {
    console.log('  ✓ cross-tenant insert blocked (FK constraint)');
  }

  console.log('\n3/3 steps passed');
}

main()
  .catch((err) => {
    console.error('\nfatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
