/**
 * Back-fill TenantMediaRoot rows for tenants that existed before E3-S4g.
 *
 * Idempotent — calls provisionTenantMediaRoot for every non-deleted
 * tenant. Skips tenants that already have a row.
 *
 * Run on: each environment that has tenants predating the S4g deploy.
 *   pnpm --filter @wellos/api exec tsx scripts/backfill-tenant-media-roots.ts
 *
 * Requires R2_BUCKET_NAME + R2_PUBLIC_URL in env. In production: load env
 * via Railway CLI:
 *   railway run --service @wellos/api pnpm --filter @wellos/api exec tsx \
 *     scripts/backfill-tenant-media-roots.ts
 */

import { PrismaClient } from '@prisma/client';

import {
  MediaRootEnvError,
  provisionTenantMediaRoot,
} from '../src/services/tenantMediaRootService.js';

const prisma = new PrismaClient({ log: ['error'] });

async function main(): Promise<void> {
  console.log('TenantMediaRoot back-fill\n');

  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Found ${tenants.length} active tenant(s).\n`);

  let created = 0;
  let existing = 0;

  for (const t of tenants) {
    try {
      const r = await provisionTenantMediaRoot(prisma, { tenantId: t.id });
      console.log(`  [${r.status}] ${t.name} (${t.slug}) — ${t.id}`);
      if (r.status === 'created') created++;
      else existing++;
    } catch (err) {
      if (err instanceof MediaRootEnvError) {
        console.error(`\nfatal: ${err.message}`);
        console.error(
          'Set the R2_* env vars and re-run. No tenants were modified.',
        );
        process.exitCode = 1;
        return;
      }
      throw err;
    }
  }

  console.log(`\nDone. created=${created} existing=${existing}`);
}

main()
  .catch((err) => {
    console.error('\nfatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
